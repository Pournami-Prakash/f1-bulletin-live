"""Validated OpenF1 fallback for pre-race inputs when live timing is unavailable."""
from collections import defaultdict
from functools import lru_cache
import math
import os
import re
import statistics
import time

import pandas as pd
import psycopg2
from psycopg2.extras import execute_values
import requests

BASE = 'https://api.openf1.org/v1'
_last_request = 0.


def get(endpoint, **params):
    global _last_request
    for attempt in range(4):
        # Public tier: at most 30 requests/minute, including retries.
        delay = 2.1 - (time.monotonic() - _last_request)
        if delay > 0:
            time.sleep(delay)
        response = requests.get(f'{BASE}/{endpoint}', params=params, timeout=30)
        _last_request = time.monotonic()
        if response.status_code == 429 and attempt < 3:
            time.sleep(min(60, max(5, float(response.headers.get('Retry-After', 5)))))
            continue
        response.raise_for_status()
        rows = response.json()
        if not isinstance(rows, list):
            raise RuntimeError(f'Invalid OpenF1 {endpoint} response')
        return rows


def qualifying_rows(results, drivers, season):
    roster = {d['driver_number']: d['name_acronym'] for d in drivers}
    expected = 22 if season == 2026 else 20
    if (len(roster) != expected or len(set(roster.values())) != expected
            or any(not isinstance(code, str) or not re.fullmatch(r'[A-Z]{3}', code)
                   for code in roster.values())):
        raise RuntimeError('OpenF1 qualifying driver roster is incomplete')
    if len(results) != expected or {r['driver_number'] for r in results} != set(roster):
        raise RuntimeError('OpenF1 qualifying results differ from driver roster')
    if sorted(r['position'] for r in results) != list(range(1, expected + 1)):
        raise RuntimeError('OpenF1 qualifying positions are incomplete')
    rows = []
    for result in results:
        durations = result.get('duration')
        if not isinstance(durations, list) or len(durations) != 3:
            raise RuntimeError('OpenF1 qualifying segment times unavailable')
        times = [round(t * 1000) if isinstance(t, (int, float)) and math.isfinite(t) and t > 0
                 else None for t in durations]
        best = next((t for t in reversed(times) if t is not None), None)
        rows.append((roster[result['driver_number']], *times, best, result['position']))
    pole = next(row[4] for row in rows if row[5] == 1)
    if pole is None or sum(row[4] is not None for row in rows) < 3:
        raise RuntimeError('OpenF1 qualifying times are incomplete')
    return [(code, q1, q2, q3, best, best - pole if best else None, position, None)
            for code, q1, q2, q3, best, position in rows]


@lru_cache(maxsize=4)
def qualifying_bundle(season, number):
    with psycopg2.connect(os.environ['NEON_DATABASE_URL'], connect_timeout=30) as connection:
        with connection.cursor() as cursor:
            cursor.execute('SELECT race_name, city, country, race_start_utc FROM race_calendar '
                           'WHERE season=%s AND round=%s', (season, number))
            calendar = cursor.fetchone()
    if not calendar or not calendar[3]:
        raise RuntimeError('Calendar race start unavailable for OpenF1 match')
    sessions = get('sessions', year=season, country_name=calendar[2])
    races = [s for s in sessions if s['session_name'] == 'Race'
             and s['location'].casefold() == calendar[1].casefold()
             and abs(pd.Timestamp(s['date_start']) - pd.Timestamp(calendar[3])) < pd.Timedelta(hours=24)]
    if len(races) != 1:
        raise RuntimeError('Cannot uniquely match OpenF1 race to calendar')
    weekend = [s for s in sessions if s['meeting_key'] == races[0]['meeting_key']]
    qualifying = [s for s in weekend if s['session_name'] == 'Qualifying' and not s.get('is_cancelled')]
    if len(qualifying) != 1 or pd.Timestamp(qualifying[0]['date_end']) > pd.Timestamp.now(tz='UTC'):
        raise RuntimeError('OpenF1 qualifying has not finished')
    session = qualifying[0]
    drivers = get('drivers', session_key=session['session_key'])
    results = get('session_result', session_key=session['session_key'])
    rows = qualifying_rows(results, drivers, season)
    return calendar, session, rows, weekend


