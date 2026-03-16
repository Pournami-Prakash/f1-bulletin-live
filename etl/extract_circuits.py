"""
extract_circuits.py — Pull accurate circuit outlines from FastF1 pos_data
Run from etl/ directory: python extract_circuits.py

Outputs:
    circuit_paths.ts   — paste CIRCUITS array into BootScreen.tsx
    circuit_paths.json — raw data for inspection
"""
from __future__ import annotations
import json
from pathlib import Path

import fastf1 as f1
import numpy as np

CACHE_DIR = Path("cache")
CACHE_DIR.mkdir(parents=True, exist_ok=True)
f1.Cache.enable_cache(str(CACHE_DIR))

CANVAS_W         = 100
CANVAS_H         = 80
PAD              = 5
RESAMPLE_PTS     = 300
SIMPLIFY_EPSILON = 1.5

# ── Calendar ──────────────────────────────────────────────────────────────────
# Each entry uses the most recent season/round where that circuit ran
# and you're likely to have cached data.
# Already-extracted circuits (from previous run) are marked SKIP — they will
# be loaded from circuit_paths.json instead of re-fetched.
CALENDAR: list[dict] = [
    # ── Already extracted successfully in previous run ──
    {"rd":"01","name":"ALBERT PARK", "country":"Australia",    "dates":"6–8 MAR",     "et":"12:00 AM ET","color":"#E8002D","season":2025,"round":3,  "skip":True},
    {"rd":"02","name":"SHANGHAI",    "country":"China",        "dates":"13–15 MAR",   "et":"3:00 AM ET", "color":"#27F4D2","season":2024,"round":5,  "skip":True},
    {"rd":"04","name":"SAKHIR",      "country":"Bahrain",      "dates":"10–12 APR",   "et":"11:00 AM ET","color":"#FF8000","season":2024,"round":1,  "skip":True},
    {"rd":"05","name":"JEDDAH",      "country":"Saudi Arabia", "dates":"17–19 APR",   "et":"1:00 PM ET", "color":"#229971","season":2024,"round":2,  "skip":True},
    {"rd":"06","name":"MIAMI",       "country":"USA",          "dates":"1–3 MAY",     "et":"4:00 PM ET", "color":"#3671C6","season":2024,"round":6,  "skip":True},
    {"rd":"07","name":"MONTREAL",    "country":"Canada",       "dates":"22–24 MAY",   "et":"2:00 PM ET", "color":"#27F4D2","season":2024,"round":9,  "skip":True},
    {"rd":"08","name":"MONACO",      "country":"Monaco",       "dates":"5–7 JUN",     "et":"9:00 AM ET", "color":"#E8002D","season":2024,"round":8,  "skip":True},
    {"rd":"09","name":"BARCELONA",   "country":"Spain",        "dates":"12–14 JUN",   "et":"9:00 AM ET", "color":"#FF8000","season":2024,"round":10, "skip":True},
    {"rd":"10","name":"SPIELBERG",   "country":"Austria",      "dates":"26–28 JUN",   "et":"9:00 AM ET", "color":"#3671C6","season":2024,"round":11, "skip":True},
    {"rd":"11","name":"SILVERSTONE", "country":"Great Britain","dates":"3–5 JUL",     "et":"10:00 AM ET","color":"#27F4D2","season":2024,"round":12, "skip":True},
    {"rd":"12","name":"SPA",         "country":"Belgium",      "dates":"17–19 JUL",   "et":"9:00 AM ET", "color":"#FF87BC","season":2024,"round":14, "skip":True},
    {"rd":"13","name":"BUDAPEST",    "country":"Hungary",      "dates":"24–26 JUL",   "et":"9:00 AM ET", "color":"#E8002D","season":2024,"round":13, "skip":True},
    {"rd":"14","name":"ZANDVOORT",   "country":"Netherlands",  "dates":"21–23 AUG",   "et":"9:00 AM ET", "color":"#3671C6","season":2024,"round":15, "skip":True},
    {"rd":"15","name":"MONZA",       "country":"Italy",        "dates":"4–6 SEP",     "et":"9:00 AM ET", "color":"#E8002D","season":2024,"round":16, "skip":True},
    {"rd":"17","name":"BAKU",        "country":"Azerbaijan",   "dates":"24–26 SEP",   "et":"7:00 AM ET", "color":"#229971","season":2024,"round":17, "skip":True},
    {"rd":"18","name":"SINGAPORE",   "country":"Singapore",    "dates":"9–11 OCT",    "et":"8:00 AM ET", "color":"#3671C6","season":2024,"round":18, "skip":True},
    {"rd":"19","name":"AUSTIN",      "country":"USA",          "dates":"23–25 OCT",   "et":"2:00 PM ET", "color":"#FF8000","season":2024,"round":19, "skip":True},
    {"rd":"20","name":"MEXICO CITY", "country":"Mexico",       "dates":"30 OCT–1 NOV","et":"2:00 PM ET", "color":"#3671C6","season":2024,"round":20, "skip":True},
    {"rd":"21","name":"INTERLAGOS",  "country":"Brazil",       "dates":"6–8 NOV",     "et":"11:00 AM ET","color":"#27F4D2","season":2024,"round":21, "skip":True},
    {"rd":"22","name":"LAS VEGAS",   "country":"USA",          "dates":"19–21 NOV",   "et":"1:00 AM ET", "color":"#E8002D","season":2024,"round":22, "skip":True},
    {"rd":"24","name":"YAS MARINA",  "country":"Abu Dhabi",    "dates":"4–6 DEC",     "et":"12:00 PM ET","color":"#3671C6","season":2024,"round":24, "skip":True},

    # ── Need to fetch ──
    {"rd":"03","name":"SUZUKA",      "country":"Japan",        "dates":"27–29 MAR",   "et":"1:00 AM ET", "color":"#FF8000","season":2023,"round":3,  "skip":False},
    {"rd":"23","name":"LUSAIL",      "country":"Qatar",        "dates":"27–29 NOV",   "et":"11:00 AM ET","color":"#FF8000","season":2023,"round":19, "skip":False},
    # Madrid — new 2026 circuit, no data until after Sep 2026 race weekend
    # {"rd":"16","name":"MADRID",    "country":"Spain",        "dates":"11–13 SEP",   "et":"9:00 AM ET", "color":"#FF8000","season":2026,"round":16, "skip":False},
]


