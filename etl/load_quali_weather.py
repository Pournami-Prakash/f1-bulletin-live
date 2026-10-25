"""Backfill weather for qualifying sessions (known before the race starts).

Race-day weather is not available when a forecast is issued, so the model needs
the qualifying-session conditions instead. Rows are one per weather-station reading
(~1/min); lap_number holds the 1-based reading index.

    python etl/load_quali_weather.py                # all qualifying sessions without weather
    python etl/load_quali_weather.py --season 2026 --round 17
"""
import argparse
import os
import time
from pathlib import Path

import fastf1
import pandas as pd
import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import execute_values
from prediction.requests_compat import repair_requests_type_hints

ROOT = Path(__file__).resolve().parents[1]
repair_requests_type_hints()
load_dotenv(ROOT / "web" / ".env.local")
fastf1.Cache.enable_cache(str(ROOT / "etl" / "cache")) if (ROOT / "etl" / "cache").exists() else None


def number(value):
    return None if pd.isna(value) else float(value)


def load(connection, session_id, season, round_):
    session = fastf1.get_session(season, round_, "Q")
    session.load(laps=False, telemetry=False, weather=True, messages=False)
    weather = session.weather_data
    if weather is None or weather.empty:
        print(f"  {season} R{round_}: no weather data", flush=True)
        return 0
    rows = [(session_id, i, number(w.AirTemp), number(w.TrackTemp), number(w.Humidity),
             number(w.WindSpeed), number(w.WindDirection), bool(w.Rainfall))
            for i, w in enumerate(weather.itertuples(), start=1)]
    with connection.cursor() as cursor:
        cursor.execute("DELETE FROM weather WHERE session_id=%s", (session_id,))
        execute_values(cursor, """INSERT INTO weather (session_id, lap_number, air_temp, track_temp,
            humidity, wind_speed, wind_direction, rainfall) VALUES %s""", rows)
    connection.commit()
    print(f"  {season} R{round_}: {len(rows)} readings", flush=True)
    return len(rows)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--season", type=int)
    parser.add_argument("--round", type=int, dest="round_")
    args = parser.parse_args()
    with psycopg2.connect(os.environ["NEON_DATABASE_URL"]) as connection:
        with connection.cursor() as cursor:
            cursor.execute("""SELECT s.id, s.season, s.round FROM sessions s
                WHERE s.session_type='Q' AND (%s IS NULL OR s.season=%s) AND (%s IS NULL OR s.round=%s)
                AND NOT EXISTS (SELECT 1 FROM weather w WHERE w.session_id=s.id)
                ORDER BY s.season, s.round""", (args.season, args.season, args.round_, args.round_))
            sessions = cursor.fetchall()
        print(f"{len(sessions)} qualifying sessions need weather", flush=True)
        # Newest seasons first: the current season matters most for the forecast.
        for session_id, season, round_ in sorted(sessions, reverse=True):
            for attempt in range(8):
                try:
                    load(connection, session_id, season, round_)
                    break
                except Exception as error:
                    connection.rollback()
                    if "calls/h" in str(error) and attempt < 7:
                        print("  rate limited; waiting 10 minutes", flush=True)
                        time.sleep(600)
                        continue
                    print(f"  {season} R{round_}: failed ({error})", flush=True)
                    break


if __name__ == "__main__":
    main()
