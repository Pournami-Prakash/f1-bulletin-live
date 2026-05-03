"""
F1 Live Race Re-Prediction
Pulls live race state (positions, tyres, SC) and re-runs MC from current lap forward.

Usage:
    python live_repredict.py --season 2026 --round 4            # fetch live from OpenF1
    python live_repredict.py --season 2026 --round 4 --snapshot # use live_state.json snapshot
"""
from __future__ import annotations
import argparse, json, os, warnings
warnings.filterwarnings('ignore')
import numpy as np
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / "web" / ".env.local")

# Re-use everything from predict.py
from predict import (
    step, get_entry_list, simulate_race, compute_predictions,
    bayesian_prior, load_artifacts, get_target_race,
    apply_calibration, load_calibrator, count_completed_races,
    POINTS_MAP, MC_RUNS, RACE_LAPS_BY_CIRCUIT,
    PIT_CREW_SPEED, COMPOUND_DEG, PIT_LANE_DELTA, MAX_POSITION_GAIN,
    traffic_tyre_factor,
)

OPENF1_BASE = "https://api.openf1.org/v1"

# Map F1 driver numbers → codes used in our DB
DRIVER_NUMBER_MAP = {
    1: "NOR", 3: "VER", 4: "NOR", 6: "HAD", 10: "GAS", 11: "PER",
    12: "ANT", 14: "ALO", 16: "LEC", 18: "STR", 20: "MAG", 22: "TSU",
    23: "ALB", 24: "ZHO", 27: "HUL", 30: "LAW", 31: "OCO", 38: "BEA",
    40: "COL", 41: "LIN", 43: "COL", 44: "HAM", 55: "SAI", 63: "RUS",
    77: "BOT", 81: "PIA", 87: "BEA", 5: "BOR",
}

COMPOUND_MAP = {"SOFT": "SOFT", "MEDIUM": "MEDIUM", "HARD": "HARD",
                "INTERMEDIATE": "INTERMEDIATE", "WET": "WET",
                "soft": "SOFT", "medium": "MEDIUM", "hard": "HARD"}


# ─────────────────────────────────────────────────────────────
# OPENF1 FETCHERS
# ─────────────────────────────────────────────────────────────
def openf1_get(endpoint: str, params: dict) -> list:
    try:
        r = requests.get(f"{OPENF1_BASE}/{endpoint}", params=params, timeout=10)
        r.raise_for_status()
        return r.json()
    except Exception as ex:
        step(f"  OpenF1 {endpoint} failed: {ex}")
        return []


def get_session_key(season: int, round_: int) -> int | None:
    sessions = openf1_get("sessions", {"year": season, "session_name": "Race"})
    # Filter by round number if available, else take the most recent
    for s in sessions:
        if s.get("round_number") == round_:
            return s["session_key"]
    if sessions:
        return sessions[-1]["session_key"]
    return None


