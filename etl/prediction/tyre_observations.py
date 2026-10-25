"""Observed practice adapter. Provider data and derived quality flags stay separate."""
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import re

import pandas as pd
from psycopg2.extras import Json, execute_values

NORMALIZER_VERSION = 'practice-v1'
CATALOG = Path(__file__).with_name('tyre_allocations.json')


def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def allocation(season, circuit, compound, cutoff=None):
    entry = json.loads(CATALOG.read_text()).get(f'{season}:{circuit}')
    if entry and (cutoff is None or pd.Timestamp(entry['available_from']) <= pd.Timestamp(cutoff)):
        actual = entry.get(compound)
        if actual:
            return dict(actual_compound=actual, tyre_spec=f'pirelli-{season}:{actual}', allocation_source=entry['source'])
    return dict(actual_compound=None, tyre_spec=None, allocation_source=None)


def caution_windows(control, end):
    """Conservative flag windows. Unresolved flags run to the session end."""
    events = sorted(control, key=lambda r: r['date'])
    windows = []
    for i, event in enumerate(events):
        if event.get('flag') not in {'YELLOW', 'DOUBLE YELLOW', 'RED'} and not (
                event.get('category') == 'SafetyCar' and 'DEPLOYED' in event.get('message', '').upper()):
            continue
        sector = event.get('sector') if event.get('scope') == 'Sector' else None
        finishes = [r['date'] for r in events[i+1:]
                    if (r.get('flag') == 'GREEN' or 'CLEAR' in r.get('message', '').upper())
                    and (sector is None or r.get('sector') in (None, sector))]
        windows.append((pd.Timestamp(event['date']), pd.Timestamp(finishes[0]) if finishes else end))
    return windows