# ── Douglas-Peucker ───────────────────────────────────────────────────────────
def _perp(pt: np.ndarray, a: np.ndarray, b: np.ndarray) -> float:
    if np.allclose(a, b):
        return float(np.linalg.norm(pt - a))
    d = b - a
    t = np.clip(np.dot(pt - a, d) / np.dot(d, d), 0, 1)
    return float(np.linalg.norm(pt - (a + t * d)))

def dp(pts: np.ndarray, tol: float) -> np.ndarray:
    if len(pts) <= 2:
        return pts
    dists = np.array([_perp(pts[i], pts[0], pts[-1]) for i in range(len(pts))])
    idx   = int(np.argmax(dists))
    if dists[idx] > tol:
        return np.vstack([dp(pts[:idx+1], tol)[:-1], dp(pts[idx:], tol)])
    return np.array([pts[0], pts[-1]])


# ── Resample to equal-distance points ────────────────────────────────────────
def resample(pts: np.ndarray, n: int) -> np.ndarray:
    diffs  = np.diff(pts, axis=0)
    dists  = np.sqrt((diffs**2).sum(axis=1))
    cumlen = np.concatenate([[0], np.cumsum(dists)])
    total  = cumlen[-1]
    out    = np.zeros((n, 2))
    for i, t in enumerate(np.linspace(0, total, n)):
        idx  = min(int(np.searchsorted(cumlen, t, side='right') - 1), len(pts) - 2)
        seg  = cumlen[idx+1] - cumlen[idx]
        frac = (t - cumlen[idx]) / seg if seg > 0 else 0
        out[i] = pts[idx] + frac * (pts[idx+1] - pts[idx])
    return out


