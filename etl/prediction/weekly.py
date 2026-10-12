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
from official_results import reconcile, result_urls, classification, SLUGS

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
                   WHERE s.season=%s AND s.round=%s AND s.session_type='Q'
                     AND q.grid_position IS NOT NULL),
                  (SELECT count(DISTINCT driver_code) FROM predictions
                   WHERE season=%s AND round=%s)
            """, (season, round_number) * 3)
            return cur.fetchone()


def expected_roster(season, round_number, *, event_name=None, urls=None):
    # Finished races have an authoritative entry list. Do not let a partial
    # timing-feed fallback shrink an already complete historical classification.
    if event_name is not None:
        slug = SLUGS.get(event_name.removesuffix(" Grand Prix"))
        if not urls or slug not in urls:
            raise RuntimeError(f"No official classification URL for {event_name}")
        return {row[0] for row in classification(urls[slug])}
    session = fastf1.get_session(season, round_number, 'Q')
    session.load(laps=False, telemetry=False, weather=False, messages=False)
    codes = session.results['Abbreviation'].dropna().astype(str)
    roster = set(codes[codes.str.fullmatch(r'[A-Z]{3}')])
    if len(roster) < (22 if season == 2026 else 20) or len(roster) != len(session.results):
        raise RuntimeError(f"R{round_number}: complete qualifying entry list unavailable")
    return roster


def validate_qualifying(season, round_number, expected):
    with psycopg2.connect(os.environ['NEON_DATABASE_URL'], connect_timeout=30) as conn:
        with conn.cursor() as cur:
            cur.execute("""SELECT DISTINCT q.driver_code FROM qualifying_laps q
                JOIN sessions s ON s.id=q.session_id WHERE s.season=%s AND s.round=%s
                  AND s.session_type='Q' AND q.grid_position IS NOT NULL""", (season, round_number))
            drivers = {row[0] for row in cur.fetchall()}
            if drivers != expected:
                raise RuntimeError(f"R{round_number}: qualifying entrants differ from source; "
                                   f"missing={sorted(expected-drivers)}, unexpected={sorted(drivers-expected)}")


def validate_fields(season, round_number, expected, *, actuals=False):
    with psycopg2.connect(os.environ['NEON_DATABASE_URL'], connect_timeout=30) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT model_version, driver_code FROM predictions WHERE season=%s AND round=%s",
                        (season, round_number))
            versions = {}
            for version, driver in cur.fetchall():
                versions.setdefault(version, set()).add(driver)
            if not versions:
                raise RuntimeError(f"R{round_number}: prediction was not persisted")
            for version, drivers in versions.items():
                if drivers != expected:
                    raise RuntimeError(f"R{round_number} {version}: incomplete forecast; "
                                       f"missing={sorted(expected-drivers)}, unexpected={sorted(drivers-expected)}. "
                                       "Existing forecasts preserved; repair the missing entries explicitly.")
            if actuals:
                cur.execute("""SELECT r.driver_code FROM results r JOIN sessions s ON s.id=r.session_id
                    WHERE s.season=%s AND s.round=%s AND s.session_type='R'
                      AND r.finish_position IS NOT NULL""", (season, round_number))
                drivers = {row[0] for row in cur.fetchall()}
                if drivers != expected:
                    raise RuntimeError(f"R{round_number}: incomplete race classification; "
                                       f"missing={sorted(expected-drivers)}, unexpected={sorted(drivers-expected)}")


def session_time(event, name):
    for index in range(1, 6):
        if event.get(f"Session{index}") == name:
            value = event.get(f"Session{index}DateUtc")
            if pd.notna(value):
                return pd.Timestamp(value).tz_localize("UTC") if pd.Timestamp(value).tzinfo is None else pd.Timestamp(value)
    raise RuntimeError(f"Missing {name} start for {event['EventName']}")


def load_quali_weather(season, round_number):
    # Optional input: a failure leaves the weather features missing (imputed), not the forecast blocked.
    try:
        run("load_quali_weather.py", "--season", season, "--round", round_number)
    except Exception as error:
        print(f"R{round_number}: qualifying weather unavailable ({error}); continuing without it", flush=True)


def forecast(season, round_number, completed):
    load_quali_weather(season, round_number)
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
        if completed and official_urls is None:
            official_urls = result_urls(args.season)
        expected = expected_roster(args.season, number,
                                   event_name=event["EventName"] if completed else None,
                                   urls=official_urls)
        field_size = len(expected)
        common = ("--seasons", args.season, "--round", number)
        if completed and actuals != field_size:
            run("load_fastf1_v4.py", *common, "--no-replay")
            actuals, qualifying, predictions = state(args.season, number)
            if actuals != field_size:
                raise RuntimeError(f"R{number}: actual results unavailable; refusing to skip ahead")
        if predictions == 0:
            if qualifying != field_size:
                run("load_fastf1_v4.py", *common, "--quali-only")
                _, qualifying, _ = state(args.season, number)
                if qualifying != field_size:
                    raise RuntimeError(f"R{number}: qualifying unavailable; refusing to invent a grid")
            validate_qualifying(args.season, number, expected)
            # Practice is helpful but optional; missing practice must not block scoring.
            run("load_fastf1_v4.py", *common, "--fp-only")
            run("load_fastf1_v4.py", *common, "--sprint-only")
            forecast(args.season, number, completed)
        validate_fields(args.season, number, expected)
        if completed:
            if official_urls is None:
                official_urls = result_urls(args.season)
            with psycopg2.connect(os.environ["NEON_DATABASE_URL"], connect_timeout=30) as connection:
                reconcile(connection, args.season, number, event["EventName"], official_urls)
            validate_fields(args.season, number, expected, actuals=True)
            run("prediction/predict.py", "--season", args.season, "--round", number, "--score")
        else:
            break


if __name__ == "__main__":
    main()