def normalize(payload, season, number, race_start, retrieved_at=None):
    """Return an immutable raw batch and normalized laps, never invent measurements."""
    session = payload['sessions'][0]
    if len(payload['sessions']) != 1 or session.get('is_cancelled'):
        raise ValueError('Expected one active practice session')
    if session['session_name'] not in {'Practice 1', 'Practice 2', 'Practice 3'}:
        raise ValueError('Only practice sessions are accepted')
    start, end = pd.Timestamp(session['date_start']), pd.Timestamp(session['date_end'])
    if end > pd.Timestamp(race_start) or end > pd.Timestamp.now(tz='UTC'):
        raise ValueError('Practice ends after the forecast boundary or is unfinished')
    for endpoint, records in payload.items():
        for record in records:
            if record.get('session_key') != session['session_key']:
                raise ValueError(f'Mixed provider session in {endpoint}')
    drivers = {r['driver_number']: r['name_acronym'] for r in payload['drivers']}
    if len(drivers) != len(payload['drivers']) or len(set(drivers.values())) != len(drivers):
        raise ValueError('Ambiguous driver identifiers')
    if any(not re.fullmatch('[A-Z]{3}', str(code)) for code in drivers.values()):
        raise ValueError('Invalid driver identifier')
    if not payload['laps'] or len(drivers) < 3:
        raise ValueError('Practice observations unavailable')
    retrieved = retrieved_at or datetime.now(timezone.utc).isoformat()
    identity = dict(payload=payload, season=season, round=number, normalizer=NORMALIZER_VERSION)
    digest = hashlib.sha256(json.dumps(identity, sort_keys=True, allow_nan=False).encode()).hexdigest()
    batch = dict(id=digest, season=season, round=number, circuit=session['location'],
                 session_key=session['session_key'], session_name=session['session_name'],
                 session_start=start.isoformat(), session_end=end.isoformat(), retrieved_at=retrieved,
                 source='OpenF1', normalizer_version=NORMALIZER_VERSION, payload=payload)
    windows = caution_windows(payload['race_control'], end)
    weather = sorted(payload['weather'], key=lambda r: r['date'])
    deleted = set()
    for event in payload['race_control']:
        message = event.get('message', '').upper()
        if 'DELETED' in message and event.get('driver_number'):
            match = re.search(r'LAP\s+(\d+)', message)
            lap = int(match[1]) if match else event.get('lap_number')
            if lap:
                deleted.add((event['driver_number'], lap))
    laps = sorted(payload['laps'], key=lambda r: (r['driver_number'], r['lap_number']))
    out_keys = {(r['driver_number'], r['lap_number']) for r in laps if r.get('is_pit_out_lap')}
    output, seen = [], set()
    for lap in laps:
        key = lap['driver_number'], lap['lap_number']
        if key in seen or key[0] not in drivers or key[1] < 1:
            raise ValueError('Duplicate lap or unknown driver')
        seen.add(key)
        reasons = []
        duration = lap.get('lap_duration')
        valid_time = finite(duration) and duration > 0
        when = pd.to_datetime(lap.get('date_start'), utc=True, errors='coerce')
        finish = when + pd.Timedelta(seconds=duration) if valid_time and pd.notna(when) else pd.NaT
        if not valid_time:
            reasons.append('missing_lap_time')
        if pd.isna(when) or when < start or pd.isna(finish) or finish > end + pd.Timedelta(minutes=5):
            reasons.append('invalid_timestamp')
        sectors = [lap.get(f'duration_sector_{i}') for i in range(1, 4)]
        if not all(finite(t) and t > 0 for t in sectors) or not valid_time or abs(sum(sectors)-duration) > .1:
            reasons.append('sector_consistency')
        if lap.get('is_pit_out_lap') is not False:
            reasons.append('out_lap_or_unknown')
        if (key[0], key[1]+1) in out_keys:
            reasons.append('inferred_in_lap')
        if key in deleted:
            reasons.append('deleted_lap')
        if pd.notna(when) and pd.notna(finish) and any(when <= b and finish >= a for a, b in windows):
            reasons.append('caution_overlap_conservative')
        stints = [s for s in payload['stints'] if s['driver_number'] == key[0]
                  and s['lap_start'] <= key[1] <= s['lap_end']]
        stint = stints[0] if len(stints) == 1 else None
        if not stint or not finite(stint.get('tyre_age_at_start')):
            reasons.append('missing_or_ambiguous_stint')
        age = (stint['tyre_age_at_start'] + key[1] - stint['lap_start']) if stint and finite(stint.get('tyre_age_at_start')) else None
        compound = stint.get('compound') if stint else None
        if compound not in {'SOFT', 'MEDIUM', 'HARD'}:
            reasons.append('non_slick_or_unknown_compound')
        before = [w for w in weather if pd.notna(when) and pd.Timestamp(w['date']) <= when
                  and when-pd.Timestamp(w['date']) <= pd.Timedelta(minutes=2)]
        wx = before[-1] if before else {}
        output.append(dict(season=season, round=number, circuit=session['location'],
                           session_key=session['session_key'], fp_session='FP'+session['session_name'][-1],
                           driver_code=drivers[key[0]], driver_number=key[0], lap_number=key[1],
                           date_start=when.isoformat() if pd.notna(when) else None,
                           session_time_s=(when-start).total_seconds() if pd.notna(when) else None,
                           lap_time_ms=duration*1000 if valid_time else None,
                           stint=stint['stint_number'] if stint else None, compound=compound,
                           tyre_age_start=age, tyre_life=age+1 if age is not None else None,
                           track_temp=wx.get('track_temperature'), air_temp=wx.get('air_temperature'),
                           rainfall=wx.get('rainfall'), traffic_status='unknown',
                           eligible=not reasons, exclusion_reasons=reasons,
                           **allocation(season, session['location'], compound, race_start)))
    return batch, output


def persist(connection, batch, rows):
    """Append a complete version atomically. Existing batches are never deleted."""
    if not rows:
        raise ValueError('Cannot persist an empty practice batch')
    with connection.cursor() as cur:
        cur.execute('''INSERT INTO practice_observation_batches
            (id,season,round,circuit,session_key,session_name,session_start,session_end,retrieved_at,
             source,normalizer_version,payload) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (id) DO NOTHING''',
            tuple(batch[k] for k in ['id','season','round','circuit','session_key','session_name','session_start',
                                     'session_end','retrieved_at','source','normalizer_version']) + (Json(batch['payload']),))
        execute_values(cur, '''INSERT INTO practice_lap_observations
            (batch_id,driver_code,lap_number,observation) VALUES %s ON CONFLICT DO NOTHING''',
            [(batch['id'], row['driver_code'], row['lap_number'], Json(row)) for row in rows])
