"""
F1 Bulletin — FastF1 → Neon ETL v3
Loads race + qualifying + sprint sessions into Neon Postgres.
New in v3:
  - Qualifying laps (Q1/Q2/Q3 best times, grid position, gap to pole)
  - Track status per race (SC / VSC / Red Flag lap ranges)
  - Weather per lap (air temp, track temp, humidity, wind, rainfall)
  - Distance-sampled telemetry replay (drivers spread around circuit)
  - Sprint race results + laps (session_type = 'S')
Usage:
    python load_fastf1_v3.py                              # loads 2025 + 2026 (full)
    python load_fastf1_v3.py --seasons 2025               # loads 2025 only
    python load_fastf1_v3.py --seasons 2025 --round 1     # one race only
    python load_fastf1_v3.py --from-round 22              # skip rounds 1-21
    python load_fastf1_v3.py --replay-only                # only redo telemetry replay
    python load_fastf1_v3.py --quali-only                 # only load qualifying data
    python load_fastf1_v3.py --extras-only                # only load track status + weather
    python load_fastf1_v3.py --no-replay                  # skip telemetry (much faster)
    python load_fastf1_v3.py --fp-only                    # only load FP1/FP2/FP3
    python load_fastf1_v3.py --sprint-only                # only load sprint results
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

REPLAY_FRAMES_PER_LAP = 64
REPLAY_CHUNK_SIZE     = 500

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

# ── Sprint loader ─────────────────────────────────────────────────────────────
def load_sprint(season: int, round_number: int, conn) -> None:
    """
    Load Sprint race results + laps into sessions (session_type='S') and results.
    Only runs on sprint weekends — silently skips if no sprint session exists.
    Points use the official Sprint points system: 8-7-6-5-4-3-2-1 for P1-P8.
    FastF1 returns the correct points directly from the results, so no manual
    mapping needed — we just use row["Points"] as-is.
    """
    import time
    cur = conn.cursor()
    print(f"  → Loading sprint ...")

    sprint_session = None
    for attempt in range(3):
        try:
            sprint_session = f1.get_session(season, round_number, "S")
            sprint_session.load(telemetry=False, weather=False, messages=False)
            break
        except Exception as e:
            err = str(e)
            if "500 calls/h" in err or "RateLimitExceeded" in err:
                wait = 3600 if attempt == 0 else 1800
                print(f"  ⏳ Sprint rate limit. Waiting {wait//60} min before retry {attempt+1}/3...")
                time.sleep(wait)
            elif any(x in err.lower() for x in ["does not exist", "not yet available", "failed to load", "no sprint"]):
                print(f"  → No sprint session this round — skipping")
                cur.close()
                return
            else:
                print(f"  ✗ Sprint skipped: {e}")
                cur.close()
                return
    else:
        print(f"  ✗ Sprint skipped after 3 rate limit retries")
        cur.close()
        return

    if sprint_session is None or len(sprint_session.drivers) == 0:
        print(f"  → Sprint data not available yet — skipping")
        cur.close()
        return

    gp_name = sprint_session.event["EventName"]
    circuit = sprint_session.event.get("Location") or sprint_session.event.get("Country") or "Unknown"
    date    = sprint_session.date.date() if sprint_session.date else None

    # Upsert sprint session row
    cur.execute("""
        INSERT INTO sessions (season, round, gp_name, circuit, date, session_type)
        VALUES (%s, %s, %s, %s, %s, 'S')
        ON CONFLICT (season, round, session_type) DO UPDATE
          SET gp_name = EXCLUDED.gp_name,
              circuit = EXCLUDED.circuit,
              date    = EXCLUDED.date
        RETURNING id
    """, (season, round_number, gp_name, circuit, date))
    sprint_session_id = cur.fetchone()[0]

    # Clear existing sprint results + laps for this session
    cur.execute("DELETE FROM results WHERE session_id = %s", (sprint_session_id,))
    cur.execute("DELETE FROM laps    WHERE session_id = %s", (sprint_session_id,))
    conn.commit()

    # Results
    if not sprint_session.results.empty:
        for _, row in sprint_session.results.iterrows():
            cur.execute("""
                INSERT INTO results
                  (session_id, driver_code, team, grid_position,
                   finish_position, points, status, fastest_lap_ms)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
            """, (
                sprint_session_id,
                row.get("Abbreviation"),
                row.get("TeamName"),
                safe_int(row.get("GridPosition")),
                safe_int(row.get("Position")),
                safe_float(row.get("Points")),   # FastF1 returns correct sprint points
                row.get("Status"),
                ms(row.get("FastestLapTime")),
            ))
        conn.commit()
        print(f"  → {len(sprint_session.results)} sprint results saved")
    else:
        print(f"  ✗ No sprint results found")

    # Laps
    laps_df = sprint_session.laps.copy()
    if not laps_df.empty:
        lap_cols = [
            "Driver", "LapNumber", "LapTime", "Sector1Time", "Sector2Time",
            "Sector3Time", "Compound", "TyreLife", "IsPersonalBest",
            "PitInTime", "PitOutTime", "Position",
        ]
        laps_df  = laps_df[[c for c in lap_cols if c in laps_df.columns]]
        lap_rows = []
        for _, row in laps_df.iterrows():
            lap_rows.append((
                sprint_session_id, row.get("Driver"),
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
        print(f"  → {len(lap_rows)} sprint laps saved")

    print(f"  ✓ Sprint done — session_id={sprint_session_id}")
    cur.close()


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
    cur.execute("DELETE FROM qualifying_laps WHERE session_id = %s", (q_session_id,))
    conn.commit()

    laps = q_session.laps.copy()
    if laps.empty:
        print(f"  ✗ No qualifying laps found")
        cur.close()
        return

    drivers = q_session.results["Abbreviation"].tolist() if not q_session.results.empty else []
    rows = []
    for driver in drivers:
        result_row = q_session.results[q_session.results["Abbreviation"] == driver]
        if result_row.empty:
            continue
        r = result_row.iloc[0]
        grid_pos  = safe_int(r.get("Position"))
        q1_time   = ms(r.get("Q1")) if "Q1" in r.index else None
        q2_time   = ms(r.get("Q2")) if "Q2" in r.index else None
        q3_time   = ms(r.get("Q3")) if "Q3" in r.index else None
        best_time = q3_time or q2_time or q1_time
        pole_row  = q_session.results[q_session.results["Position"] == 1]
        if not pole_row.empty:
            pr        = pole_row.iloc[0]
            pole_time = ms(pr.get("Q3")) or ms(pr.get("Q2")) or ms(pr.get("Q1"))
            gap_to_pole = (best_time - pole_time) if best_time and pole_time else None
        else:
            gap_to_pole = None
        drv_laps       = laps[laps["Driver"] == driver]
        q3_laps        = drv_laps[drv_laps["LapTime"].notna()].sort_values("LapTime")
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


# ── Practice session loader ───────────────────────────────────────────────────
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
                    print(f"  ✗ {fp_name} skipped: {e}")
                    fp_session = None
                    break
                else:
                    print(f"  ✗ {fp_name} skipped: {e}")
                    fp_session = None
                    break
        if not fp_session:
            continue
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
            drv         = valid[valid["Driver"] == driver]
            best_ms_v   = ms(drv["LapTime"].min())
            median_ms_v = ms(drv["LapTime"].median())
            lap_count   = len(drv)
            compound    = drv["Compound"].mode().iloc[0] if not drv["Compound"].dropna().empty else None
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

    def td_to_sec(td) -> float | None:
        try:
            if pd.isnull(td): return None
            if hasattr(td, "total_seconds"): return td.total_seconds()
            return float(td)
        except Exception:
            return None

    ref_laps["_lap_start_sec"] = ref_laps["LapStartTime"].apply(td_to_sec)
    ref_laps = ref_laps.dropna(subset=["_lap_start_sec"]).sort_values("_lap_start_sec")
    lap_starts = ref_laps["_lap_start_sec"].values
    lap_nums   = ref_laps["LapNumber"].values

    def ts_to_lap(time_val) -> int | None:
        sec = td_to_sec(time_val)
        if sec is None: return None
        idx = np.searchsorted(lap_starts, sec, side="right") - 1
        if 0 <= idx < len(lap_nums): return int(lap_nums[idx])
        if sec < lap_starts[0]: return int(lap_nums[0])
        return None

    rows = []
    prev_label, prev_lap = None, None
    for _, row in ts.iterrows():
        code  = str(row.get("Status", ""))
        label = STATUS_MAP.get(code, f"STATUS_{code}")
        time  = row.get("Time")
        if label == prev_label:
            continue
        lap_num = ts_to_lap(time)
        if prev_label and prev_label not in ("CLEAR", "YELLOW") and prev_lap is not None:
            end_lap = max(prev_lap, (lap_num - 1) if lap_num else prev_lap)
            rows.append((session_id, prev_lap, end_lap, prev_label))
        prev_label = label
        prev_lap   = lap_num
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
        wx = session.weather_data
        if wx is None or wx.empty:
            print(f"  ✗ No weather data")
            cur.close()
            return
    except Exception as e:
        print(f"  ✗ Weather error: {e}")
        cur.close()
        return
    laps = session.laps.copy()
    if laps.empty or "LapNumber" not in laps.columns:
        print(f"  ✗ Cannot map weather to laps")
        cur.close()
        return
    ref_driver = laps["Driver"].dropna().iloc[0] if not laps["Driver"].dropna().empty else None
    if not ref_driver:
        cur.close()
        return
    ref_laps = (
        laps[laps["Driver"] == ref_driver]
        .sort_values("LapNumber")
        .dropna(subset=["LapNumber"])
    )
    rows = []
    wx_time = wx.get("Time", wx.index.to_series() if hasattr(wx.index, 'to_series') else None)
    for _, lap in ref_laps.iterrows():
        lap_num   = safe_int(lap["LapNumber"])
        if not lap_num: continue
        lap_start = lap.get("LapStartTime")
        try:
            if lap_start is not None and not pd.isnull(lap_start) and wx_time is not None:
                time_diffs  = abs(wx_time - lap_start)
                closest_idx = time_diffs.idxmin()
                wx_row      = wx.loc[closest_idx]
            else:
                wx_row = wx.iloc[0]
        except Exception:
            wx_row = wx.iloc[0]
        rows.append((
            session_id, lap_num,
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


# ── Distance-sampled telemetry replay ─────────────────────────────────────────
def load_replay(session_id: int, session: f1.core.Session, conn) -> None:
    cur = conn.cursor()
    print(f"  → Loading telemetry replay (distance-sampled, {REPLAY_FRAMES_PER_LAP} frames/lap) ...")
    cur.execute("DELETE FROM telemetry_replay WHERE session_id = %s", (session_id,))
    conn.commit()
    rows     = []
    laps     = session.laps
    pos_data = getattr(session, "pos_data", {})
    if not pos_data:
        print(f"  ✗ No position data available (session.pos_data is empty)")
        cur.close()
        return
    for drv_num in session.drivers:
        try:
            drv_code = session.get_driver(drv_num)["Abbreviation"]
        except Exception:
            continue
        drv_laps = laps[laps["Driver"] == drv_code].copy()
        if drv_laps.empty:
            continue
        drv_pos = pos_data.get(str(drv_num))
        if drv_pos is None or drv_pos.empty:
            continue
        if not {"X", "Y", "Time"}.issubset(drv_pos.columns):
            continue
        pos_sorted_time = drv_pos.sort_values("Time").reset_index(drop=True)
        for _, lap_row in drv_laps.iterrows():
            lap_num   = safe_int(lap_row.get("LapNumber"))
            lap_start = lap_row.get("LapStartTime")
            lap_time  = lap_row.get("LapTime")
            if not lap_num or pd.isnull(lap_start):
                continue
            if not pd.isnull(lap_time):
                lap_end = lap_start + lap_time
            else:
                next_laps = drv_laps[drv_laps["LapNumber"] == lap_num + 1]
                if not next_laps.empty and not pd.isnull(next_laps.iloc[0].get("LapStartTime")):
                    lap_end = next_laps.iloc[0]["LapStartTime"]
                else:
                    lap_end = lap_start + pd.Timedelta(seconds=200)
            try:
                lap_pos = pos_sorted_time[
                    (pos_sorted_time["Time"] >= lap_start) &
                    (pos_sorted_time["Time"] <  lap_end)
                ].copy()
            except Exception:
                continue
            if len(lap_pos) < 5:
                continue
            xs    = lap_pos["X"].values.astype(float)
            ys    = lap_pos["Y"].values.astype(float)
            diffs = np.sqrt(np.diff(xs)**2 + np.diff(ys)**2)
            dist  = np.concatenate([[0], np.cumsum(diffs)])
            lap_pos = lap_pos.copy()
            lap_pos["Distance"] = dist
            total_dist = dist[-1]
            if total_dist < 100:
                continue
            for frame_idx in range(REPLAY_FRAMES_PER_LAP):
                target_d = total_dist * frame_idx / REPLAY_FRAMES_PER_LAP
                idx = int(np.abs(dist - target_d).argmin())
                x = float(xs[idx])
                y = float(ys[idx])
                if x == 0 and y == 0:
                    continue
                rows.append((session_id, drv_code, frame_idx, lap_num, x, y))
    if not rows:
        print(f"  ✗ No replay data generated")
        cur.close()
        return
    for i in range(0, len(rows), REPLAY_CHUNK_SIZE):
        chunk = rows[i:i+REPLAY_CHUNK_SIZE]
        cur.executemany("""
            INSERT INTO telemetry_replay (session_id, driver_code, frame, lap_number, x, y)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, chunk)
        conn.commit()
    n_drivers = len(set(r[1] for r in rows))
    n_laps    = len(set((r[1], r[3]) for r in rows))
    print(f"  → {len(rows)} replay points — {n_drivers} drivers, {n_laps} laps, {REPLAY_FRAMES_PER_LAP} frames/lap")
    cur.close()


