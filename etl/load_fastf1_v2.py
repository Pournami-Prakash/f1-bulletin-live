"""
F1 Bulletin — FastF1 → Neon ETL
Loads race sessions (laps, results, stints, telemetry replay) into Neon Postgres.

Usage:
    python load_fastf1.py                             # loads 2025 + 2026 (full)
    python load_fastf1.py --seasons 2025              # loads 2025 only
    python load_fastf1.py --seasons 2025 2026         # loads both
    python load_fastf1.py --seasons 2025 --round 1    # loads one race only
    python load_fastf1.py --replay-only               # only redo replay (preserves laps/results/stints)
    python load_fastf1.py --seasons 2025 --replay-only
"""

from __future__ import annotations
import argparse
from pathlib import Path
import fastf1 as f1
import numpy as np
import pandas as pd
import psycopg2
import os
from dotenv import load_dotenv

# ── Config ────────────────────────────────────────────────────────────────────

load_dotenv("../web/.env.local")

DATABASE_URL = os.environ.get("NEON_DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("NEON_DATABASE_URL not found in web/.env.local")

CACHE_DIR = Path("cache")
CACHE_DIR.mkdir(parents=True, exist_ok=True)
f1.Cache.enable_cache(str(CACHE_DIR))

REPLAY_POINTS_PER_LAP = 32   # sample points per lap per driver
REPLAY_CHUNK_SIZE     = 200  # rows per commit to avoid Neon timeout

# ── DB helpers ────────────────────────────────────────────────────────────────

def get_conn():
    return psycopg2.connect(
        DATABASE_URL,
        keepalives=1,
        keepalives_idle=30,
        keepalives_interval=10,
        keepalives_count=5,
        connect_timeout=30,
    )

def ms(td) -> int | None:
    if pd.isnull(td):
        return None
    return int(td.total_seconds() * 1000)

# ── Session loader ────────────────────────────────────────────────────────────

def load_session(season: int, round_number: int, conn, replay_only: bool = False) -> None:
    cur = conn.cursor()
    print(f"\n→ {season} Round {round_number} {'[REPLAY ONLY]' if replay_only else ''}...")

    try:
        session = f1.get_session(season, round_number, "R")
        session.load(telemetry=True, weather=False, messages=False)
    except Exception as e:
        print(f"  ✗ Skipped: {e}")
        cur.close()
        return

    gp_name = session.event["EventName"]
    circuit = session.event.get("Location") or session.event.get("Country") or "Unknown"
    date    = session.date.date() if session.date else None
    print(f"  → {gp_name}")

    # ── Upsert session (always) ─────────────────────────────────────────────
    cur.execute("""
        INSERT INTO sessions (season, round, gp_name, circuit, date, session_type)
        VALUES (%s, %s, %s, %s, %s, 'R')
        ON CONFLICT (season, round, session_type) DO UPDATE
          SET gp_name = EXCLUDED.gp_name,
              circuit = EXCLUDED.circuit,
              date    = EXCLUDED.date
        RETURNING id
    """, (season, round_number, gp_name, circuit, date))
    session_id = cur.fetchone()[0]

    if replay_only:
        # Only clear replay — preserve laps/results/stints
        cur.execute("DELETE FROM telemetry_replay WHERE session_id = %s", (session_id,))
        conn.commit()
        print(f"  → Cleared old replay for session_id={session_id}")
    else:
        for table in ("telemetry_replay", "stints", "laps", "results"):
            cur.execute(f"DELETE FROM {table} WHERE session_id = %s", (session_id,))
        conn.commit()

    # ── Results ─────────────────────────────────────────────────────────────
    if not replay_only:
        print(f"  → Loading results ...")
        for _, row in session.results.iterrows():
            cur.execute("""
                INSERT INTO results
                  (session_id, driver_code, team, grid_position,
                   finish_position, points, status, fastest_lap_ms)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                session_id,
                row.get("Abbreviation"),
                row.get("TeamName"),
                int(row["GridPosition"])  if pd.notna(row.get("GridPosition"))  else None,
                int(row["Position"])      if pd.notna(row.get("Position"))      else None,
                float(row["Points"])      if pd.notna(row.get("Points"))        else None,
                row.get("Status"),
                ms(row.get("FastestLapTime")),
            ))
        conn.commit()

    # ── Laps ─────────────────────────────────────────────────────────────────
    if not replay_only:
        print(f"  → Loading laps ...")
        laps_df = session.laps.copy()
        lap_cols = [
            "Driver", "LapNumber", "LapTime", "Sector1Time", "Sector2Time",
            "Sector3Time", "Compound", "TyreLife", "IsPersonalBest",
            "PitInTime", "PitOutTime", "Position",
        ]
        laps_df = laps_df[[c for c in lap_cols if c in laps_df.columns]]

        lap_rows = []
        for _, row in laps_df.iterrows():
            lap_rows.append((
                session_id,
                row.get("Driver"),
                int(row["LapNumber"])       if pd.notna(row.get("LapNumber"))       else None,
                ms(row.get("LapTime")),
                ms(row.get("Sector1Time")),
                ms(row.get("Sector2Time")),
                ms(row.get("Sector3Time")),
                row.get("Compound"),
                int(row["TyreLife"])        if pd.notna(row.get("TyreLife"))        else None,
                bool(row["IsPersonalBest"]) if pd.notna(row.get("IsPersonalBest")) else None,
                ms(row.get("PitInTime")),
                ms(row.get("PitOutTime")),
                int(row["Position"])        if pd.notna(row.get("Position"))        else None,
            ))

        for i in range(0, len(lap_rows), 500):
            cur.executemany("""
                INSERT INTO laps
                  (session_id, driver_code, lap_number, lap_time_ms,
                   s1_ms, s2_ms, s3_ms, compound, tyre_life,
                   is_personal_best, pit_in_time_ms, pit_out_time_ms, position)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """, lap_rows[i:i + 500])
            conn.commit()
        print(f"  → {len(lap_rows)} laps saved")

    # ── Stints ────────────────────────────────────────────────────────────────
    if not replay_only:
        print(f"  → Computing stints ...")
        laps_df2 = session.laps.copy()
        laps_df2 = laps_df2[[c for c in ["Driver", "LapNumber", "Compound"] if c in laps_df2.columns]]
        stint_rows = []

        for driver in laps_df2["Driver"].dropna().unique():
            drv_laps = (
                laps_df2[laps_df2["Driver"] == driver]
                .sort_values("LapNumber")
                .dropna(subset=["LapNumber"])
            )
            stint_num        = 0
            current_compound = None
            stint_start      = None
            prev_lap         = None

            for _, lap in drv_laps.iterrows():
                compound = lap.get("Compound")
                lap_num  = int(lap["LapNumber"])
                if compound != current_compound:
                    if current_compound is not None and stint_start is not None:
                        stint_rows.append((
                            session_id, driver, stint_num, current_compound,
                            stint_start, prev_lap, prev_lap - stint_start + 1,
                        ))
                    stint_num += 1
                    current_compound = compound
                    stint_start = lap_num
                prev_lap = lap_num

            if current_compound and stint_start and prev_lap:
                stint_rows.append((
                    session_id, driver, stint_num, current_compound,
                    stint_start, prev_lap, prev_lap - stint_start + 1,
                ))

        cur.executemany("""
            INSERT INTO stints
              (session_id, driver_code, stint_number, compound,
               start_lap, end_lap, lap_count)
            VALUES (%s,%s,%s,%s,%s,%s,%s)
        """, stint_rows)
        conn.commit()
        print(f"  → {len(stint_rows)} stints saved")

    # ── Telemetry replay ─────────────────────────────────────────────────────
    # KEY CHANGE: frame = sample_index within a single lap (0..REPLAY_POINTS_PER_LAP-1)
    # lap_number = which lap of the race
    # This gives us clean per-lap sequential coordinates so we can:
    #   1. Build a clean track outline from lap_number=1
    #   2. Animate cars moving around the track lap by lap
    print(f"  → Loading telemetry replay ...")
    total_laps = int(session.laps["LapNumber"].max()) if "LapNumber" in session.laps.columns else 0

    if total_laps > 0:
        replay_rows = []

        for drv_num in session.drivers:
            try:
                drv_info = session.get_driver(drv_num)
                drv_code = drv_info["Abbreviation"]
            except Exception:
                continue

            drv_laps = session.laps[session.laps["Driver"] == drv_code]
            if drv_laps.empty:
                continue

            for lap_num, grp in drv_laps.groupby("LapNumber"):
                lap = grp.iloc[0]
                try:
                    tel = lap.get_telemetry().add_distance()
                except Exception:
                    continue

                if not {"X", "Y", "Distance"}.issubset(tel.columns):
                    continue
                if len(tel) < 4:
                    continue

                # Evenly sample N points from this lap's telemetry IN ORDER
                idx = np.linspace(0, len(tel) - 1, REPLAY_POINTS_PER_LAP, dtype=int)
                sub = tel.iloc[idx]

                for sample_idx, (_, trow) in enumerate(sub.iterrows()):
                    replay_rows.append((
                        session_id,
                        drv_code,
                        int(lap_num),
                        sample_idx,        # sequential position around the lap
                        float(trow["X"]),
                        float(trow["Y"]),
                    ))

        if replay_rows:
            for i in range(0, len(replay_rows), REPLAY_CHUNK_SIZE):
                chunk = replay_rows[i:i + REPLAY_CHUNK_SIZE]
                cur.executemany("""
                    INSERT INTO telemetry_replay
                      (session_id, driver_code, lap_number, frame, x, y)
                    VALUES (%s,%s,%s,%s,%s,%s)
                """, chunk)
                conn.commit()
            print(f"  → {len(replay_rows)} replay points saved")
        else:
            print(f"  → No telemetry available")
    else:
        print(f"  → Skipping replay (no laps)")

    print(f"  ✓ Done — session_id={session_id}")
    cur.close()

# ── Season loader ─────────────────────────────────────────────────────────────

def load_season(season: int, round_filter: int | None = None, replay_only: bool = False, from_round: int | None = None) -> None:
    schedule = f1.get_event_schedule(season, include_testing=False)
    conn = get_conn()
    try:
        for _, event in schedule.iterrows():
            round_num = int(event["RoundNumber"])
            if round_filter and round_num != round_filter:
                continue
            if from_round and round_num < from_round:
                print(f"  ↷ Skipping Round {round_num} (before --from-round {from_round})")
                continue
            if conn.closed:
                conn = get_conn()
            load_session(season, round_num, conn, replay_only=replay_only)
    finally:
        conn.close()

# ── CLI ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Load FastF1 data into Neon")
    parser.add_argument("--seasons",    nargs="+", type=int, default=[2025, 2026])
    parser.add_argument("--round",      type=int, default=None,
                        help="Load a single round only")
    parser.add_argument("--from-round", type=int, default=None,
                        help="Skip all rounds before this number (e.g. --from-round 22)")
    parser.add_argument("--replay-only", action="store_true",
                        help="Only reload telemetry replay — preserves laps/results/stints")
    args = parser.parse_args()

    for season in args.seasons:
        print(f"\n{'='*50}")
        print(f"  SEASON {season}{' — REPLAY ONLY' if args.replay_only else ''}{f' — FROM ROUND {args.from_round}' if args.from_round else ''}")
        print(f"{'='*50}")
        load_season(season, round_filter=args.round, replay_only=args.replay_only, from_round=args.from_round)

    print("\n✓ All done")

if __name__ == "__main__":
    main()