# ── Normalise to SVG canvas ───────────────────────────────────────────────────
def normalise(pts: np.ndarray) -> tuple[np.ndarray, float, float]:
    mn, mx  = pts.min(axis=0), pts.max(axis=0)
    span    = mx - mn
    if span[0] == 0 or span[1] == 0:
        return pts, float(CANVAS_W), float(CANVAS_H)
    avail_w = CANVAS_W - 2 * PAD
    avail_h = CANVAS_H - 2 * PAD
    scale   = min(avail_w / span[0], avail_h / span[1])
    offset  = np.array([
        PAD + (avail_w - span[0] * scale) / 2,
        PAD + (avail_h - span[1] * scale) / 2,
    ])
    out = (pts - mn) * scale + offset
    vw  = round(float(span[0] * scale + 2 * PAD), 1)
    vh  = round(float(span[1] * scale + 2 * PAD), 1)
    return out, vw, vh


def to_svg(pts: np.ndarray) -> str:
    parts = [f"M {pts[0,0]:.1f} {pts[0,1]:.1f}"]
    for p in pts[1:]:
        parts.append(f"L {p[0]:.1f} {p[1]:.1f}")
    parts.append("Z")
    return " ".join(parts)


# ── Extract one circuit ───────────────────────────────────────────────────────
def extract(entry: dict) -> dict | None:
    season, round_, name = entry["season"], entry["round"], entry["name"]
    print(f"\n→ {name} ({season} R{round_})")

    try:
        session = f1.get_session(season, round_, "R")
        session.load(laps=True, telemetry=True, weather=False, messages=False)
    except Exception as e:
        print(f"  ✗ Load failed: {e}")
        return None

    try:
        results = session.results
        if results.empty:
            print("  ✗ No results")
            return None
        winner_num = str(results.iloc[0]["DriverNumber"])
    except Exception as e:
        print(f"  ✗ Results error: {e}")
        return None

    pos_data = getattr(session, "pos_data", {})
    if not pos_data:
        print("  ✗ No pos_data")
        return None

    winner_pos = pos_data.get(winner_num)
    if winner_pos is None or winner_pos.empty:
        for num, pd_df in pos_data.items():
            if pd_df is not None and not pd_df.empty:
                winner_pos, winner_num = pd_df, num
                break
    if winner_pos is None or winner_pos.empty:
        print("  ✗ No position data")
        return None

    if not {"X", "Y", "Time"}.issubset(winner_pos.columns):
        print(f"  ✗ Missing X/Y/Time in pos_data")
        return None

    # Find a clean lap (3, 5, or middle)
    laps = session.laps
    try:
        abbr = session.get_driver(winner_num)["Abbreviation"]
    except Exception:
        abbr = None
    driver_laps = laps[laps["Driver"] == abbr] if abbr else laps
    for lap_num in [3, 5, 4, 6, 10]:
        target = driver_laps[driver_laps["LapNumber"] == lap_num]
        if not target.empty:
            break
    else:
        mid    = driver_laps["LapNumber"].median()
        target = driver_laps.iloc[(driver_laps["LapNumber"] - mid).abs().argsort()[:1]]

    if target.empty:
        print("  ✗ No usable lap")
        return None

    lap_row   = target.iloc[0]
    lap_start = lap_row.get("LapStartTime")
    lap_time  = lap_row.get("LapTime")
    if not lap_time or not lap_start or str(lap_start) == 'NaT':
        print("  ✗ No lap timing")
        return None

    lap_end    = lap_start + lap_time
    pos_sorted = winner_pos.sort_values("Time")
    lap_pos    = pos_sorted[
        (pos_sorted["Time"] >= lap_start) &
        (pos_sorted["Time"] <  lap_end)
    ]

    if len(lap_pos) < 20:
        print(f"  ✗ Only {len(lap_pos)} position points")
        return None

    xs = lap_pos["X"].values.astype(float)
    ys = -lap_pos["Y"].values.astype(float)
    valid = (xs != 0) | (ys != 0)
    xs, ys = xs[valid], ys[valid]

    if len(xs) < 20:
        print("  ✗ Too many zero points")
        return None

    pts_raw = np.stack([xs, ys], axis=1)
    print(f"  Raw: {len(pts_raw)} pts", end="")

    pts_r = resample(pts_raw, RESAMPLE_PTS)
    scale = max(pts_r.max(axis=0) - pts_r.min(axis=0))
    tol   = SIMPLIFY_EPSILON * scale / CANVAS_W
    pts_s = dp(pts_r, tol)
    print(f"  → {len(pts_s)} simplified", end="")

    pts_n, vw, vh = normalise(pts_s)
    sf = [round(float(pts_n[0, 0]), 1), round(float(pts_n[0, 1]), 1)]
    print(f"  → vw={vw} vh={vh}  ✓")

    return {
        "rd":      entry["rd"],
        "name":    name,
        "country": entry["country"],
        "dates":   entry["dates"],
        "et":      entry["et"],
        "color":   entry["color"],
        "vw":      vw,
        "vh":      vh,
        "sf":      sf,
        "d":       to_svg(pts_n),
    }