# ── Race session loader ───────────────────────────────────────────────────────
def load_session(
    season:       int,
    round_number: int,
    conn,
    replay_only:  bool = False,
    quali_only:   bool = False,
    extras_only:  bool = False,
    no_replay:    bool = False,
    fp_only:      bool = False,
    sprint_only:  bool = False,
) -> None:
    cur = conn.cursor()
    mode = (
        '[REPLAY]'  if replay_only  else
        '[QUALI]'   if quali_only   else
        '[EXTRAS]'  if extras_only  else
        '[FP]'      if fp_only      else
        '[SPRINT]'  if sprint_only  else ''
    )
    print(f"\n→ {season} Round {round_number} {mode}...")

    # ── Practice ──────────────────────────────────────────────────────────────
    if not replay_only and not extras_only and not quali_only and not sprint_only:
        load_practice(season, round_number, conn)

    # ── Qualifying ────────────────────────────────────────────────────────────
    if not replay_only and not extras_only and not fp_only and not sprint_only:
        load_qualifying(season, round_number, conn)

    # ── Sprint ────────────────────────────────────────────────────────────────
    # Always attempt sprint unless explicitly excluded modes
    if not replay_only and not extras_only and not fp_only and not quali_only:
        load_sprint(season, round_number, conn)

    # ── Stop here if fp-only / quali-only / sprint-only ───────────────────────
    if fp_only or quali_only or sprint_only:
        print(f"  ✓ {'FP' if fp_only else 'Quali' if quali_only else 'Sprint'}-only — done")
        cur.close()
        return

    # ── Load race session ─────────────────────────────────────────────────────
    import time
    load_telemetry = not extras_only and not no_replay
    for attempt in range(3):
        try:
            session = f1.get_session(season, round_number, "R")
            session.load(telemetry=load_telemetry, weather=True, messages=False)
            break
        except Exception as e:
            err = str(e)
            if "500 calls/h" in err or "RateLimitExceeded" in err:
                wait = 3600 if attempt == 0 else 1800
                print(f"  ⏳ Rate limit. Waiting {wait//60} min before retry {attempt+1}/3...")
                time.sleep(wait)
            else:
                print(f"  ✗ Skipped: {e}")
                cur.close()
                return
    else:
        print(f"  ✗ Skipped after 3 rate limit retries")
        cur.close()
        return

    if len(session.drivers) == 0:
        print(f"  ✗ Skipped: race data not available yet")
        cur.close()
        return

    gp_name = session.event["EventName"]
    circuit = session.event.get("Location") or session.event.get("Country") or "Unknown"
    date    = session.date.date() if session.date else None
    print(f"  → {gp_name}")

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
    conn.commit()

    if replay_only:
        cur.execute("DELETE FROM telemetry_replay WHERE session_id = %s", (session_id,))
    elif extras_only:
        for tbl in ("track_status", "weather"):
            cur.execute(f"DELETE FROM {tbl} WHERE session_id = %s", (session_id,))
    else:
        for tbl in ("telemetry_replay", "stints", "laps", "results", "track_status", "weather"):
            cur.execute(f"DELETE FROM {tbl} WHERE session_id = %s", (session_id,))
    conn.commit()

    if not replay_only:
        load_track_status(session_id, session, conn)
    if not replay_only:
        load_weather(session_id, session, conn)

    if not extras_only:
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

        if not replay_only:
            print(f"  → Loading laps ...")
            laps_df  = session.laps.copy()
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

        if not replay_only:
            print(f"  → Computing stints ...")
            laps_df2   = session.laps.copy()
            laps_df2   = laps_df2[[c for c in ["Driver","LapNumber","Compound"] if c in laps_df2.columns]]
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

        if no_replay:
            print(f"  → Skipping telemetry replay (--no-replay)")
        else:
            load_replay(session_id, session, conn)

    print(f"  ✓ Done — session_id={session_id}")
    cur.close()


