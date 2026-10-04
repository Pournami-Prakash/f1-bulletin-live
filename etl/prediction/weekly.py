"""Catch up chronologically, score completed rounds, then forecast after qualifying.

Run from any directory: python etl/prediction/weekly.py [--season 2026]
Historical reconstructions use current model code and historically bounded data;
they are not forecasts actually issued before the race.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import os
from pathlib import Path
import subprocess
import sys
import tempfile

import fastf1
import pandas as pd
import psycopg2
from dotenv import load_dotenv
from official_results import reconcile, result_urls

ETL = Path(__file__).resolve().parents[1]
load_dotenv(ETL.parent / "web" / ".env.local")


def run(script, *args, env=None):
    subprocess.run([sys.executable, str(ETL / script), *map(str, args)],
                   cwd=ETL, env=env, check=True)


def state(season, round_number):
    with psycopg2.connect(os.environ["NEON_DATABASE_URL"], connect_timeout=30) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                  (SELECT count(DISTINCT r.driver_code) FROM results r
                   JOIN sessions s ON s.id=r.session_id
                   WHERE s.season=%s AND s.round=%s AND s.session_type='R'
                     AND r.finish_position IS NOT NULL),
                  (SELECT count(DISTINCT q.driver_code) FROM qualifying_laps q
                   JOIN sessions s ON s.id=q.session_id
                   WHERE s.season=%s AND s.round=%s
                     AND q.grid_position IS NOT NULL AND q.best_ms IS NOT NULL),
                  (SELECT count(DISTINCT driver_code) FROM predictions
                   WHERE season=%s AND round=%s)
            """, (season, round_number) * 3)
            return cur.fetchone()


def session_time(event, name):
    for index in range(1, 6):
        if event.get(f"Session{index}") == name:
            value = event.get(f"Session{index}DateUtc")
            if pd.notna(value):
                return pd.Timestamp(value).tz_localize("UTC") if pd.Timestamp(value).tzinfo is None else pd.Timestamp(value)
    raise RuntimeError(f"Missing {name} start for {event['EventName']}")


def forecast(season, round_number, completed):
    with tempfile.TemporaryDirectory(prefix="f1-asof-") as directory:
        env = dict(os.environ, F1_ASOF_ROUND=f"{season}:{round_number}",
                   F1_FEATURES_DIR=directory, F1_BACKFILL="1" if completed else "0")
        # Regenerate every aggregate inside the boundary; never reuse a future
        # Elo, constructor, circuit profile, or calibrator artifact.
        run("prediction/feature_engineering.py", env=env)
        run("prediction/predict.py", "--season", season, "--round", round_number,
            "--production", env=env)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--season", type=int, default=datetime.now(timezone.utc).year)
    parser.add_argument("--from-round", type=int, default=1)
    parser.add_argument("--through-round", type=int)
    parser.add_argument("--plan", action="store_true", help="Read-only status; no ingestion or writes")
    args = parser.parse_args()
    now = pd.Timestamp.now(tz="UTC")
    schedule = fastf1.get_event_schedule(args.season, include_testing=False)
    official_urls = None
    for _, event in schedule.sort_values("RoundNumber").iterrows():
        number = int(event["RoundNumber"])
        if number < args.from_round or (args.through_round and number > args.through_round):
            continue
        race_time = session_time(event, "Race")
        completed = now >= race_time + pd.Timedelta(hours=6)
        ready = now >= session_time(event, "Qualifying") + pd.Timedelta(hours=2)
        actuals, qualifying, predictions = state(args.season, number)
        print(f"R{number} {event['EventName']}: completed={completed}, "
              f"qualifying={qualifying}, actuals={actuals}, predictions={predictions}", flush=True)
        if args.plan:
            continue
        if not completed and (not ready or now >= race_time):
            print("Waiting for qualifying publication or race completion.", flush=True)
            break
        common = ("--seasons", args.season, "--round", number)
        if completed and actuals < 15:
            run("load_fastf1_v4.py", *common, "--no-replay")
            actuals, qualifying, predictions = state(args.season, number)
            if actuals < 15:
                raise RuntimeError(f"R{number}: actual results unavailable; refusing to skip ahead")
        if predictions < 15:
            if qualifying < 15:
                run("load_fastf1_v4.py", *common, "--quali-only")
                _, qualifying, _ = state(args.season, number)
                if qualifying < 15:
                    raise RuntimeError(f"R{number}: qualifying unavailable; refusing to invent a grid")
            # Practice is helpful but optional; missing practice must not block scoring.
            run("load_fastf1_v4.py", *common, "--fp-only")
            run("load_fastf1_v4.py", *common, "--sprint-only")
            forecast(args.season, number, completed)
            if state(args.season, number)[2] < 15:
                raise RuntimeError(f"R{number}: prediction was not persisted")
        if completed:
            if official_urls is None:
                official_urls = result_urls(args.season)
            with psycopg2.connect(os.environ["NEON_DATABASE_URL"], connect_timeout=30) as connection:
                reconcile(connection, args.season, number, event["EventName"], official_urls)
            run("prediction/predict.py", "--season", args.season, "--round", number, "--score")
        else:
            break


if __name__ == "__main__":
    main()
