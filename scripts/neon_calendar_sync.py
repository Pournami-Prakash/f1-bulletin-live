"""Maintain the app calendar entirely in Neon, alongside the Snowflake pipeline."""
import argparse
from datetime import datetime, timezone
from pathlib import Path
import os

import fastf1
import pandas as pd
import psycopg2
from psycopg2 import sql
from psycopg2.extras import RealDictCursor, execute_values
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / "web" / ".env.local")


def identity(name):
    return name.replace("Barcelona-Catalunya", "Barcelona").strip().casefold()


def calendar_rows(schedule, existing, now):
    metadata = {identity(row["race_name"]): dict(row) for row in existing}
    events = list(schedule.sort_values("RoundNumber").iterrows())
    names = [identity(e["EventName"]) for _, e in events]
    if len(names) != len(set(names)) or set(names) != set(metadata):
        raise ValueError("Schedule and Neon calendar events differ; update the Neon seed before publishing")
    rows = []
    for _, event in events:
        row = metadata[identity(event["EventName"])].copy()
        row["round"] = int(event["RoundNumber"])
        row["updated_at"] = now
        dates = {str(event[f"Session{i}"]): event.get(f"Session{i}Date") for i in range(1, 6)}
        utc_dates = {str(event[f"Session{i}"]): event.get(f"Session{i}DateUtc") for i in range(1, 6)}
        start = pd.Timestamp(utc_dates.get("Race"))
        if pd.isna(start):
            raise ValueError(f"Missing race time for {event['EventName']}")
        start = start.tz_localize("UTC") if start.tzinfo is None else start.tz_convert("UTC")
        row["race_start_utc"] = start.to_pydatetime()
        for field, session in {
            "fp1_date": "Practice 1", "fp2_date": "Practice 2", "fp3_date": "Practice 3",
            "quali_date": "Qualifying", "sprint_quali_date": "Sprint Qualifying",
            "sprint_date": "Sprint", "race_date": "Race",
        }.items():
            value = dates.get(session)
            if field == "race_date" and pd.isna(value):
                raise ValueError(f"Missing local race date for {event['EventName']}")
            row[field] = pd.Timestamp(value).date() if pd.notna(value) else None
        row["is_sprint_weekend"] = "Sprint" in dates
        row["is_completed"] = now >= start + pd.Timedelta(hours=6)
        rows.append(row)
    return rows


def upsert(cursor, table, rows):
    columns = list(rows[0])
    statement = sql.SQL("INSERT INTO public.{} ({}) VALUES %s ON CONFLICT (season, round) DO UPDATE SET {}").format(
        sql.Identifier(table), sql.SQL(",").join(map(sql.Identifier, columns)),
        sql.SQL(",").join(sql.SQL("{}=EXCLUDED.{}").format(sql.Identifier(c), sql.Identifier(c))
                         for c in columns if c not in {"season", "round"}),
    )
    execute_values(cursor, statement.as_string(cursor), [[row[c] for c in columns] for row in rows])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--season", type=int, default=datetime.now(timezone.utc).year)
    args = parser.parse_args()
    schedule = fastf1.get_event_schedule(args.season, include_testing=False)
    # Seed, refresh, protection, and app-table publication succeed atomically.
    with psycopg2.connect(os.environ["NEON_DATABASE_URL"], connect_timeout=30) as connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute("SELECT pg_advisory_xact_lock(2026, 2316)")
            cursor.execute((ROOT / "sql/neon_race_calendar.sql").read_text())
            cursor.execute("SELECT * FROM public.race_calendar_neon WHERE season=%s", (args.season,))
            rows = calendar_rows(schedule, cursor.fetchall(), datetime.now(timezone.utc))
            upsert(cursor, "race_calendar_neon", rows)
            upsert(cursor, "race_calendar", rows)
    print(f"Published {len(rows)} races for {args.season} from Neon; stale Snowflake calendar writes are protected.")


if __name__ == "__main__":
    main()
