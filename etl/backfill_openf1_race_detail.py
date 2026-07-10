from __future__ import annotations

import argparse
import bisect
import os
from datetime import datetime
from pathlib import Path
from typing import Any

import psycopg2
import psycopg2.extras
import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / "web" / ".env.local")

OPENF1_BASE = "https://api.openf1.org/v1"
REPLAY_FRAMES_PER_LAP = 32


def parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def ms(seconds: Any) -> int | None:
    if seconds is None:
        return None
    try:
        return int(round(float(seconds) * 1000))
    except (TypeError, ValueError):
        return None


def get_conn():
    url = os.environ.get("NEON_DATABASE_URL")
    if not url:
        raise RuntimeError("NEON_DATABASE_URL not found in web/.env.local")
    return psycopg2.connect(url, connect_timeout=30)


def openf1_get(endpoint: str, params: dict[str, Any], *, optional: bool = False) -> list[dict[str, Any]]:
    response = requests.get(f"{OPENF1_BASE}/{endpoint}", params=params, timeout=60)
    if optional and response.status_code in {404, 422}:
        return []
    response.raise_for_status()
    data = response.json()
    return data if isinstance(data, list) else []


def fetch_db_race(conn, season: int, round_: int) -> dict[str, Any] | None:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            SELECT
              s.id AS session_id,
              s.season,
              s.round,
              s.gp_name,
              s.circuit,
              s.date,
              rc.race_start_utc,
              rc.circuit_name
            FROM sessions s
            LEFT JOIN race_calendar rc
              ON rc.season = s.season AND rc.round = s.round
            WHERE s.season = %s
              AND s.round = %s
              AND s.session_type = 'R'
            ORDER BY s.id DESC
            LIMIT 1
            """,
            (season, round_),
        )
        return cur.fetchone()


def resolve_openf1_session(season: int, db_race: dict[str, Any]) -> dict[str, Any]:
    sessions = [
        s for s in openf1_get("sessions", {"year": season, "session_name": "Race"})
        if not s.get("is_cancelled")
    ]
    target = db_race.get("race_start_utc") or db_race.get("date")
    target_dt = parse_dt(target.isoformat() if hasattr(target, "isoformat") else str(target))
    if not target_dt:
        raise RuntimeError(f"Cannot resolve race date for R{db_race['round']}")

    def score(session: dict[str, Any]) -> float:
        session_dt = parse_dt(session.get("date_start"))
        if not session_dt:
            return float("inf")
        return abs((session_dt - target_dt).total_seconds())

    match = min(sessions, key=score)
    if score(match) > 36 * 3600:
        raise RuntimeError(
            f"OpenF1 session match too far from DB race date for R{db_race['round']}: {match}"
        )
    return match


def latest_position(position_by_driver: dict[int, list[tuple[datetime, int]]], driver_number: int, at: datetime) -> int | None:
    rows = position_by_driver.get(driver_number)
    if not rows:
        return None
    dates = [row[0] for row in rows]
    idx = bisect.bisect_right(dates, at) - 1
    if idx < 0:
        return None
    return rows[idx][1]


def sample_locations_for_lap(
    locations_by_driver: dict[int, list[dict[str, Any]]],
    location_dates_by_driver: dict[int, list[datetime]],
    driver_number: int,
    start: datetime,
    end: datetime | None,
) -> list[dict[str, Any]]:
    rows = locations_by_driver.get(driver_number, [])
    dates = location_dates_by_driver.get(driver_number, [])
    if not rows or not dates:
        return []
    left = bisect.bisect_left(dates, start)
    right = bisect.bisect_left(dates, end) if end else min(len(rows), left + 400)
    segment = [
        row for row in rows[left:right]
        if row.get("x") is not None and row.get("y") is not None and (row.get("x") != 0 or row.get("y") != 0)
    ]
    if not segment:
        return []
    if len(segment) <= REPLAY_FRAMES_PER_LAP:
        return segment
    return [
        segment[round(i * (len(segment) - 1) / (REPLAY_FRAMES_PER_LAP - 1))]
        for i in range(REPLAY_FRAMES_PER_LAP)
    ]


def backfill_round(conn, season: int, round_: int, include_replay: bool) -> None:
    db_race = fetch_db_race(conn, season, round_)
    if not db_race:
        print(f"R{round_}: no DB race session found")
        return

    openf1_session = resolve_openf1_session(season, db_race)
    session_key = openf1_session["session_key"]
    print(f"R{round_}: {db_race['gp_name']} -> OpenF1 session_key={session_key} {openf1_session['circuit_short_name']}")

    drivers = openf1_get("drivers", {"session_key": session_key})
    driver_code = {int(d["driver_number"]): d["name_acronym"] for d in drivers if d.get("driver_number") and d.get("name_acronym")}

    laps = openf1_get("laps", {"session_key": session_key})
    stints = openf1_get("stints", {"session_key": session_key})
    positions = openf1_get("position", {"session_key": session_key})
    locations = openf1_get("location", {"session_key": session_key}, optional=True) if include_replay else []

    position_by_driver: dict[int, list[tuple[datetime, int]]] = {}
    for row in positions:
        dt = parse_dt(row.get("date"))
        if not dt or row.get("driver_number") is None or row.get("position") is None:
            continue
        position_by_driver.setdefault(int(row["driver_number"]), []).append((dt, int(row["position"])))
    for rows in position_by_driver.values():
        rows.sort(key=lambda item: item[0])

    locations_by_driver: dict[int, list[dict[str, Any]]] = {}
    location_dates_by_driver: dict[int, list[datetime]] = {}
    for row in locations:
        dt = parse_dt(row.get("date"))
        if not dt or row.get("driver_number") is None:
            continue
        row["_dt"] = dt
        locations_by_driver.setdefault(int(row["driver_number"]), []).append(row)
    for driver_number, rows in locations_by_driver.items():
        rows.sort(key=lambda item: item["_dt"])
        location_dates_by_driver[driver_number] = [row["_dt"] for row in rows]

    lap_rows = []
    lap_windows: dict[tuple[int, int], tuple[datetime, datetime | None]] = {}
    laps_by_driver: dict[int, list[dict[str, Any]]] = {}
    for row in laps:
        if row.get("driver_number") is None or row.get("lap_number") is None:
            continue
        laps_by_driver.setdefault(int(row["driver_number"]), []).append(row)
    for driver_number, rows in laps_by_driver.items():
        rows.sort(key=lambda item: int(item["lap_number"]))
        for idx, row in enumerate(rows):
            code = driver_code.get(driver_number)
            start = parse_dt(row.get("date_start"))
            if not code or not start:
                continue
            next_start = parse_dt(rows[idx + 1].get("date_start")) if idx + 1 < len(rows) else None
            lap_number = int(row["lap_number"])
            lap_windows[(driver_number, lap_number)] = (start, next_start)
            lap_rows.append((
                db_race["session_id"],
                code,
                lap_number,
                ms(row.get("lap_duration")),
                ms(row.get("duration_sector_1")),
                ms(row.get("duration_sector_2")),
                ms(row.get("duration_sector_3")),
                None,
                None,
                None,
                None,
                None,
                latest_position(position_by_driver, driver_number, start),
            ))

    stint_rows = []
    for row in stints:
        code = driver_code.get(int(row["driver_number"])) if row.get("driver_number") is not None else None
        if not code:
            continue
        lap_start = int(row["lap_start"]) if row.get("lap_start") is not None else None
        lap_end = int(row["lap_end"]) if row.get("lap_end") is not None else None
        if lap_start is None or lap_end is None:
            continue
        stint_rows.append((
            db_race["session_id"],
            code,
            int(row.get("stint_number") or 0),
            row.get("compound"),
            lap_start,
            lap_end,
            max(0, lap_end - lap_start + 1),
        ))

    replay_rows = []
    if include_replay:
        for (driver_number, lap_number), (start, end) in lap_windows.items():
            code = driver_code.get(driver_number)
            if not code:
                continue
            samples = sample_locations_for_lap(
                locations_by_driver,
                location_dates_by_driver,
                driver_number,
                start,
                end,
            )
            for frame, row in enumerate(samples[:REPLAY_FRAMES_PER_LAP]):
                replay_rows.append((
                    db_race["session_id"],
                    code,
                    frame,
                    lap_number,
                    row.get("x"),
                    row.get("y"),
                ))

    with conn.cursor() as cur:
        cur.execute("DELETE FROM telemetry_replay WHERE session_id = %s", (db_race["session_id"],))
        cur.execute("DELETE FROM stints WHERE session_id = %s", (db_race["session_id"],))
        cur.execute("DELETE FROM laps WHERE session_id = %s", (db_race["session_id"],))
        psycopg2.extras.execute_batch(
            cur,
            """
            INSERT INTO laps
              (session_id, driver_code, lap_number, lap_time_ms,
               s1_ms, s2_ms, s3_ms, compound, tyre_life,
               is_personal_best, pit_in_time_ms, pit_out_time_ms, position)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """,
            lap_rows,
            page_size=500,
        )
        psycopg2.extras.execute_batch(
            cur,
            """
            INSERT INTO stints (session_id, driver_code, stint_number, compound, start_lap, end_lap, lap_count)
            VALUES (%s,%s,%s,%s,%s,%s,%s)
            """,
            stint_rows,
            page_size=500,
        )
        if replay_rows:
            psycopg2.extras.execute_batch(
                cur,
                """
                INSERT INTO telemetry_replay (session_id, driver_code, frame, lap_number, x, y)
                VALUES (%s,%s,%s,%s,%s,%s)
                """,
                replay_rows,
                page_size=1000,
            )
    conn.commit()
    print(f"  saved laps={len(lap_rows)} stints={len(stint_rows)} replay={len(replay_rows)}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill race detail from OpenF1 into Neon analytics tables")
    parser.add_argument("--season", type=int, default=2026)
    parser.add_argument("--rounds", type=int, nargs="+", required=True)
    parser.add_argument("--no-replay", action="store_true", help="Fill laps/stints only")
    args = parser.parse_args()

    with get_conn() as conn:
        for round_ in args.rounds:
            backfill_round(conn, args.season, round_, include_replay=not args.no_replay)


if __name__ == "__main__":
    main()