def fetch_live_state(season: int, round_: int) -> dict | None:
    step("  Fetching live state from OpenF1...")
    session_key = get_session_key(season, round_)
    if not session_key:
        step("  Could not resolve session_key — is the race live?")
        return None
    step(f"  Session key: {session_key}")

    # Current positions
    positions_raw = openf1_get("position", {"session_key": session_key})
    # OpenF1 returns all position updates — take latest per driver
    latest_pos: dict[int, dict] = {}
    for row in positions_raw:
        dn = row["driver_number"]
        if dn not in latest_pos or row["date"] > latest_pos[dn]["date"]:
            latest_pos[dn] = row

    # Current lap number
    laps_raw = openf1_get("laps", {"session_key": session_key})
    current_lap = max((r.get("lap_number", 0) for r in laps_raw), default=1)

    # Tyre stints — latest stint per driver
    stints_raw = openf1_get("stints", {"session_key": session_key})
    latest_stint: dict[int, dict] = {}
    for row in stints_raw:
        dn = row["driver_number"]
        if dn not in latest_stint or row.get("stint_number", 0) > latest_stint[dn].get("stint_number", 0):
            latest_stint[dn] = row

    # Race control — check for safety car
    rc_raw = openf1_get("race_control", {"session_key": session_key})
    sc_messages = [r for r in rc_raw if "SAFETY CAR" in str(r.get("message", "")).upper()
                   or "VIRTUAL SAFETY CAR" in str(r.get("message", "")).upper()]
    sc_active = False
    if sc_messages:
        last_sc = sorted(sc_messages, key=lambda x: x.get("date", ""))[-1]
        msg = str(last_sc.get("message", "")).upper()
        sc_active = "DEPLOYED" in msg or "SAFETY CAR" in msg and "ENDED" not in msg

    # Retirements — drivers not in latest position data or with DNF status
    all_driver_numbers = list(latest_pos.keys())

    positions = []
    for dn, pos_row in sorted(latest_pos.items(), key=lambda x: x[1].get("position", 99)):
        driver_code = DRIVER_NUMBER_MAP.get(dn)
        if not driver_code:
            continue
        stint = latest_stint.get(dn, {})
        compound = COMPOUND_MAP.get(stint.get("compound", ""), "MEDIUM")
        # Tyre age = laps completed in current stint
        stint_start = stint.get("lap_start", current_lap)
        tyre_age = max(0, current_lap - stint_start)

        positions.append({
            "driver_code": driver_code,
            "position":    pos_row.get("position", 99),
            "tyre":        compound,
            "tyre_age":    tyre_age,
            "dnf":         False,
        })

    step(f"  Live state: lap {current_lap}, {len(positions)} active drivers, SC={'YES' if sc_active else 'NO'}")

    return {
        "season":            season,
        "round":             round_,
        "current_lap":       current_lap,
        "total_laps":        RACE_LAPS_BY_CIRCUIT.get("Miami Gardens", 57),
        "safety_car_active": sc_active,
        "positions":         positions,
    }


def load_snapshot() -> dict:
    path = Path(__file__).with_name("live_state.json")
    with open(path) as f:
        return json.load(f)


