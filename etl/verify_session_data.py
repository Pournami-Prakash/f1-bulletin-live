#!/usr/bin/env python3
"""Fail a workflow run when expected race-weekend data was not persisted."""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import sys

import fastf1
import psycopg2
from dotenv import load_dotenv


load_dotenv(Path(__file__).resolve().parents[1] / "web" / ".env.local")


PRACTICE_NAMES = {
    "Practice 1": "FP1",
    "Practice 2": "FP2",
    "Practice 3": "FP3",
}


def expected_practice_sessions(season: int, round_number: int) -> list[str]:
    schedule = fastf1.get_event_schedule(season, include_testing=False)
    event = schedule[schedule["RoundNumber"] == round_number]
    if event.empty:
        raise RuntimeError(f"Round {round_number} is missing from the {season} schedule")

    row = event.iloc[0]
    expected: list[str] = []
    for index in range(1, 6):
        mapped = PRACTICE_NAMES.get(str(row.get(f"Session{index}")))
        if mapped:
            expected.append(mapped)
    return expected


def practice_counts(cursor, season: int, round_number: int) -> dict[str, int]:
    cursor.execute(
        """
        SELECT pl.fp_session, COUNT(DISTINCT pl.driver_code)::int
        FROM practice_laps pl
        JOIN sessions s ON s.id = pl.session_id
        WHERE s.season = %s AND s.round = %s
        GROUP BY pl.fp_session
        """,
        (season, round_number),
    )
    return {session: count for session, count in cursor.fetchall()}


def qualifying_count(cursor, season: int, round_number: int) -> int:
    cursor.execute(
        """
        SELECT COUNT(DISTINCT q.driver_code)::int
        FROM qualifying_laps q
        JOIN sessions s ON s.id = q.session_id
        WHERE s.season = %s AND s.round = %s
          AND q.grid_position IS NOT NULL AND q.best_ms IS NOT NULL
        """,
        (season, round_number),
    )
    return cursor.fetchone()[0]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--season", type=int, required=True)
    parser.add_argument("--round", type=int, required=True, dest="round_number")
    parser.add_argument("--session", choices=("practice", "qualifying"), required=True)
    parser.add_argument("--min-drivers", type=int, default=15)
    args = parser.parse_args()

    database_url = os.environ.get("NEON_DATABASE_URL")
    if not database_url:
        print("NEON_DATABASE_URL is not configured", file=sys.stderr)
        return 2

    with psycopg2.connect(database_url) as connection:
        with connection.cursor() as cursor:
            if args.session == "qualifying":
                count = qualifying_count(cursor, args.season, args.round_number)
                print(f"Qualifying verification: {count} drivers")
                return 0 if count >= args.min_drivers else 1

            expected = expected_practice_sessions(args.season, args.round_number)
            counts = practice_counts(cursor, args.season, args.round_number)
            missing = [name for name in expected if counts.get(name, 0) < args.min_drivers]
            print(f"Practice verification: expected={expected}, counts={counts}")
            return 0 if expected and not missing else 1


if __name__ == "__main__":
    raise SystemExit(main())
