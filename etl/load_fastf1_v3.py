"""
F1 Bulletin — FastF1 → Neon ETL v3
Loads race + qualifying sessions into Neon Postgres.
New in v3:
  - Qualifying laps (Q1/Q2/Q3 best times, grid position, gap to pole)
  - Track status per race (SC / VSC / Red Flag lap ranges)
  - Weather per lap (air temp, track temp, humidity, wind, rainfall)

Usage:
    python load_fastf1_v3.py                              # loads 2025 + 2026 (full)
    python load_fastf1_v3.py --seasons 2025               # loads 2025 only
    python load_fastf1_v3.py --seasons 2025 --round 1     # one race only
    python load_fastf1_v3.py --from-round 22              # skip rounds 1-21
    python load_fastf1_v3.py --replay-only                # only redo telemetry replay
    python load_fastf1_v3.py --quali-only                 # only load qualifying data
    python load_fastf1_v3.py --extras-only                # only load track status + weather
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

REPLAY_POINTS_PER_LAP = 32
REPLAY_CHUNK_SIZE     = 200

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

def safe_float(v) -> float | None:
    try:
        f = float(v)
        return None if pd.isna(f) else f
    except (TypeError, ValueError):
        return None

def safe_int(v) -> int | None:
    try:
        return int(v) if pd.notna(v) else None
    except (TypeError, ValueError):
        return None

# ── Qualifying loader ─────────────────────────────────────────────────────────

def load_qualifying(season: int, round_number: int, conn) -> None:
    """Load qualifying session — Q1/Q2/Q3 best times + grid positions."""
    cur = conn.cursor()
    print(f"  → Loading qualifying ...")

    import time
    for attempt in range(3):
        try:
            q_session = f1.get_session(season, round_number, "Q")
            q_session.load(telemetry=False, weather=False, messages=False)
            break
        except Exception as e:
            err = str(e)
            if "500 calls/h" in err or "RateLimitExceeded" in err:
                wait = 3600 if attempt == 0 else 1800
                print(f"  ⏳ Quali rate limit. Waiting {wait//60} min before retry {attempt+1}/3...")
                time.sleep(wait)
            else:
                print(f"  ✗ Qualifying skipped: {e}")
                cur.close()
                return
    else:
        print(f"  ✗ Qualifying skipped after 3 rate limit retries")
        cur.close()
        return

    gp_name = q_session.event["EventName"]
    circuit = q_session.event.get("Location") or q_session.event.get("Country") or "Unknown"
    date    = q_session.date.date() if q_session.date else None

    # Upsert qualifying session
    cur.execute("""
        INSERT INTO sessions (season, round, gp_name, circuit, date, session_type)
        VALUES (%s, %s, %s, %s, %s, 'Q')
        ON CONFLICT (season, round, session_type) DO UPDATE
          SET gp_name = EXCLUDED.gp_name,
              circuit = EXCLUDED.circuit,
              date    = EXCLUDED.date
        RETURNING id
    """, (season, round_number, gp_name, circuit, date))
    q_session_id = cur.fetchone()[0]

    # Clear existing qualifying laps
    cur.execute("DELETE FROM qualifying_laps WHERE session_id = %s", (q_session_id,))
    conn.commit()

    laps = q_session.laps.copy()
    if laps.empty:
        print(f"  ✗ No qualifying laps found")
        cur.close()
        return

    # Best time per driver per Q segment
    # FastF1 laps have a 'Deleted' column for deleted laps
    valid_laps = laps[laps.get("Deleted", pd.Series(False, index=laps.index)) != True].copy()

    drivers = q_session.results["Abbreviation"].tolist() if not q_session.results.empty else []

    rows = []
    for driver in drivers:
        drv_laps = valid_laps[valid_laps["Driver"] == driver]

        def best_q(segment: str) -> int | None:
            seg_laps = drv_laps[drv_laps.get("TrackStatus", pd.Series("", index=drv_laps.index)) != "RED"] if "TrackStatus" in drv_laps.columns else drv_laps
            # Q segment filtering: Q1 = all laps, Q2 = laps where Q2 applicable, etc.
            # FastF1 doesn't have a direct Q segment column, so we use time windows
            # Use the compound approach: just get best lap time for the whole session
            # and trust the results table for segment breakdown
            times = drv_laps["LapTime"].dropna()
            if times.empty:
                return None
            return ms(times.min())

        # Get from results table — more reliable for Q positions
        result_row = q_session.results[q_session.results["Abbreviation"] == driver]
        if result_row.empty:
            continue

        r = result_row.iloc[0]
        grid_pos   = safe_int(r.get("Position"))
        q1_time    = ms(r.get("Q1")) if "Q1" in r.index else None
        q2_time    = ms(r.get("Q2")) if "Q2" in r.index else None
        q3_time    = ms(r.get("Q3")) if "Q3" in r.index else None

        # Best lap time = best of Q3 > Q2 > Q1
        best_time = q3_time or q2_time or q1_time

        # Gap to pole = best time minus P1 best time
        pole_row = q_session.results[q_session.results["Position"] == 1]
        if not pole_row.empty:
            pr = pole_row.iloc[0]
            pole_time = ms(pr.get("Q3")) or ms(pr.get("Q2")) or ms(pr.get("Q1"))
            gap_to_pole = (best_time - pole_time) if best_time and pole_time else None
        else:
            gap_to_pole = None

        # Tyre used on best Q3 lap (start compound for race)
        q3_laps = drv_laps[drv_laps["LapTime"].notna()].sort_values("LapTime")
        final_compound = q3_laps["Compound"].iloc[0] if not q3_laps.empty and "Compound" in q3_laps.columns else None

        rows.append((
            q_session_id, driver,
            q1_time, q2_time, q3_time,
            best_time, gap_to_pole,
            grid_pos, final_compound,
        ))

    if rows:
        cur.executemany("""
            INSERT INTO qualifying_laps
              (session_id, driver_code, q1_ms, q2_ms, q3_ms,
               best_ms, gap_to_pole_ms, grid_position, tyre_compound)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """, rows)
        conn.commit()
        print(f"  → {len(rows)} qualifying results saved")
    else:
        print(f"  ✗ No qualifying results to save")

    cur.close()

# ── Practice session loader ──────────────────────────────────────────────────

def load_practice(season: int, round_number: int, conn) -> None:
    """Load FP1/FP2/FP3 best lap times per driver."""
    cur = conn.cursor()

    for fp_name in ['FP3', 'FP2', 'FP1']:
        print(f"  → Loading {fp_name} ...")
        import time as _time
        fp_session = None
        for attempt in range(2):
            try:
                fp_session = f1.get_session(season, round_number, fp_name)
                fp_session.load(telemetry=False, weather=False, messages=False)
                break
            except Exception as e:
                err = str(e)
                if "500 calls/h" in err or "RateLimitExceeded" in err:
                    _time.sleep(3600)
                elif "does not exist" in err or "not yet available" in err.lower() or "Failed to load" in err:
                    # Sprint weekend (no FP2/FP3) or future session
                    print(f"  ✗ {fp_name} skipped: {e}")
                    fp_session = None
                    break
                else:
                    print(f"  ✗ {fp_name} skipped: {e}")
                    fp_session = None
                    break

        if not fp_session:
            continue

        # Safely check if laps are loaded — future/unavailable sessions throw DataNotLoadedError
        try:
            laps_check = fp_session.laps
            if laps_check is None or laps_check.empty:
                print(f"  ✗ {fp_name}: no lap data")
                continue
        except Exception:
            print(f"  ✗ {fp_name}: session not yet available (future event)")
            continue

        cur.execute("SELECT id FROM sessions WHERE season=%s AND round=%s AND session_type='R' LIMIT 1", (season, round_number))
        row = cur.fetchone()
        if not row:
            continue
        session_id = row[0]

        cur.execute("DELETE FROM practice_laps WHERE session_id=%s AND fp_session=%s", (session_id, fp_name))

        laps  = fp_session.laps.copy()
        valid = laps[laps["LapTime"].notna()].copy()
        if valid.empty:
            continue

        rows = []
        for driver in valid["Driver"].dropna().unique():
            drv        = valid[valid["Driver"] == driver]
            best_ms_v  = ms(drv["LapTime"].min())
            median_ms_v = ms(drv["LapTime"].median())
            lap_count  = len(drv)
            compound   = drv["Compound"].mode().iloc[0] if not drv["Compound"].dropna().empty else None
            if best_ms_v:
                rows.append((session_id, driver, fp_name, best_ms_v, median_ms_v, lap_count, compound))

        if rows:
            cur.executemany("""
                INSERT INTO practice_laps
                  (session_id, driver_code, fp_session, best_lap_ms, median_lap_ms, lap_count, compound)
                VALUES (%s,%s,%s,%s,%s,%s,%s)
            """, rows)
            conn.commit()
            print(f"  → {fp_name}: {len(rows)} driver times saved")

    cur.close()

# ── Track status loader ───────────────────────────────────────────────────────

def load_track_status(session_id: int, session: f1.core.Session, conn) -> None:
    """Load SC / VSC / Red Flag events with lap ranges."""
    cur = conn.cursor()
    print(f"  → Loading track status ...")

    cur.execute("DELETE FROM track_status WHERE session_id = %s", (session_id,))
    conn.commit()

    STATUS_MAP = {
        "1": "CLEAR", "2": "YELLOW", "4": "SC",
        "5": "RED",   "6": "VSC",    "7": "VSC_ENDING",
    }

    try:
        ts = session.track_status
        if ts is None or ts.empty:
            print(f"  ✗ No track status data")
            cur.close()
            return
    except Exception as e:
        print(f"  ✗ Track status error: {e}")
        cur.close()
        return

    # Get per-lap timing reference — prefer leader laps
    laps = session.laps.copy()
    if laps.empty or "LapStartTime" not in laps.columns:
        print(f"  ✗ Cannot map status to laps — no lap timing")
        cur.close()
        return

    ref_laps = (
        laps[laps["Position"] == 1].sort_values("LapNumber")
        if "Position" in laps.columns and (laps["Position"] == 1).any()
        else laps.sort_values("LapNumber")
    ).dropna(subset=["LapNumber", "LapStartTime"]).copy()

    if ref_laps.empty:
        print(f"  ✗ No reference laps for timestamp mapping")
        cur.close()
        return

    # Convert LapStartTime to float seconds for reliable comparison
    # FastF1 uses timedelta — convert via total_seconds()
    def td_to_sec(td) -> float | None:
        try:
            if pd.isnull(td):
                return None
            if hasattr(td, "total_seconds"):
                return td.total_seconds()
            return float(td)
        except Exception:
            return None

    ref_laps["_lap_start_sec"] = ref_laps["LapStartTime"].apply(td_to_sec)
    ref_laps = ref_laps.dropna(subset=["_lap_start_sec"]).sort_values("_lap_start_sec")

    lap_starts = ref_laps["_lap_start_sec"].values
    lap_nums   = ref_laps["LapNumber"].values

    def ts_to_lap(time_val) -> int | None:
        sec = td_to_sec(time_val)
        if sec is None:
            return None
        # Find the last lap that started before this timestamp
        idx = np.searchsorted(lap_starts, sec, side="right") - 1
        if 0 <= idx < len(lap_nums):
            return int(lap_nums[idx])
        # Before first lap — return lap 1
        if sec < lap_starts[0]:
            return int(lap_nums[0])
        return None

    # Walk through track status events and build lap ranges
    rows       = []
    prev_label = None
    prev_lap   = None

    for _, row in ts.iterrows():
        code  = str(row.get("Status", ""))
        label = STATUS_MAP.get(code, f"STATUS_{code}")
        time  = row.get("Time")

        if label == prev_label:
            continue

        lap_num = ts_to_lap(time)

        # Close out previous non-clear status
        if prev_label and prev_label not in ("CLEAR", "YELLOW") and prev_lap is not None:
            end_lap = max(prev_lap, (lap_num - 1) if lap_num else prev_lap)
            rows.append((session_id, prev_lap, end_lap, prev_label))

        prev_label = label
        prev_lap   = lap_num

    # Close final status if race ended under flag
    if prev_label and prev_label not in ("CLEAR", "YELLOW") and prev_lap is not None:
        max_lap = safe_int(laps["LapNumber"].max()) if "LapNumber" in laps.columns else prev_lap
        rows.append((session_id, prev_lap, max_lap or prev_lap, prev_label))

    if rows:
        cur.executemany("""
            INSERT INTO track_status (session_id, lap_start, lap_end, status_type)
            VALUES (%s,%s,%s,%s)
        """, rows)
        conn.commit()
        print(f"  → {len(rows)} track status events saved (SC/VSC/RED)")
    else:
        print(f"  → No SC/VSC/RED events found")

    cur.close()

# ── Weather loader ────────────────────────────────────────────────────────────

def load_weather(session_id: int, session: f1.core.Session, conn) -> None:
    """Load weather data — one row per lap with interpolated conditions."""
    cur = conn.cursor()
    print(f"  → Loading weather ...")

    cur.execute("DELETE FROM weather WHERE session_id = %s", (session_id,))
    conn.commit()

    try:
        # Reload session with weather=True
        # Weather is already loaded if we called session.load(weather=True)
        wx = session.weather_data
        if wx is None or wx.empty:
            print(f"  ✗ No weather data")
            cur.close()
            return
    except Exception as e:
        print(f"  ✗ Weather error: {e}")
        cur.close()
        return

    # Get lap timing for mapping weather timestamps to lap numbers
    laps = session.laps.copy()
    if laps.empty or "LapNumber" not in laps.columns:
        print(f"  ✗ Cannot map weather to laps")
        cur.close()
        return

    # Get one reference per lap (use first driver's laps)
    ref_driver = laps["Driver"].dropna().iloc[0] if not laps["Driver"].dropna().empty else None
    if not ref_driver:
        cur.close()
        return

    ref_laps = (
        laps[laps["Driver"] == ref_driver]
        .sort_values("LapNumber")
        .dropna(subset=["LapNumber"])
    )

    # For each lap, find the weather snapshot closest to lap start time
    rows = []
    wx_time = wx.get("Time", wx.index.to_series() if hasattr(wx.index, 'to_series') else None)

    for _, lap in ref_laps.iterrows():
        lap_num = safe_int(lap["LapNumber"])
        if not lap_num:
            continue

        lap_start = lap.get("LapStartTime")

        # Find closest weather reading
        try:
            if lap_start is not None and not pd.isnull(lap_start) and wx_time is not None:
                time_diffs = abs(wx_time - lap_start)
                closest_idx = time_diffs.idxmin()
                wx_row = wx.loc[closest_idx]
            else:
                wx_row = wx.iloc[0]  # fallback to first reading
        except Exception:
            wx_row = wx.iloc[0]

        rows.append((
            session_id,
            lap_num,
            safe_float(wx_row.get("AirTemp")),
            safe_float(wx_row.get("TrackTemp")),
            safe_float(wx_row.get("Humidity")),
            safe_float(wx_row.get("WindSpeed")),
            safe_float(wx_row.get("WindDirection")),
            bool(wx_row.get("Rainfall", False)),
        ))

    if rows:
        for i in range(0, len(rows), 500):
            cur.executemany("""
                INSERT INTO weather
                  (session_id, lap_number, air_temp, track_temp,
                   humidity, wind_speed, wind_direction, rainfall)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
            """, rows[i:i+500])
            conn.commit()
        print(f"  → {len(rows)} weather readings saved")
    else:
        print(f"  ✗ No weather rows to save")

    cur.close()

# ── Race session loader ───────────────────────────────────────────────────────

def load_session(
    season: int,
    round_number: int,
    conn,
    replay_only:  bool = False,
    quali_only:   bool = False,
    extras_only:  bool = False,
    no_replay:    bool = False,
    fp_only:      bool = False,
) -> None:
    cur = conn.cursor()
    mode = '[REPLAY]' if replay_only else '[QUALI]' if quali_only else '[EXTRAS]' if extras_only else ''
    print(f"\n→ {season} Round {round_number} {mode}...")

    # ── Load FP sessions ────────────────────────────────────────────────────────
    if not replay_only and not extras_only:
        load_practice(season, round_number, conn)

    # ── Load qualifying (unless fp-only) ─────────────────────────────────────
    if not replay_only and not extras_only and not fp_only:
        load_qualifying(season, round_number, conn)

    # ── Skip race loading if quali-only or fp-only ───────────────────────────
    if quali_only or fp_only:
        print(f"  ✓ {'FP' if fp_only else 'Quali'}-only — done")
        cur.close()
        return

    # ── Load race session ──────────────────────────────────────────────────────
    import time
    for attempt in range(3):
        try:
            session = f1.get_session(season, round_number, "R")
            session.load(telemetry=(not extras_only and not no_replay), weather=True, messages=False)
            break
        except Exception as e:
            err = str(e)
            if "500 calls/h" in err or "RateLimitExceeded" in err:
                wait = 3600 if attempt == 0 else 1800
                print(f"  ⏳ Rate limit hit. Waiting {wait//60} min before retry {attempt+1}/3...")
                time.sleep(wait)
            else:
                print(f"  ✗ Skipped: {e}")
                cur.close()
                return
    else:
        print(f"  ✗ Skipped after 3 rate limit retries")
        cur.close()
        return

    # Check race data actually loaded — future/live sessions return 0 drivers
    if len(session.drivers) == 0:
        print(f"  ✗ Skipped: race data not available yet (future or live session)")
        cur.close()
        return

    # Warn if very old season (pre-2018 data quality is poor)
    if season < 2018:
        print(f"  ⚠ Warning: seasons before 2018 have limited FastF1 support")

    gp_name = session.event["EventName"]
    circuit = session.event.get("Location") or session.event.get("Country") or "Unknown"
    date    = session.date.date() if session.date else None
    print(f"  → {gp_name}")

    # Upsert session
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
        cur.execute("DELETE FROM telemetry_replay WHERE session_id = %s", (session_id,))
        conn.commit()
    elif extras_only:
        # Only clear track_status + weather
        for table in ("track_status", "weather"):
            cur.execute(f"DELETE FROM {table} WHERE session_id = %s", (session_id,))
        conn.commit()
    else:
        for table in ("telemetry_replay", "stints", "laps", "results", "track_status", "weather"):
            cur.execute(f"DELETE FROM {table} WHERE session_id = %s", (session_id,))
        conn.commit()

    # ── Track status (always load unless replay-only) ─────────────────────────
    if not replay_only:
        load_track_status(session_id, session, conn)

    # ── Weather (always load unless replay-only) ──────────────────────────────
    if not replay_only:
        load_weather(session_id, session, conn)

    # ── Full race data (skip if extras_only) ──────────────────────────────────
    if not extras_only:

        # Results
        if not replay_only:
            print(f"  → Loading results ...")
            for _, row in session.results.iterrows():
                cur.execute("""
                    INSERT INTO results
                      (session_id, driver_code, team, grid_position,
                       finish_position, points, status, fastest_lap_ms)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                """, (
                    session_id,
                    row.get("Abbreviation"),
                    row.get("TeamName"),
                    safe_int(row.get("GridPosition")),
                    safe_int(row.get("Position")),
                    safe_float(row.get("Points")),
                    row.get("Status"),
                    ms(row.get("FastestLapTime")),
                ))
            conn.commit()

        # Laps
        if not replay_only:
            print(f"  → Loading laps ...")
            laps_df = session.laps.copy()
            lap_cols = [
                "Driver", "LapNumber", "LapTime", "Sector1Time", "Sector2Time",
                "Sector3Time", "Compound", "TyreLife", "IsPersonalBest",
                "PitInTime", "PitOutTime", "Position",
            ]
            laps_df  = laps_df[[c for c in lap_cols if c in laps_df.columns]]
            lap_rows = []
            for _, row in laps_df.iterrows():
                lap_rows.append((
                    session_id, row.get("Driver"),
                    safe_int(row.get("LapNumber")),
                    ms(row.get("LapTime")),
                    ms(row.get("Sector1Time")), ms(row.get("Sector2Time")), ms(row.get("Sector3Time")),
                    row.get("Compound"),
                    safe_int(row.get("TyreLife")),
                    bool(row["IsPersonalBest"]) if pd.notna(row.get("IsPersonalBest")) else None,
                    ms(row.get("PitInTime")), ms(row.get("PitOutTime")),
                    safe_int(row.get("Position")),
                ))
            for i in range(0, len(lap_rows), 500):
                cur.executemany("""
                    INSERT INTO laps
                      (session_id, driver_code, lap_number, lap_time_ms,
                       s1_ms, s2_ms, s3_ms, compound, tyre_life,
                       is_personal_best, pit_in_time_ms, pit_out_time_ms, position)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                """, lap_rows[i:i+500])
                conn.commit()
            print(f"  → {len(lap_rows)} laps saved")

        # Stints
        if not replay_only:
            print(f"  → Computing stints ...")
            laps_df2 = session.laps.copy()
            laps_df2 = laps_df2[[c for c in ["Driver","LapNumber","Compound"] if c in laps_df2.columns]]
            stint_rows = []
            for driver in laps_df2["Driver"].dropna().unique():
                drv_laps = laps_df2[laps_df2["Driver"]==driver].sort_values("LapNumber").dropna(subset=["LapNumber"])
                stint_num, current_compound, stint_start, prev_lap = 0, None, None, None
                for _, lap in drv_laps.iterrows():
                    compound = lap.get("Compound")
                    lap_num  = int(lap["LapNumber"])
                    if compound != current_compound:
                        if current_compound is not None and stint_start is not None:
                            stint_rows.append((session_id, driver, stint_num, current_compound, stint_start, prev_lap, prev_lap-stint_start+1))
                        stint_num += 1
                        current_compound = compound
                        stint_start = lap_num
                    prev_lap = lap_num
                if current_compound and stint_start and prev_lap:
                    stint_rows.append((session_id, driver, stint_num, current_compound, stint_start, prev_lap, prev_lap-stint_start+1))
            cur.executemany("""
                INSERT INTO stints (session_id, driver_code, stint_number, compound, start_lap, end_lap, lap_count)
                VALUES (%s,%s,%s,%s,%s,%s,%s)
            """, stint_rows)
            conn.commit()
            print(f"  → {len(stint_rows)} stints saved")

        # Telemetry replay
        if no_replay:
            print(f"  → Skipping telemetry replay (--no-replay)")
            print(f"  ✓ Done — session_id={session_id}")
            cur.close()
            return
        print(f"  → Loading telemetry replay ...")
        total_laps = safe_int(session.laps["LapNumber"].max()) if "LapNumber" in session.laps.columns else 0
        if total_laps and total_laps > 0:
            replay_rows = []
            for drv_num in session.drivers:
                try:
                    drv_code = session.get_driver(drv_num)["Abbreviation"]
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
                    if not {"X","Y","Distance"}.issubset(tel.columns) or len(tel) < 4:
                        continue
                    idx = np.linspace(0, len(tel)-1, REPLAY_POINTS_PER_LAP, dtype=int)
                    for sample_idx, (_, trow) in enumerate(tel.iloc[idx].iterrows()):
                        replay_rows.append((session_id, drv_code, int(lap_num), sample_idx, float(trow["X"]), float(trow["Y"])))
            if replay_rows:
                for i in range(0, len(replay_rows), REPLAY_CHUNK_SIZE):
                    cur.executemany("""
                        INSERT INTO telemetry_replay (session_id, driver_code, lap_number, frame, x, y)
                        VALUES (%s,%s,%s,%s,%s,%s)
                    """, replay_rows[i:i+REPLAY_CHUNK_SIZE])
                    conn.commit()
                print(f"  → {len(replay_rows)} replay points saved")
            else:
                print(f"  → No telemetry available")

    print(f"  ✓ Done — session_id={session_id}")
    cur.close()

# ── Season loader ─────────────────────────────────────────────────────────────

def load_season(
    season: int,
    round_filter: int | None = None,
    from_round:   int | None = None,
    replay_only:  bool = False,
    quali_only:   bool = False,
    extras_only:  bool = False,
    no_replay:    bool = False,
    fp_only:      bool = False,
) -> None:
    import time
    for attempt in range(3):
        try:
            schedule = f1.get_event_schedule(season, include_testing=False)
            break
        except Exception as e:
            if "500 calls/h" in str(e) or "RateLimitExceeded" in str(e):
                wait = 3600 if attempt == 0 else 1800
                print(f"  ⏳ Schedule rate limit. Waiting {wait//60} min...")
                time.sleep(wait)
            else:
                print(f"  ✗ Cannot get schedule for {season}: {e}")
                return
    else:
        print(f"  ✗ Cannot get schedule after retries")
        return
    conn = get_conn()
    try:
        for _, event in schedule.iterrows():
            round_num = int(event["RoundNumber"])
            if round_filter and round_num != round_filter:
                continue
            if from_round and round_num < from_round:
                print(f"  ↷ Skipping R{round_num} (before --from-round {from_round})")
                continue
            try:
                conn.cursor().execute("SELECT 1")
            except Exception:
                conn = get_conn()
            load_session(season, round_num, conn,
                         replay_only=replay_only,
                         quali_only=quali_only,
                         extras_only=extras_only,
                         no_replay=no_replay,
                         fp_only=fp_only)
    finally:
        conn.close()

# ── CLI ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="F1 Bulletin FastF1 → Neon ETL v3")
    parser.add_argument("--seasons",     nargs="+", type=int, default=[2025, 2026])
    parser.add_argument("--round",       type=int,  default=None, help="Single round only")
    parser.add_argument("--from-round",  type=int,  default=None, help="Skip rounds before N")
    parser.add_argument("--replay-only", action="store_true", help="Only redo telemetry replay")
    parser.add_argument("--quali-only",  action="store_true", help="Only load qualifying data")
    parser.add_argument("--extras-only", action="store_true", help="Only load track status + weather")
    parser.add_argument("--fp-only",     action="store_true", help="Only load FP1/FP2/FP3")
    parser.add_argument("--no-replay",   action="store_true", help="Skip telemetry replay (much faster)")
    args = parser.parse_args()

    mode = (
        'REPLAY ONLY' if args.replay_only else
        'QUALI ONLY'  if args.quali_only  else
        'EXTRAS ONLY' if args.extras_only else
        'FP ONLY'     if args.fp_only     else
        'NO REPLAY'   if args.no_replay   else
        'FULL'
    )

    for season in args.seasons:
        print(f"\n{'='*52}")
        print(f"  SEASON {season} — {mode}{f' — FROM R{args.from_round}' if args.from_round else ''}")
        print(f"{'='*52}")
        load_season(
            season,
            round_filter=args.round,
            from_round=args.from_round,
            replay_only=args.replay_only,
            quali_only=args.quali_only,
            extras_only=args.extras_only,
            no_replay=args.no_replay,
        fp_only=args.fp_only,
        )

    print("\n✓ All done")

if __name__ == "__main__":
    main()