# ─────────────────────────────────────────────────────────────
# LIVE SIMULATE — runs MC from current lap forward
# ─────────────────────────────────────────────────────────────
def simulate_from_live(entries: list[dict], live: dict, artifacts: dict) -> dict[str, list[int]]:
    current_lap    = live["current_lap"]
    total_laps     = live["total_laps"]
    remaining_laps = total_laps - current_lap
    sc_at_start    = live.get("safety_car_active", False)

    # Build lookup from live state
    live_by_code = {p["driver_code"]: p for p in live["positions"]}
    dnf_codes    = {p["driver_code"] for p in live["positions"] if p["dnf"]}

    # Patch entries with live positions and tyre state
    live_entries = []
    for e in entries:
        d = e["driver_code"]
        if d in dnf_codes:
            continue  # already retired
        lp = live_by_code.get(d)
        if lp is None:
            continue
        patched = dict(e)
        patched["live_position"] = lp["position"]
        patched["live_tyre"]     = lp.get("tyre") or e.get("start_compound", "MEDIUM")
        patched["live_tyre_age"] = lp.get("tyre_age", 0)
        live_entries.append(patched)

    live_entries.sort(key=lambda x: x["live_position"])
    n = len(live_entries)
    if n == 0:
        return {}

    results       = {e["driver_code"]: [] for e in live_entries}
    entry_by_code = {e["driver_code"]: e for e in live_entries}

    circuit        = live_entries[0].get("circuit", "Miami Gardens")
    pit_delta_sec  = PIT_LANE_DELTA.get(circuit, PIT_LANE_DELTA["default"])
    avg_lap_sec    = 90.0
    pit_pos_loss   = pit_delta_sec / avg_lap_sec * n * 0.3
    reg_era        = live_entries[0].get("regulation_era", 1)
    active_aero    = bool(live_entries[0].get("active_aero", 1))
    energy_demand  = float(live_entries[0].get("energy_demand_index", 0.82))
    wet_factor     = float(live_entries[0].get("wet_ers_deploy_factor", 0.42)) if live_entries[0].get("had_rain") else 1.0
    overtake_bonus = float(live_entries[0].get("overtake_mode_bonus_mj", 0.5))
    x_mode_drag    = float(live_entries[0].get("x_mode_drag_reduction", 0.55))
    quali_gap_weight = 0.42

    sc_race_prob   = float(live_entries[0].get("sc_race_probability", 0.667))  # Miami SC prob
    strategy_entropy = float(live_entries[0].get("strategy_entropy", 0.5))
    one_stop_rate  = float(live_entries[0].get("one_stop_rate", 0.45))
    two_stop_rate  = float(live_entries[0].get("two_stop_rate", 0.35))
    first_stop_median = float(live_entries[0].get("first_stop_median_lap", 20.0))

    for run in range(MC_RUNS):
        positions  = {e["driver_code"]: float(e["live_position"]) for e in live_entries}
        start_pos  = {e["driver_code"]: e["live_position"] for e in live_entries}
        tyre_age   = {e["driver_code"]: e["live_tyre_age"] for e in live_entries}
        tyre_type  = {e["driver_code"]: e["live_tyre"] for e in live_entries}
        pit_count  = {e["driver_code"]: 1 for e in live_entries}  # already pitted once (SC stop)
        retired    = set()

        # Build per-run pace — same logic as predict.py but from live positions
        pace_ms = {}
        for e in live_entries:
            elo_adj      = (1500 - e["elo_rating"]) * 0.34
            team_adj     = (e.get("team_strength", 10.5) - 8.5) * 18
            form_adj     = (e.get("rolling_avg_finish", 10.5) - 8.5) * 16
            overperf_adj = -e.get("driver_overperformance", 0.0) * 28
            fp_adj       = e.get("fp_pace_adj", 0.0) * 900
            era_noise    = 120 + 80 + (70 * energy_demand)
            noise        = np.random.normal(0, era_noise)
            # Use live position gap as pace proxy rather than qualifying gap
            live_pos_gap = (e["live_position"] - 1) * 0.18 * 1000 * quali_gap_weight
            pace_ms[e["driver_code"]] = live_pos_gap + elo_adj + team_adj + form_adj + overperf_adj + fp_adj + noise

        sc_active    = sc_at_start
        sc_laps_left = np.random.randint(2, 5) if sc_active else 0
        sc_count     = 1 if sc_active else 0

        for lap in range(1, remaining_laps + 1):
            abs_lap = current_lap + lap

            if not sc_active and sc_count < 3:
                phase = ("early" if abs_lap <= total_laps * 0.33 else
                         "middle" if abs_lap <= total_laps * 0.67 else "late")
                phase_w = 3.0
                if np.random.random() < sc_race_prob * phase_w / total_laps:
                    sc_active    = True
                    sc_laps_left = np.random.randint(3, 8)
                    sc_count    += 1
            if sc_active:
                sc_laps_left -= 1
                if sc_laps_left <= 0:
                    sc_active = False

            pos_sorted = sorted(
                [d for d in positions if d not in retired],
                key=lambda d: positions[d],
            )

            for i, d in enumerate(pos_sorted):
                e           = entry_by_code[d]
                current_pos = i + 1
                tyre_age[d] += 1

                # DNF roll
                CD = COMPOUND_DEG
                shape = e.get("dnf_shape", 0.8)
                scale = e.get("dnf_scale", 60.0)
                s_prev = np.exp(-((max(abs_lap - 1, 0) / scale) ** shape))
                s_now  = np.exp(-((abs_lap / scale) ** shape))
                if np.random.random() < max(0.0, s_prev - s_now):
                    retired.add(d)
                    continue

                comp_data     = CD.get(tyre_type[d], CD["MEDIUM"])
                max_life      = comp_data["max_life"]
                traffic_f     = traffic_tyre_factor(current_pos)
                effective_age = tyre_age[d] * traffic_f
                avg_pits      = e.get("avg_pit_stops", 1.5)

                pit_threshold = max_life * (0.82 + np.random.normal(0, 0.08))
                pit_threshold *= 0.94 + strategy_entropy * 0.12
                laps_remaining = remaining_laps - lap

                should_pit = (
                    effective_age >= pit_threshold and
                    pit_count[d] < int(avg_pits + 1) and
                    laps_remaining > 8 and not sc_active
                ) or (effective_age > max_life * 1.15 and laps_remaining > 3)

                if should_pit:
                    pit_count[d] += 1
                    tyre_age[d]   = 0
                    tyre_type[d]  = ("HARD" if laps_remaining > 20 else
                                     "MEDIUM" if laps_remaining > 10 else "SOFT")
                    crew_speed    = PIT_CREW_SPEED.get(e["team"], PIT_CREW_SPEED["default"])
                    pit_variance  = np.random.normal(crew_speed, 0.3)
                    pos_loss      = int(round(pit_pos_loss * (pit_variance / 2.5)))
                    positions[d]  = min(positions[d] + max(1, pos_loss), n)

                deg_factor     = comp_data["deg_ms_per_lap"] * effective_age
                fuel_benefit   = laps_remaining * 28
                lap_noise      = np.random.normal(0, 60)
                effective_pace = pace_ms[d] + deg_factor - fuel_benefit + lap_noise
                if sc_active:
                    effective_pace = np.random.normal(0, 50)

                pos_overtake_factor = (
                    0.4 if current_pos <= 3 else
                    0.7 if current_pos <= 8 else
                    1.0 if current_pos <= 15 else 1.4
                )
                active_aero_factor = (0.88 + energy_demand * 0.45) * (1.0 + x_mode_drag * 0.15) * wet_factor if active_aero else 1.0
                base_overtake = e["arw_effectiveness"] * 0.15 * pos_overtake_factor * active_aero_factor

                for other in pos_sorted:
                    if other == d or other in retired:
                        continue
                    if positions[d] > positions[other]:
                        other_pace = (
                            pace_ms[other] +
                            CD.get(tyre_type[other], CD["MEDIUM"])["deg_ms_per_lap"] * tyre_age[other] +
                            np.random.normal(0, 60)
                        )
                        overtake_mult = (1.0 + overtake_bonus * 0.8) if abs(positions[d] - positions[other]) <= 1.5 else 1.0
                        if effective_pace - other_pace < -80 and np.random.random() < base_overtake * overtake_mult:
                            positions[d]     -= 1
                            positions[other] += 1

        active = [d for d in positions if d not in retired]
        active.sort(key=lambda d: positions[d])
        retired_list = list(retired)
        ordered = active + retired_list
        for pos, driver in enumerate(ordered, 1):
            results[driver].append(pos)

    return results