def session_id(cursor, season, number, name, session, kind):
    cursor.execute('''INSERT INTO sessions (season, round, gp_name, circuit, date, session_type)
        VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT (season, round, session_type) DO UPDATE
        SET gp_name=EXCLUDED.gp_name, circuit=EXCLUDED.circuit, date=EXCLUDED.date RETURNING id''',
        (season, number, name, session['location'], pd.Timestamp(session['date_start']).date(), kind))
    return cursor.fetchone()[0]


def load_qualifying(season, number):
    calendar, session, rows, weekend = qualifying_bundle(season, number)
    with psycopg2.connect(os.environ['NEON_DATABASE_URL'], connect_timeout=30) as connection:
        with connection.cursor() as cursor:
            sid = session_id(cursor, season, number, calendar[0], session, 'Q')
            cursor.execute('DELETE FROM qualifying_laps WHERE session_id=%s', (sid,))
            execute_values(cursor, '''INSERT INTO qualifying_laps (session_id,driver_code,q1_ms,q2_ms,
                q3_ms,best_ms,gap_to_pole_ms,grid_position,tyre_compound) VALUES %s''',
                [(sid, *row) for row in rows])
    print(f'R{number}: OpenF1 qualifying imported ({len(rows)} drivers)', flush=True)
    # Optional inputs use independent transactions; unavailable readings never erase existing data.
    for item in [session] + [s for s in weekend if s['session_name'].startswith('Practice')]:
        try:
            load_optional(season, number, calendar[0], item)
        except Exception as error:
            print(f'R{number}: OpenF1 {item["session_name"]} optional inputs unavailable ({error})', flush=True)


def load_optional(season, number, name, session):
    if session.get('is_cancelled') or pd.Timestamp(session['date_end']) > pd.Timestamp.now(tz='UTC'):
        return
    key = session['session_key']
    is_quali = session['session_name'] == 'Qualifying'
    kind = 'Q' if is_quali else 'FP' + session['session_name'].split()[-1]
    rows = []
    if is_quali:
        data = get('weather', session_key=key)
        rows = [(i, r.get('air_temperature'), r.get('track_temperature'), r.get('humidity'),
                 r.get('wind_speed'), r.get('wind_direction'), bool(r['rainfall']) if r.get('rainfall') is not None else None)
                for i, r in enumerate(data, 1)]
    else:
        drivers = {d['driver_number']: d['name_acronym'] for d in get('drivers', session_key=key)}
        groups = defaultdict(list)
        for lap in get('laps', session_key=key):
            duration = lap.get('lap_duration')
            if lap['driver_number'] in drivers and isinstance(duration, (int, float)) and math.isfinite(duration) and duration > 0:
                groups[drivers[lap['driver_number']]].append(duration * 1000)
        rows = [(code, kind, round(min(times)), round(statistics.median(times)), len(times), None)
                for code, times in groups.items()]
    if not rows:
        return
    with psycopg2.connect(os.environ['NEON_DATABASE_URL'], connect_timeout=30) as connection:
        with connection.cursor() as cursor:
            sid = session_id(cursor, season, number, name, session, kind)
            table = 'weather' if is_quali else 'practice_laps'
            cursor.execute(f'DELETE FROM {table} WHERE session_id=%s', (sid,))
            columns = ('lap_number,air_temp,track_temp,humidity,wind_speed,wind_direction,rainfall' if is_quali
                       else 'driver_code,fp_session,best_lap_ms,median_lap_ms,lap_count,compound')
            execute_values(cursor, f'INSERT INTO {table} (session_id,{columns}) VALUES %s', [(sid, *row) for row in rows])
    print(f'R{number}: OpenF1 {kind} imported ({len(rows)} rows)', flush=True)