# ── Season loader ─────────────────────────────────────────────────────────────
def load_season(
    season:       int,
    round_filter: int | None = None,
    from_round:   int | None = None,
    replay_only:  bool = False,
    quali_only:   bool = False,
    extras_only:  bool = False,
    no_replay:    bool = False,
    fp_only:      bool = False,
    sprint_only:  bool = False,
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
            load_session(
                season, round_num, conn,
                replay_only=replay_only,
                quali_only=quali_only,
                extras_only=extras_only,
                no_replay=no_replay,
                fp_only=fp_only,
                sprint_only=sprint_only,
            )
    finally:
        conn.close()


# ── CLI ───────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="F1 Bulletin FastF1 → Neon ETL v3")
    parser.add_argument("--seasons",      nargs="+", type=int, default=[2025, 2026])
    parser.add_argument("--round",        type=int,  default=None, help="Single round only")
    parser.add_argument("--from-round",   type=int,  default=None, help="Skip rounds before N")
    parser.add_argument("--replay-only",  action="store_true", help="Only redo telemetry replay")
    parser.add_argument("--quali-only",   action="store_true", help="Only load qualifying data")
    parser.add_argument("--extras-only",  action="store_true", help="Only load track status + weather")
    parser.add_argument("--fp-only",      action="store_true", help="Only load FP1/FP2/FP3")
    parser.add_argument("--sprint-only",  action="store_true", help="Only load sprint results")
    parser.add_argument("--no-replay",    action="store_true", help="Skip telemetry replay (much faster)")
    args = parser.parse_args()

    mode = (
        'REPLAY ONLY'  if args.replay_only  else
        'QUALI ONLY'   if args.quali_only   else
        'EXTRAS ONLY'  if args.extras_only  else
        'FP ONLY'      if args.fp_only      else
        'SPRINT ONLY'  if args.sprint_only  else
        'NO REPLAY'    if args.no_replay    else
        'FULL'
    )

    for season in args.seasons:
        print(f"\n{'='*52}")
        print(f"  SEASON {season} — {mode}{f' — FROM R{args.from_round}' if args.from_round else ''}")
        print(f"{'='*52}")
        load_season(
            season,
            round_filter=args.round,
            from_round=getattr(args, 'from_round', None),
            replay_only=args.replay_only,
            quali_only=args.quali_only,
            extras_only=args.extras_only,
            no_replay=args.no_replay,
            fp_only=args.fp_only,
            sprint_only=args.sprint_only,
        )

    print("\n✓ All done")


if __name__ == "__main__":
    main()