# ─────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--season",   type=int, default=2026)
    ap.add_argument("--round",    type=int, default=4)
    ap.add_argument("--snapshot", action="store_true", help="Use live_state.json instead of OpenF1")
    args = ap.parse_args()

    print("\n" + "=" * 55)
    print("  F1 LIVE RE-PREDICTION ENGINE")
    print("=" * 55)

    # Load race state
    if args.snapshot:
        step("Loading from live_state.json snapshot...")
        live = load_snapshot()
    else:
        live = fetch_live_state(args.season, args.round)
        if live is None:
            step("Falling back to live_state.json snapshot")
            live = load_snapshot()

    current_lap    = live["current_lap"]
    total_laps     = live["total_laps"]
    remaining_laps = total_laps - current_lap
    sc_status      = "YES (SC active)" if live.get("safety_car_active") else "No"
    active_drivers = [p for p in live["positions"] if not p["dnf"]]
    dnf_drivers    = [p for p in live["positions"] if p["dnf"]]

    step(f"Lap {current_lap}/{total_laps} — {remaining_laps} laps remaining")
    step(f"Safety car: {sc_status}")
    step(f"Active: {len(active_drivers)} drivers  |  DNF: {len(dnf_drivers)}")
    if dnf_drivers:
        step(f"DNFs: {', '.join(p['driver_code'] for p in dnf_drivers)}")

    # Load artifacts and build entries (same as predict.py)
    step("Loading artifacts...")
    artifacts = load_artifacts()

    season, round_, gp_name, circuit = (
        args.season, args.round,
        "Miami Grand Prix", "Miami Gardens"
    )

    step("Building entry list from qualifying data...")
    entries = get_entry_list(season, round_, artifacts)
    if not entries:
        print("No entries found — aborting")
        return

    step(f"Running {MC_RUNS} MC simulations from lap {current_lap} ({remaining_laps} laps)...")
    sim_results = simulate_from_live(entries, live, artifacts)

    # Compute final probabilities
    n           = len([p for p in live["positions"] if not p["dnf"]])
    predictions = []
    live_by_code = {p["driver_code"]: p for p in live["positions"]}

    for e in entries:
        d    = e["driver_code"]
        sims = sim_results.get(d, [])
        if not sims:
            continue
        arr         = np.array(sims)
        win_prob    = float((arr == 1).mean())
        podium_prob = float((arr <= 3).mean())
        median_pos  = float(np.mean(arr))
        points_exp  = float(np.mean([POINTS_MAP.get(p, 0) for p in sims]))
        live_pos    = live_by_code.get(d, {}).get("position", 99)
        is_dnf      = live_by_code.get(d, {}).get("dnf", False)

        predictions.append({
            "driver_code":  d,
            "team":         e["team"],
            "win_prob":     round(win_prob, 4),
            "podium_prob":  round(podium_prob, 4),
            "exp_pts":      round(points_exp, 2),
            "mean_pos":     round(median_pos, 1),
            "live_pos":     live_pos,
            "grid_pos":     e["grid_position"],
            "dnf":          is_dnf,
        })

    predictions.sort(key=lambda x: (x["exp_pts"], x["podium_prob"]), reverse=True)

    # Normalise win probs
    total = sum(p["win_prob"] for p in predictions)
    if total > 0:
        for p in predictions:
            p["win_prob"] = round(p["win_prob"] / total, 4)

    print(f"\n  {'─'*64}")
    print(f"  LIVE RE-PREDICTION: {gp_name}  |  Lap {current_lap}/{total_laps}")
    print(f"  {MC_RUNS} MC sims from current race state")
    print(f"  {'─'*64}")
    print(f"  {'POS':<4} {'DRV':<6} {'TEAM':<22} {'WIN%':>6} {'POD%':>6} {'EXP PTS':>8}  {'LIVE':>5}  {'GRID':>5}")
    print(f"  {'─'*64}")

    rank = 1
    for p in predictions:
        if p["dnf"]:
            continue
        flag = "⬆" if p["live_pos"] > p["grid_pos"] else ("⬇" if p["live_pos"] < p["grid_pos"] else " ")
        print(
            f"  {rank:<4} {p['driver_code']:<6} {p['team']:<22} "
            f"{p['win_prob']*100:>5.1f}%  {p['podium_prob']*100:>5.1f}%  "
            f"{p['exp_pts']:>7.1f}   P{p['live_pos']:<3}  P{p['grid_pos']:<3} {flag}"
        )
        rank += 1

    if dnf_drivers:
        print(f"\n  DNF: {', '.join(p['driver_code'] for p in dnf_drivers)}")
    print(f"  {'─'*64}\n")


if __name__ == "__main__":
    main()