# ── TypeScript writer ─────────────────────────────────────────────────────────
def to_ts(circuits: list[dict]) -> str:
    # Sort by rd
    circuits = sorted(circuits, key=lambda c: c["rd"])
    lines = [
        "// AUTO-GENERATED by extract_circuits.py — do not edit manually",
        "// Replace the CIRCUITS constant in BootScreen.tsx with this\n",
        "export const CIRCUITS = [",
    ]
    for c in circuits:
        sf = f"[{c['sf'][0]}, {c['sf'][1]}] as [number, number]"
        d  = c["d"].replace("`", "\\`")
        lines.append(f"""  {{
    rd:'{c["rd"]}', name:'{c["name"]}', country:'{c["country"]}',
    dates:'{c["dates"]}', et:'{c["et"]}', color:'{c["color"]}',
    vw:{c["vw"]}, vh:{c["vh"]}, sf:{sf},
    d:`{d}`,
  }},""")
    lines.append("] as const\n")
    return "\n".join(lines)


# ── Main ──────────────────────────────────────────────────────────────────────
def main() -> None:
    json_path = Path("circuit_paths.json")

    # Load previously extracted circuits
    existing: dict[str, dict] = {}
    if json_path.exists():
        for c in json.loads(json_path.read_text()):
            existing[c["rd"]] = c
        print(f"Loaded {len(existing)} existing circuits from {json_path}")

    results: list[dict] = []
    failed:  list[str]  = []

    print("\n=== Extracting missing circuits ===\n")

    for entry in CALENDAR:
        rd = entry["rd"]

        if entry.get("skip") and rd in existing:
            # Reuse previously extracted data, but update metadata in case dates/et changed
            c = dict(existing[rd])
            c.update({
                "name":    entry["name"],
                "country": entry["country"],
                "dates":   entry["dates"],
                "et":      entry["et"],
                "color":   entry["color"],
            })
            results.append(c)
            print(f"  ↷ {entry['name']} (rd {rd}) — reusing cached extract")
            continue

        result = extract(entry)
        if result:
            results.append(result)
        else:
            # Fall back to existing if available
            if rd in existing:
                print(f"  ⚠  Using stale cached data for {entry['name']}")
                results.append(existing[rd])
            else:
                failed.append(entry["name"])

    # Save updated JSON
    json_path.write_text(json.dumps(results, indent=2))

    # Write TS
    ts_path = Path("circuit_paths.ts")
    ts_path.write_text(to_ts(results))

    print(f"\n✓  {len(results)} circuits written")
    print(f"→  {ts_path}   — paste into BootScreen.tsx")
    print(f"→  {json_path} — cache for next run\n")

    if failed:
        print(f"⚠  Still missing ({len(failed)}):")
        for n in failed:
            print(f"   - {n}")
        print()
        print("  MADRID  — available after 2026 Spanish GP (Sep 13)")
        print("  SUZUKA  — try season:2022, round:3")
        print("  LUSAIL  — try season:2024, round:20")


if __name__ == "__main__":
    main()