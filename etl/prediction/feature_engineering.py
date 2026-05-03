"""
F1 Bulletin — Feature Engineering Pipeline
Run AFTER eda.py passes all checks.

Usage:
    python feature_engineering.py

Outputs:
    features_output/features.parquet  — model-ready feature matrix
    features_output/features.csv      — human-readable version
    features_output/elo_ratings.json  — driver Elo ratings after all races
    features_output/constructor_strength.json
    features_output/circuit_profiles.json
"""

from __future__ import annotations
import os, json, warnings
warnings.filterwarnings('ignore')

import numpy as np
import pandas as pd
from pathlib import Path
from dotenv import load_dotenv
import psycopg2

load_dotenv("../../web/.env.local")
DATABASE_URL = os.environ.get("NEON_DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("NEON_DATABASE_URL not found in web/.env.local")

OUT = Path("features_output")
OUT.mkdir(exist_ok=True)

# ── Config ────────────────────────────────────────────────────
REG_BREAK_DISCOUNT  = 0.4
ELO_K_FACTOR        = 40
ELO_BASE            = 1500
ELO_NEW_DRIVER      = 1400
SPRINT_ELO_K_SCALE  = 0.17   # sprint = ~17% of race distance → lower Elo signal

SEASON_WEIGHTS = {
    2021: 0.20,
    2022: 0.50,
    2023: 0.75,
    2024: 0.85,
    2025: 0.90,
    2026: 1.00,
}

def season_weight(season: int) -> float:
    return SEASON_WEIGHTS.get(season, 0.50)

PU_MANUFACTURERS = {
    'Red Bull Racing': 'Ford',
    'Racing Bulls':    'Ford',
    'Ferrari':         'Ferrari',
    'Haas F1 Team':    'Ferrari',
    'Mercedes':        'Mercedes',
    'Williams':        'Mercedes',
    'McLaren':         'Mercedes',
    'Aston Martin':    'Honda',
    'Alpine':          'Renault',
    'Kick Sauber':     'Audi',
    'Cadillac':        'General Motors',
}

PU_PRIOR = {
    'Ferrari':        0.65,
    'Mercedes':       0.70,
    'Honda':          0.60,
    'Ford':           0.50,
    'Renault':        0.45,
    'Audi':           0.40,
    'General Motors': 0.35,
}

CIRCUIT_TYPES = {
    'Melbourne':   'street_hybrid',
    'Shanghai':    'permanent',
    'Suzuka':      'permanent',
    'Sakhir':      'permanent',
    'Jeddah':      'street',
    'Miami':       'street_hybrid',
    'Imola':       'permanent',
    'Monaco':      'street',
    'Barcelona':   'permanent',
    'Montreal':    'street_hybrid',
    'Spielberg':   'permanent',
    'Silverstone': 'permanent',
    'Spa':         'permanent',
    'Budapest':    'permanent',
    'Zandvoort':   'permanent',
    'Monza':       'permanent',
    'Baku':        'street',
    'Singapore':   'street',
    'Austin':      'permanent',
    'Mexico City': 'permanent',
    'São Paulo':   'permanent',
    'Las Vegas':   'street',
    'Lusail':      'permanent',
    'Yas Island':  'permanent',
}

PIT_LANE_DELTA = {
    'Monaco': 19.0, 'Singapore': 24.0, 'Marina Bay': 24.0,
    'Baku': 18.0,   'Jeddah': 22.0,    'Las Vegas': 17.0,
    'Melbourne': 23.0, 'Shanghai': 23.5, 'Zandvoort': 19.0,
    'Budapest': 20.0,  'default': 21.0,
}

PIT_CREW_SPEED = {
    'Red Bull Racing': 2.0, 'Mercedes': 2.2, 'Ferrari': 2.3,
    'McLaren': 2.2, 'Aston Martin': 2.6, 'Alpine': 2.8,
    'Williams': 3.0, 'Racing Bulls': 2.7, 'Kick Sauber': 2.9,
    'Haas F1 Team': 2.8, 'Cadillac': 3.2, 'default': 2.7,
}

SC_PROB_DEFAULTS = {
    'street':        0.72,
    'street_hybrid': 0.55,
    'permanent':     0.38,
}

REGULATION_CONFIG_PATH = Path(__file__).with_name("regulation_eras.json")
with open(REGULATION_CONFIG_PATH) as f:
    REGULATION_CONFIG = json.load(f)

def regulation_profile(season: int) -> dict:
    profile = dict(REGULATION_CONFIG.get("default", {}))
    profile.update(REGULATION_CONFIG.get(str(season), {}))
    return profile

def circuit_energy_demand(circuit: str, circuit_type: str) -> float:
    overrides = REGULATION_CONFIG.get("circuit_energy_overrides", {})
    if circuit in overrides:
        return float(overrides[circuit])
    return {
        'street':        0.72,
        'street_hybrid': 0.66,
        'permanent':     0.58,
    }.get(circuit_type, 0.60)

def pu_uncertainty(team: str, season: int) -> float:
    if season < 2026:
        return 0.0
    return {
        'Red Bull Racing': 0.32,
        'Racing Bulls':    0.32,
        'Aston Martin':    0.28,
        'Kick Sauber':     0.34,
        'Audi':            0.34,
        'Cadillac':        0.45,
        'Alpine':          0.20,
        'Williams':        0.14,
    }.get(team, 0.10)

# ── DB helpers ────────────────────────────────────────────────
def get_conn():
    return psycopg2.connect(DATABASE_URL, connect_timeout=30)

def query(sql: str, params=None) -> pd.DataFrame:
    conn = get_conn()
    df = pd.read_sql(sql, conn, params=params)
    conn.close()
    return df

def section(t): print(f"\n{'='*55}\n  {t}\n{'='*55}")
def step(t):    print(f"  → {t}")

# ─────────────────────────────────────────────────────────────
# STEP 1: Load raw data
# ─────────────────────────────────────────────────────────────
section("STEP 1: Loading raw data")

results = query("""
    SELECT r.driver_code, r.team, r.grid_position, r.finish_position,
           r.points, r.status, r.fastest_lap_ms,
           s.season, s.round, s.gp_name, s.circuit, s.date
    FROM results r
    JOIN sessions s ON s.id = r.session_id
    WHERE s.session_type = 'R'
      AND r.finish_position IS NOT NULL
    ORDER BY s.season, s.round, r.finish_position
""")
step(f"Race results: {len(results)} rows")

# Sprint results — loaded separately, used for:
#   - rolling_points (driver form includes sprint points)
#   - sprint Elo updates (lower K factor)
#   - sprint_points_last3 feature
# Gracefully empty if sprint data not yet ingested.
sprint_results = query("""
    SELECT r.driver_code, r.team, r.grid_position, r.finish_position,
           r.points, r.status,
           s.season, s.round, s.gp_name, s.circuit, s.date
    FROM results r
    JOIN sessions s ON s.id = r.session_id
    WHERE s.session_type = 'S'
      AND r.finish_position IS NOT NULL
    ORDER BY s.season, s.round, r.finish_position
""")
step(f"Sprint results: {len(sprint_results)} rows{' (none ingested yet — will degrade gracefully)' if len(sprint_results) == 0 else ''}")

laps = query("""
    SELECT l.driver_code, l.lap_number, l.lap_time_ms,
           l.compound, l.tyre_life, l.position,
           l.s1_ms, l.s2_ms, l.s3_ms,
           s.season, s.round
    FROM laps l
    JOIN sessions s ON s.id = l.session_id
    WHERE s.session_type = 'R'
      AND l.lap_time_ms IS NOT NULL
    ORDER BY s.season, s.round, l.driver_code, l.lap_number
""")
step(f"Laps: {len(laps)} rows")

stints = query("""
    SELECT st.driver_code, st.compound, st.start_lap, st.end_lap, st.lap_count,
           s.season, s.round
    FROM stints st
    JOIN sessions s ON s.id = st.session_id
    WHERE s.session_type = 'R'
    ORDER BY s.season, s.round, st.driver_code, st.stint_number
""")
step(f"Stints: {len(stints)} rows")

quali = query("""
    SELECT q.driver_code, q.q1_ms, q.q2_ms, q.q3_ms, q.best_ms,
           q.gap_to_pole_ms, q.grid_position, q.tyre_compound,
           s.season, s.round
    FROM qualifying_laps q
    JOIN sessions s ON s.id = q.session_id
    ORDER BY s.season, s.round, q.grid_position
""")
step(f"Qualifying: {len(quali)} rows")

weather = query("""
    SELECT w.lap_number, w.air_temp, w.track_temp, w.humidity,
           w.wind_speed, w.rainfall,
           s.season, s.round
    FROM weather w
    JOIN sessions s ON s.id = w.session_id
    WHERE s.session_type = 'R'
    ORDER BY s.season, s.round, w.lap_number
""")
step(f"Weather: {len(weather)} rows")

track_status = query("""
    SELECT ts.lap_start, ts.lap_end, ts.status_type,
           s.season, s.round, s.circuit
    FROM track_status ts
    JOIN sessions s ON s.id = ts.session_id
    ORDER BY s.season, s.round, ts.lap_start
""")
step(f"Track status: {len(track_status)} rows")

# ─────────────────────────────────────────────────────────────
# STEP 2: Clean data
# ─────────────────────────────────────────────────────────────
section("STEP 2: Cleaning data")

lap_medians = laps.groupby(['season','round'])['lap_time_ms'].transform('median')
laps_clean  = laps[laps['lap_time_ms'] <= lap_medians * 1.2].copy()
removed     = len(laps) - len(laps_clean)
step(f"Removed {removed} outlier laps ({removed/len(laps)*100:.1f}%)")

results['is_dnf']    = results['status'].isin(['Retired', 'Disqualified', 'Did not start'])
results['is_lapped'] = results['status'] == 'Lapped'
step(f"DNF rate: {results['is_dnf'].mean()*100:.1f}%")

results['grid_position'] = results['grid_position'].fillna(results['finish_position'])

team_map = {
    'Red Bull Racing': 'Red Bull Racing',
    'Kick Sauber':     'Kick Sauber',
    'Haas F1 Team':    'Haas F1 Team',
    'Racing Bulls':    'Racing Bulls',
}
results['team_clean'] = results['team'].map(team_map).fillna(results['team'])

if not sprint_results.empty:
    sprint_results['is_dnf'] = sprint_results['status'].isin(['Retired', 'Disqualified', 'Did not start'])
    step(f"Sprint DNF rate: {sprint_results['is_dnf'].mean()*100:.1f}%")

# ─────────────────────────────────────────────────────────────
# STEP 3: Driver Elo ratings
# ─────────────────────────────────────────────────────────────
section("STEP 3: Computing Driver Elo ratings")

elo         = {}
elo_history = []
circuit_elo = {}

def expected_score(ra: float, rb: float) -> float:
    return 1 / (1 + 10 ** ((rb - ra) / 400))

def update_elo(driver: str, finish_pos: int, n_drivers: int) -> float:
    return 1 - (finish_pos - 1) / (n_drivers - 1)

# ── Race Elo ──────────────────────────────────────────────────
race_results = results.sort_values(['season','round','finish_position'])

for (season, round_), race in race_results.groupby(['season','round']):
    valid = race.dropna(subset=['finish_position'])
    if valid.empty:
        continue

    circuit = race['circuit'].iloc[0] if 'circuit' in race.columns else 'Unknown'
    n       = len(valid)
    drivers_in_race = valid['driver_code'].tolist()

    for d in drivers_in_race:
        if d not in elo:
            elo[d] = ELO_NEW_DRIVER
        if (d, circuit) not in circuit_elo:
            circuit_elo[(d, circuit)] = ELO_NEW_DRIVER

    field_avg_elo   = np.mean([elo[d] for d in drivers_in_race])
    circuit_avg_elo = np.mean([circuit_elo[(d, circuit)] for d in drivers_in_race])
    k               = ELO_K_FACTOR * season_weight(season)
    k_circuit       = k * 0.5

    new_elos         = {}
    new_circuit_elos = {}

    for _, row in valid.iterrows():
        driver       = row['driver_code']
        actual_score = update_elo(driver, int(row['finish_position']), n)
        exp_global   = expected_score(elo[driver], field_avg_elo)
        exp_circuit  = expected_score(circuit_elo[(driver, circuit)], circuit_avg_elo)

        new_elos[driver] = elo[driver] + k * (actual_score - exp_global)
        new_circuit_elos[(driver, circuit)] = (
            circuit_elo[(driver, circuit)] + k_circuit * (actual_score - exp_circuit)
        )
        elo_history.append({
            'season': season, 'round': round_,
            'driver_code': driver, 'circuit': circuit,
            'elo_before':         elo[driver],
            'elo_after':          new_elos[driver],
            'circuit_elo_before': circuit_elo[(driver, circuit)],
            'circuit_elo_after':  new_circuit_elos[(driver, circuit)],
            'finish_position':    row['finish_position'],
            'session_type':       'R',
        })

    elo.update(new_elos)
    circuit_elo.update(new_circuit_elos)

# ── Sprint Elo update (lower K — sprint = ~17% of race distance) ──────────
if not sprint_results.empty:
    sprint_sorted = sprint_results.sort_values(['season', 'round', 'finish_position'])
    n_sprint_races = 0

    for (season, round_), race in sprint_sorted.groupby(['season', 'round']):
        valid = race.dropna(subset=['finish_position'])
        if valid.empty:
            continue

        n               = len(valid)
        drivers_in_race = valid['driver_code'].tolist()

        for d in drivers_in_race:
            if d not in elo:
                elo[d] = ELO_NEW_DRIVER

        field_avg_elo = np.mean([elo[d] for d in drivers_in_race])
        k_sprint      = ELO_K_FACTOR * season_weight(season) * SPRINT_ELO_K_SCALE

        new_elos = {}
        for _, row in valid.iterrows():
            driver       = row['driver_code']
            actual_score = update_elo(driver, int(row['finish_position']), n)
            exp_global   = expected_score(elo[driver], field_avg_elo)
            new_elos[driver] = elo[driver] + k_sprint * (actual_score - exp_global)
            elo_history.append({
                'season': season, 'round': round_,
                'driver_code': driver, 'circuit': race['circuit'].iloc[0] if 'circuit' in race.columns else 'Unknown',
                'elo_before':         elo[driver],
                'elo_after':          new_elos[driver],
                'circuit_elo_before': np.nan,
                'circuit_elo_after':  np.nan,
                'finish_position':    row['finish_position'],
                'session_type':       'S',
            })

        elo.update(new_elos)
        n_sprint_races += 1

    step(f"Sprint Elo updated for {n_sprint_races} sprint races (K scale={SPRINT_ELO_K_SCALE})")
else:
    step("Sprint Elo skipped — no sprint data yet")

circuit_elo_export = {f"{d}|{c}": round(v, 1) for (d,c), v in circuit_elo.items()}
step(f"Elo computed for {len(elo)} drivers")

print("\n  Top 10 drivers by Elo:")
for i, (driver, rating) in enumerate(sorted(elo.items(), key=lambda x: x[1], reverse=True)[:10]):
    print(f"    {i+1:2d}. {driver:6s}  {rating:.0f}")

elo_df = pd.DataFrame(elo_history)
elo_df.to_csv(OUT / 'elo_history.csv', index=False)
with open(OUT / 'elo_ratings.json', 'w') as f:
    json.dump({k: round(v, 1) for k, v in elo.items()}, f, indent=2)
with open(OUT / 'circuit_elo.json', 'w') as f:
    json.dump(circuit_elo_export, f, indent=2)
step(f"Saved elo_ratings.json + circuit_elo.json ({len(circuit_elo_export)} entries)")

# ─────────────────────────────────────────────────────────────
# STEP 4: Constructor strength
# ─────────────────────────────────────────────────────────────
section("STEP 4: Constructor strength (blended 2025/2026)")

def compute_constructor_strength(results_df: pd.DataFrame, season_2026: int) -> dict:
    strength = {}
    available_seasons = sorted(results_df['season'].unique())

    for team in results_df['team'].unique():
        weighted_sum = 0.0
        total_weight = 0.0

        for s in available_seasons:
            d = results_df[(results_df['team']==team) & (results_df['season']==s)]
            if d.empty:
                continue

            avg_finish = d['finish_position'].mean()
            n          = len(d)
            base_w     = season_weight(s)

            if s == 2026:
                n_2026_races = results_df[results_df['season']==2026]['round'].nunique()
                base_w = min(n_2026_races / 10.0, 0.9)

            if s < 2022:
                base_w *= (1 - REG_BREAK_DISCOUNT)

            race_scale    = min(n / 20.0, 1.0)
            w             = base_w * race_scale
            weighted_sum += avg_finish * w
            total_weight += w

        strength[team] = round(weighted_sum / total_weight, 3) if total_weight > 0 else 10.5

    return strength

constructor_strength = compute_constructor_strength(results, 2026)

print("\n  Constructor strength (lower = better):")
for team, strength in sorted(constructor_strength.items(), key=lambda x: x[1]):
    pu = PU_MANUFACTURERS.get(team, 'Unknown')
    print(f"    {team:25s}  {strength:.2f}  [{pu}]")

with open(OUT / 'constructor_strength.json', 'w') as f:
    json.dump(constructor_strength, f, indent=2)
step(f"Saved constructor_strength.json")

# ─────────────────────────────────────────────────────────────
# STEP 5: Circuit profiles
# ─────────────────────────────────────────────────────────────
section("STEP 5: Circuit profiles")

sc_events = track_status[track_status['status_type'].isin(['SC','VSC'])]
races_per_circuit = results.groupby(['season','round','circuit']).size().reset_index(name='n')
sc_count          = sc_events.groupby(['season','round','circuit']).size().reset_index(name='sc_count')
sc_by_circuit     = races_per_circuit.merge(sc_count, on=['season','round','circuit'], how='left')
sc_by_circuit['had_sc'] = sc_by_circuit['sc_count'].notna()

sc_prob_by_circuit_raw = sc_by_circuit.groupby('circuit')['had_sc'].mean().to_dict()

total_sc_events = len(track_status)
if total_sc_events < 10:
    step(f"⚠ Only {total_sc_events} track status rows — using circuit-type SC defaults")
    sc_prob_by_circuit = {}
else:
    sc_prob_by_circuit = sc_prob_by_circuit_raw

avg_pits = stints.groupby(['season','round']).apply(
    lambda x: x.groupby('driver_code')['compound'].count().mean() - 1
).reset_index(name='avg_pits')
avg_pits_circuit = avg_pits.merge(
    results[['season','round','circuit']].drop_duplicates(), on=['season','round']
)
avg_pits_by_circuit = avg_pits_circuit.groupby('circuit')['avg_pits'].mean().to_dict()

tyre_deg    = {}
tyre_deg_gp = {}

for circuit in results['circuit'].unique():
    rounds       = results[results['circuit']==circuit][['season','round']].drop_duplicates()
    circuit_laps = laps_clean.merge(rounds, on=['season','round'])
    tyre_deg_gp[circuit] = {}

    for compound in ['SOFT', 'MEDIUM', 'HARD']:
        comp_laps = circuit_laps[circuit_laps['compound']==compound]
        if len(comp_laps) < 15:
            continue
        x = comp_laps['tyre_life'].values
        y = comp_laps['lap_time_ms'].values
        if len(x) > 3:
            try:
                coeffs = np.polyfit(x, y, 2)
                tyre_deg_gp[circuit][compound] = {
                    'quad':   round(float(coeffs[0]), 5),
                    'linear': round(float(coeffs[1]), 3),
                    'n_laps': len(comp_laps),
                }
                if compound == 'SOFT':
                    tyre_deg[circuit] = round(float(coeffs[1]), 2)
            except Exception:
                if compound == 'SOFT':
                    tyre_deg[circuit] = 80.0

overtaking = results.copy()
overtaking['positions_changed'] = abs(overtaking['grid_position'] - overtaking['finish_position'])
overtaking_by_circuit = overtaking.groupby('circuit').apply(
    lambda x: x['positions_changed'].sum() / (len(x) * 10)
).to_dict()

circuit_profiles = {}
all_circuits = set(
    list(sc_prob_by_circuit.keys()) +
    list(avg_pits_by_circuit.keys()) +
    list(overtaking_by_circuit.keys())
)

with open(OUT / 'tyre_deg_gp.json', 'w') as f:
    json.dump(tyre_deg_gp, f, indent=2)
step(f"Saved tyre_deg_gp.json for {len(tyre_deg_gp)} circuits")

for circuit in all_circuits:
    ctype   = CIRCUIT_TYPES.get(circuit, 'permanent')
    sc_prob = (
        round(sc_prob_by_circuit[circuit], 3)
        if circuit in sc_prob_by_circuit
        else SC_PROB_DEFAULTS.get(ctype, 0.40)
    )
    circuit_profiles[circuit] = {
        'sc_probability':           sc_prob,
        'avg_pit_stops':            round(avg_pits_by_circuit.get(circuit, 2.0), 2),
        'tyre_deg_soft_ms_per_lap': round(tyre_deg.get(circuit, 80.0), 1),
        'overtaking_index':         round(overtaking_by_circuit.get(circuit, 0.3), 3),
        'circuit_type':             ctype,
        'energy_demand_index':      round(circuit_energy_demand(circuit, ctype), 3),
        'arw_effectiveness':        round(overtaking_by_circuit.get(circuit, 0.3) * 0.85, 3),
        'pit_lane_delta_sec':       PIT_LANE_DELTA.get(circuit, PIT_LANE_DELTA['default']),
    }

print(f"\n  Circuit profiles computed for {len(circuit_profiles)} circuits")
if circuit_profiles:
    top_sc = sorted(circuit_profiles.items(), key=lambda x: x[1]['sc_probability'], reverse=True)[:3]
    print("  Highest SC probability circuits:")
    for c, p in top_sc:
        print(f"    {c:20s}  SC prob={p['sc_probability']:.2f}  overtaking={p['overtaking_index']:.2f}")

with open(OUT / 'circuit_profiles.json', 'w') as f:
    json.dump(circuit_profiles, f, indent=2)
step(f"Saved circuit_profiles.json")

# ── DNF Survival Analysis ─────────────────────────────────────
dnf_survival = {}
for driver in results['driver_code'].unique():
    d_res    = results[results['driver_code'] == driver]
    n_races  = len(d_res)
    n_dnf    = int(d_res['is_dnf'].sum())
    dnf_rate = n_dnf / max(n_races, 1)
    shape    = 0.8
    scale    = 58 / ((-np.log(max(1 - dnf_rate, 0.01))) ** (1/shape))
    dnf_survival[driver] = {
        'dnf_rate': round(dnf_rate, 4),
        'shape':    round(shape, 3),
        'scale':    round(float(scale), 2),
        'n_races':  n_races, 'n_dnf': n_dnf,
    }

with open(OUT / 'dnf_survival.json', 'w') as f:
    json.dump(dnf_survival, f, indent=2)
top_dnf     = sorted(dnf_survival.items(), key=lambda x: x[1]['dnf_rate'], reverse=True)[:5]
top_dnf_str = ', '.join(f'{d}({v["dnf_rate"]*100:.0f}%)' for d, v in top_dnf)
step(f"Saved dnf_survival.json — top risk: {top_dnf_str}")

# ─────────────────────────────────────────────────────────────
# STEP 6: Build feature matrix
# ─────────────────────────────────────────────────────────────
section("STEP 6: Building feature matrix")

features_rows = []

for (season, round_), race in results.groupby(['season','round']):
    circuit  = race['circuit'].iloc[0]
    gp_name  = race['gp_name'].iloc[0]
    cp       = circuit_profiles.get(circuit, {})
    circuit_type = cp.get('circuit_type', 'permanent')
    reg      = regulation_profile(season)

    wx             = weather[(weather['season']==season) & (weather['round']==round_)]
    avg_air_temp   = wx['air_temp'].mean()   if not wx.empty else np.nan
    avg_track_temp = wx['track_temp'].mean() if not wx.empty else np.nan
    had_rain       = wx['rainfall'].any()    if not wx.empty else False

    q         = quali[(quali['season']==season) & (quali['round']==round_)]
    race_laps = laps_clean[(laps_clean['season']==season) & (laps_clean['round']==round_)]

    # Previous race results (no leakage — strictly before this round)
    prev = results[
        ((results['season'] < season) |
         ((results['season'] == season) & (results['round'] < round_)))
    ]

    # Previous sprint results (strictly before this round)
    if not sprint_results.empty:
        sprint_prev = sprint_results[
            ((sprint_results['season'] < season) |
             ((sprint_results['season'] == season) & (sprint_results['round'] < round_)))
        ]
    else:
        sprint_prev = pd.DataFrame(columns=sprint_results.columns)

    for _, row in race.iterrows():
        driver = row['driver_code']
        team   = row['team']

        # ── Elo (at time of race — before result) ─────────────
        race_elo_row = elo_df[
            (elo_df['driver_code'] == driver) &
            (elo_df['season'] == season) &
            (elo_df['round'] == round_) &
            (elo_df['session_type'] == 'R')
        ]
        if not race_elo_row.empty:
            elo_rating         = float(race_elo_row.iloc[0]['elo_before'])
            circuit_elo_rating = float(race_elo_row.iloc[0].get('circuit_elo_before', elo_rating))
        else:
            elo_rating         = elo.get(driver, ELO_NEW_DRIVER)
            circuit_elo_rating = circuit_elo.get((driver, circuit), ELO_NEW_DRIVER)

        blended_elo = 0.70 * elo_rating + 0.30 * circuit_elo_rating

        # ── Rolling form (race results) ───────────────────────
        driver_prev          = prev[prev['driver_code']==driver].sort_values(['season','round']).tail(3)
        rolling_avg_finish   = driver_prev['finish_position'].mean() if len(driver_prev) > 0 else 10.5
        rolling_dnf_rate     = driver_prev['is_dnf'].mean()          if len(driver_prev) > 0 else 0.12
        race_points_last3    = driver_prev['points'].sum()           if len(driver_prev) > 0 else 0.0

        # ── Sprint points (last 3 rounds that had a sprint) ───
        driver_sprint_prev   = sprint_prev[sprint_prev['driver_code']==driver].sort_values(['season','round']).tail(3)
        sprint_points_last3  = driver_sprint_prev['points'].sum() if not driver_sprint_prev.empty else 0.0

        # Combined rolling points = race + sprint
        rolling_points       = race_points_last3 + sprint_points_last3

        # ── Circuit affinity ──────────────────────────────────
        driver_circuit_hist  = prev[(prev['driver_code']==driver) & (prev['circuit']==circuit)]
        circuit_affinity     = driver_circuit_hist['finish_position'].mean() if not driver_circuit_hist.empty else rolling_avg_finish

        # ── Team strength ─────────────────────────────────────
        team_prev = prev[prev['team']==team]
        if not team_prev.empty:
            team_finishes      = team_prev.sort_values(['season','round']).tail(10)['finish_position']
            team_strength_live = float(team_finishes.mean()) if not team_finishes.empty else 10.5
        else:
            team_strength_live = constructor_strength.get(team, 10.5)

        pu_manufacturer = PU_MANUFACTURERS.get(team, 'Unknown')
        pu_strength     = PU_PRIOR.get(pu_manufacturer, 0.5)

        # ── Qualifying ────────────────────────────────────────
        q_row = q[q['driver_code']==driver]
        if not q_row.empty:
            qr             = q_row.iloc[0]
            grid_position  = qr['grid_position']  if pd.notna(qr['grid_position'])  else row['grid_position']
            gap_to_pole_ms = qr['gap_to_pole_ms'] if pd.notna(qr['gap_to_pole_ms']) else np.nan
            quali_compound = qr['tyre_compound']  if pd.notna(qr.get('tyre_compound')) else 'SOFT'
            best_quali_ms  = qr['best_ms']        if pd.notna(qr.get('best_ms'))      else np.nan
        else:
            grid_position  = row['grid_position']
            gap_to_pole_ms = np.nan
            quali_compound = 'SOFT'
            best_quali_ms  = np.nan

        # Q1→Q3 and Q2→Q3 improvement (ms) — negative = got faster (better)
        # Drivers who consistently improve from Q1→Q3 show real pace extraction
        if not q_row.empty:
            q1ms     = float(qr['q1_ms']) if pd.notna(qr.get('q1_ms')) else None
            q2ms     = float(qr['q2_ms']) if pd.notna(qr.get('q2_ms')) else None
            q3ms     = float(qr['q3_ms']) if pd.notna(qr.get('q3_ms')) else None
            q1_to_q3 = (q3ms - q1ms) if q1ms and q3ms else np.nan
            q2_to_q3 = (q3ms - q2ms) if q2ms and q3ms else np.nan
        else:
            q1_to_q3 = np.nan
            q2_to_q3 = np.nan

        # ── Race lap features ─────────────────────────────────
        driver_laps     = race_laps[race_laps['driver_code']==driver]
        median_lap_ms   = driver_laps['lap_time_ms'].median() if not driver_laps.empty else np.nan
        lap_consistency = driver_laps['lap_time_ms'].std()    if len(driver_laps) > 3  else np.nan

        # ── Tyre strategy ─────────────────────────────────────
        race_stints = stints[
            (stints['season']==season) & (stints['round']==round_) &
            (stints['driver_code']==driver)
        ]
        n_stints  = len(race_stints)
        n_pits    = max(n_stints - 1, 0)
        used_soft = (race_stints['compound']=='SOFT').any() if not race_stints.empty else False

        # ── Circuit features ──────────────────────────────────
        ctype             = cp.get('circuit_type', 'permanent')
        sc_probability    = cp.get('sc_probability', SC_PROB_DEFAULTS.get(ctype, 0.40))
        avg_pit_stops     = cp.get('avg_pit_stops', 2.0)
        overtaking_index  = cp.get('overtaking_index', 0.3)
        arw_effectiveness = cp.get('arw_effectiveness', 0.255)
        tyre_deg_rate     = cp.get('tyre_deg_soft_ms_per_lap', 80.0)
        pit_lane_delta    = cp.get('pit_lane_delta_sec', PIT_LANE_DELTA.get(circuit, PIT_LANE_DELTA['default']))
        pit_crew_speed    = PIT_CREW_SPEED.get(team, PIT_CREW_SPEED['default'])
        energy_demand     = cp.get('energy_demand_index', circuit_energy_demand(circuit, circuit_type))

        grid_pos_int = int(grid_position) if pd.notna(grid_position) else 10
        lap1_risk    = (
            0.01 if grid_pos_int <= 3  else
            0.03 if grid_pos_int <= 10 else
            0.06
        )

        ers_circuit_factor = {
            'street':        0.75,
            'street_hybrid': 0.60,
            'permanent':     0.45,
        }.get(circuit_type, 0.50)

        if reg.get('active_aero'):
            ers_circuit_factor = min(1.0, 0.35 + energy_demand * 0.65)

        uncertainty = pu_uncertainty(team, season)
        pu_strength_adjusted = pu_strength * (1 - ers_circuit_factor * 0.15) * (1 - uncertainty * 0.20)

        features_rows.append({
            # Identifiers
            'season':          season,
            'round':           round_,
            'gp_name':         gp_name,
            'circuit':         circuit,
            'driver_code':     driver,
            'team':            team,
            # Target
            'finish_position': row['finish_position'],
            'is_dnf':          int(row['is_dnf']),
            'points':          row['points'],
            # Driver features
            'elo_rating':              round(blended_elo, 1),
            'circuit_elo_rating':      round(circuit_elo_rating, 1),
            'rolling_avg_finish':      round(rolling_avg_finish, 2),
            'rolling_dnf_rate':        round(rolling_dnf_rate, 3),
            'rolling_points_last3':    round(rolling_points, 1),       # race + sprint
            'sprint_points_last3':     round(sprint_points_last3, 1),  # sprint only
            'circuit_affinity':        round(circuit_affinity, 2),
            # Team features
            'team_strength':           round(team_strength_live, 3),
            'pu_manufacturer':         pu_manufacturer,
            'pu_strength':             round(pu_strength, 3),
            'pu_strength_adjusted':    round(pu_strength_adjusted, 3),
            # Qualifying features
            'grid_position':           grid_position,
            'gap_to_pole_ms':          round(gap_to_pole_ms, 0) if pd.notna(gap_to_pole_ms) else np.nan,
            'gap_to_pole_sec':         round(gap_to_pole_ms/1000, 3) if pd.notna(gap_to_pole_ms) else np.nan,
            'quali_compound':          quali_compound,
            'q1_to_q3_ms':             round(q1_to_q3, 0) if pd.notna(q1_to_q3) else np.nan,
            'q2_to_q3_ms':             round(q2_to_q3, 0) if pd.notna(q2_to_q3) else np.nan,
            # Race execution (available after race, used for training)
            'median_lap_ms':           round(median_lap_ms, 0) if pd.notna(median_lap_ms) else np.nan,
            'lap_consistency_ms':      round(lap_consistency, 0) if pd.notna(lap_consistency) else np.nan,
            'n_pits':                  n_pits,
            'used_soft':               int(used_soft),
            # Circuit features
            'circuit_type':            circuit_type,
            'sc_probability':          sc_probability,
            'avg_pit_stops_circuit':   avg_pit_stops,
            'overtaking_index':        overtaking_index,
            'arw_effectiveness':       arw_effectiveness,
            'tyre_deg_rate':           tyre_deg_rate,
            'ers_circuit_factor':      ers_circuit_factor,
            'pit_lane_delta_sec':      pit_lane_delta,
            'pit_crew_speed':          pit_crew_speed,
            'lap1_risk':               lap1_risk,
            # Regulation era / energy management
            'regulation_era':          int(reg.get('regulation_era', 0)),
            'active_aero':             int(bool(reg.get('active_aero', False))),
            'ers_power_kw':            float(reg.get('ers_power_kw', 120)),
            'recharge_limit_mj':       float(reg.get('recharge_limit_mj', 8.5)),
            'race_boost_cap_kw':       float(reg.get('race_boost_cap_kw', 120)),
            'wet_ers_deploy_factor':   float(reg.get('wet_ers_deploy_factor', 1.0)),
            'start_assist_factor':     float(reg.get('start_assist_factor', 0.0)),
            'constructor_prior_reliability': float(reg.get('constructor_prior_reliability', 1.0)),
            'live_weekend_weight':     float(reg.get('live_weekend_weight', 0.35)),
            'energy_demand_index':     round(energy_demand, 3),
            'pu_uncertainty':          round(uncertainty, 3),
            # Season weight
            'season_weight':           season_weight(season),
            # Weather
            'air_temp':                round(avg_air_temp, 1)   if pd.notna(avg_air_temp)   else np.nan,
            'track_temp':              round(avg_track_temp, 1) if pd.notna(avg_track_temp) else np.nan,
            'had_rain':                int(had_rain),
        })

features = pd.DataFrame(features_rows)
step(f"Feature matrix: {len(features)} rows × {len(features.columns)} columns")

# ─────────────────────────────────────────────────────────────
# STEP 7: Validate features
# ─────────────────────────────────────────────────────────────
section("STEP 7: Feature validation")

print("\n  Null counts per feature:")
null_counts = features.isnull().sum()
null_pcts   = (null_counts / len(features) * 100).round(1)
for col in features.columns:
    if null_counts[col] > 0:
        print(f"    {col:35s}  {null_counts[col]:4d}  ({null_pcts[col]:.1f}%)")

numeric_features = [
    'elo_rating', 'grid_position', 'gap_to_pole_sec',
    'rolling_avg_finish', 'team_strength', 'pu_strength_adjusted',
    'circuit_affinity', 'rolling_dnf_rate', 'sprint_points_last3',
    'q1_to_q3_ms', 'q2_to_q3_ms',
    'regulation_era', 'energy_demand_index', 'pu_uncertainty',
    'live_weekend_weight',
]
print("\n  Feature correlations with finish_position:")
target = 'finish_position'
for col in numeric_features:
    d = features.dropna(subset=[col, target])
    if len(d) > 10:
        r = d[[col, target]].corr().iloc[0, 1]
        if pd.isna(r):
            pct_valid = d[col].notna().mean() * 100
            print(f"    {col:35s}  NaN ({pct_valid:.0f}% non-null — insufficient variance)")
            continue
        bar       = '█' * int(abs(r) * 20)
        direction = '+' if r > 0 else '-'
        print(f"    {col:35s}  {direction}{abs(r):.4f}  {bar}")

print("\n  Feature statistics:")
print(features[numeric_features].describe().round(2).to_string())

# ─────────────────────────────────────────────────────────────
# STEP 8: Train/test split
# ─────────────────────────────────────────────────────────────
section("STEP 8: Train / Test split")

train = features[features['season'] != 2026]
test  = features[features['season'] == 2026]

print(f"\n  Train ({train['season'].min()}-{train['season'].max()}): {len(train)} rows  ({train['round'].nunique()} races)")
print(f"  Test  (2026): {len(test)} rows  ({test['round'].nunique()} races)")
print(f"\n  ⚠️  Only {test['round'].nunique()} 2026 races — test set is tiny.")
print(f"  Model will improve significantly as 2026 data accumulates.")

train_coverage = (train[numeric_features].notna().mean() * 100).round(1)
print(f"\n  Train features available (non-null >80%):")
for f, pct in train_coverage.items():
    status = '✓' if pct >= 80 else '⚠'
    print(f"    {status} {f:35s}  {pct:.0f}%")

# ─────────────────────────────────────────────────────────────
# STEP 9: Save outputs
# ─────────────────────────────────────────────────────────────
section("STEP 9: Saving outputs")

features.to_parquet(OUT / 'features.parquet', index=False)
step(f"Saved features.parquet ({len(features)} rows × {len(features.columns)} cols)")

features.to_csv(OUT / 'features.csv', index=False)
step(f"Saved features.csv")

train.to_parquet(OUT / 'train.parquet', index=False)
test.to_parquet(OUT / 'test.parquet', index=False)
step(f"Saved train.parquet + test.parquet")

prediction_features = [
    'elo_rating', 'grid_position', 'gap_to_pole_sec',
    'rolling_avg_finish', 'rolling_dnf_rate',
    'rolling_points_last3',    # now includes sprint
    'sprint_points_last3',     # sprint-only signal
    'team_strength', 'pu_strength_adjusted',
    'circuit_affinity', 'sc_probability',
    'overtaking_index', 'arw_effectiveness',
    'tyre_deg_rate', 'ers_circuit_factor',
    'track_temp', 'had_rain',
    'pit_lane_delta_sec', 'pit_crew_speed', 'lap1_risk',
    'q1_to_q3_ms', 'q2_to_q3_ms',   # Q-session improvement signals
    'regulation_era', 'active_aero', 'ers_power_kw',
    'recharge_limit_mj', 'race_boost_cap_kw',
    'wet_ers_deploy_factor', 'start_assist_factor',
    'constructor_prior_reliability', 'live_weekend_weight',
    'energy_demand_index', 'pu_uncertainty',
]

available_train_seasons = sorted(features[features['season']!=2026]['season'].unique().tolist())
feature_meta = {
    'prediction_features': prediction_features,
    'target':              'finish_position',
    'train_seasons':       available_train_seasons,
    'test_seasons':        [2026],
    'total_rows':          len(features),
    'train_rows':          len(train),
    'test_rows':           len(test),
    'reg_break_discount':  REG_BREAK_DISCOUNT,
    'elo_k_factor':        ELO_K_FACTOR,
    'sprint_elo_k_scale':  SPRINT_ELO_K_SCALE,
    'season_weights':      SEASON_WEIGHTS,
    'sprint_races_found':  len(sprint_results['round'].unique()) if not sprint_results.empty else 0,
    'regulation_config':   REGULATION_CONFIG,
}
with open(OUT / 'feature_meta.json', 'w') as f:
    json.dump(feature_meta, f, indent=2)
step(f"Saved feature_meta.json")

with open(OUT / 'regulation_eras.json', 'w') as f:
    json.dump(REGULATION_CONFIG, f, indent=2)
step("Saved regulation_eras.json")

print(f"\n{'='*55}")
print(f"  Feature engineering complete!")
print(f"  Output directory: {OUT.absolute()}")
print(f"\n  Files:")
for p in sorted(OUT.iterdir()):
    size = p.stat().st_size
    print(f"    {p.name:35s}  {size/1024:.1f} KB")
print(f"\n  Next step: python predict.py")
print(f"{'='*55}")
