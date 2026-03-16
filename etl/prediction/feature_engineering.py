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
# 2026 regulation adjustment weights
REG_BREAK_DISCOUNT  = 0.4   # how much to trust pre-2026 constructor data
ELO_K_FACTOR        = 40    # higher than normal (32) due to 2026 uncertainty
ELO_BASE            = 1500
ELO_NEW_DRIVER      = 1400  # Cadillac and genuinely new drivers

# Season weights — how much to trust each year's data for 2026 prediction
# Lower weight = used as weak prior only
# Rationale: 2022 introduced ground effect (current era), 2026 is new era again
SEASON_WEIGHTS = {
    # Only seasons actually loaded in DB (2021 onwards)
    # 2021: last pre-ground-effect season — useful for circuit/driver priors
    # 2022-2024: same regulation era, increasingly trusted
    # 2025: direct prior, highest historical weight
    # 2026: target season, full weight
    2021: 0.20,
    2022: 0.50,
    2023: 0.75,
    2024: 0.85,
    2025: 0.90,
    2026: 1.00,
}

def season_weight(season: int) -> float:
    return SEASON_WEIGHTS.get(season, 0.50)

# Known 2026 PU manufacturer assignments
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

# PU strength priors for 2026 (unknown = 0, known strong = 1)
PU_PRIOR = {
    'Ferrari':        0.65,
    'Mercedes':       0.70,
    'Honda':          0.60,
    'Ford':           0.50,   # unknown
    'Renault':        0.45,
    'Audi':           0.40,   # brand new
    'General Motors': 0.35,   # brand new
}

# Circuit type classification
CIRCUIT_TYPES = {
    'Melbourne':         'street_hybrid',
    'Shanghai':          'permanent',
    'Suzuka':            'permanent',
    'Sakhir':            'permanent',
    'Jeddah':            'street',
    'Miami':             'street_hybrid',
    'Imola':             'permanent',
    'Monaco':            'street',
    'Barcelona':         'permanent',
    'Montreal':          'street_hybrid',
    'Spielberg':         'permanent',
    'Silverstone':       'permanent',
    'Spa':               'permanent',
    'Budapest':          'permanent',
    'Zandvoort':         'permanent',
    'Monza':             'permanent',
    'Baku':              'street',
    'Singapore':         'street',
    'Austin':            'permanent',
    'Mexico City':       'permanent',
    'São Paulo':         'permanent',
    'Las Vegas':         'street',
    'Lusail':            'permanent',
    'Yas Island':        'permanent',
}

# Track-specific pit lane delta (seconds) — kept in sync with predict.py
PIT_LANE_DELTA = {
    'Monaco': 19.0, 'Singapore': 24.0, 'Marina Bay': 24.0,
    'Baku': 18.0,   'Jeddah': 22.0,    'Las Vegas': 17.0,
    'Melbourne': 23.0, 'Shanghai': 23.5, 'Zandvoort': 19.0,
    'Budapest': 20.0,  'default': 21.0,
}

# Pit crew speed by team (seconds avg stop — lower = faster)
PIT_CREW_SPEED = {
    'Red Bull Racing': 2.0, 'Mercedes': 2.2, 'Ferrari': 2.3,
    'McLaren': 2.2, 'Aston Martin': 2.6, 'Alpine': 2.8,
    'Williams': 3.0, 'Racing Bulls': 2.7, 'Kick Sauber': 2.9,
    'Haas F1 Team': 2.8, 'Cadillac': 3.2, 'default': 2.7,
}

# SC probability defaults by circuit type (used when track_status data is absent)
SC_PROB_DEFAULTS = {
    'street':         0.72,   # street circuits historically ~72% chance of SC
    'street_hybrid':  0.55,   # mixed
    'permanent':      0.38,   # permanent circuits lower
}

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
step(f"Results: {len(results)} rows")

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

# Clean laps: remove outliers (>20% above race median = SC laps, in-laps)
lap_medians = laps.groupby(['season','round'])['lap_time_ms'].transform('median')
laps_clean = laps[laps['lap_time_ms'] <= lap_medians * 1.2].copy()
removed = len(laps) - len(laps_clean)
step(f"Removed {removed} outlier laps ({removed/len(laps)*100:.1f}%)")

# Clean results: handle "Lapped" as valid finish, "Retired" as DNF
results['is_dnf'] = results['status'].isin(['Retired', 'Disqualified', 'Did not start'])
results['is_lapped'] = results['status'] == 'Lapped'
step(f"DNF rate: {results['is_dnf'].mean()*100:.1f}%")

# Fill missing grid positions with finish position (assume started from where finished if no data)
results['grid_position'] = results['grid_position'].fillna(results['finish_position'])

# Normalise team names (minor variations in FastF1)
team_map = {
    'Red Bull Racing': 'Red Bull Racing',
    'Kick Sauber': 'Kick Sauber',
    'Haas F1 Team': 'Haas F1 Team',
    'Racing Bulls': 'Racing Bulls',
}
results['team_clean'] = results['team'].map(team_map).fillna(results['team'])

# ─────────────────────────────────────────────────────────────
# STEP 3: Driver Elo ratings
# ─────────────────────────────────────────────────────────────
section("STEP 3: Computing Driver Elo ratings")

# Initialise from 2025 performance (rough seed before updating)
# We'll compute dynamically by replaying all races
elo = {}
elo_history = []  # track evolution

def expected_score(ra: float, rb: float) -> float:
    return 1 / (1 + 10 ** ((rb - ra) / 400))

def update_elo(driver: str, finish_pos: int, n_drivers: int) -> float:
    """Compute Elo score for a finish position."""
    # Score = fraction of drivers beaten
    return 1 - (finish_pos - 1) / (n_drivers - 1)

# Replay all races — global Elo + circuit-specific Elo
race_results = results.sort_values(['season','round','finish_position'])
circuit_elo  = {}   # {(driver, circuit): rating}

for (season, round_), race in race_results.groupby(['season','round']):
    valid = race.dropna(subset=['finish_position'])
    if valid.empty:
        continue

    circuit = race['circuit'].iloc[0] if 'circuit' in race.columns else 'Unknown'
    n = len(valid)
    drivers_in_race = valid['driver_code'].tolist()

    for d in drivers_in_race:
        if d not in elo:
            elo[d] = ELO_NEW_DRIVER
        if (d, circuit) not in circuit_elo:
            circuit_elo[(d, circuit)] = ELO_NEW_DRIVER

    field_avg_elo   = np.mean([elo[d] for d in drivers_in_race])
    circuit_avg_elo = np.mean([circuit_elo[(d, circuit)] for d in drivers_in_race])
    k         = ELO_K_FACTOR * season_weight(season)
    k_circuit = k * 0.5   # circuit Elo updates slower — patterns are stable

    new_elos         = {}
    new_circuit_elos = {}

    for _, row in valid.iterrows():
        driver = row['driver_code']
        actual_score     = update_elo(driver, int(row['finish_position']), n)
        exp_global       = expected_score(elo[driver], field_avg_elo)
        exp_circuit      = expected_score(circuit_elo[(driver, circuit)], circuit_avg_elo)
        new_elos[driver] = elo[driver] + k * (actual_score - exp_global)
        new_circuit_elos[(driver, circuit)] = (
            circuit_elo[(driver, circuit)] + k_circuit * (actual_score - exp_circuit)
        )
        elo_history.append({
            'season': season, 'round': round_,
            'driver_code': driver,
            'circuit': circuit,
            'elo_before': elo[driver],
            'elo_after': new_elos[driver],
            'circuit_elo_before': circuit_elo[(driver, circuit)],
            'circuit_elo_after': new_circuit_elos[(driver, circuit)],
            'finish_position': row['finish_position'],
        })

    elo.update(new_elos)
    circuit_elo.update(new_circuit_elos)

circuit_elo_export = {f"{d}|{c}": round(v, 1) for (d,c), v in circuit_elo.items()}

step(f"Elo computed for {len(elo)} drivers")

# Print top 10
elo_sorted = sorted(elo.items(), key=lambda x: x[1], reverse=True)
print("\n  Top 10 drivers by Elo:")
for i, (driver, rating) in enumerate(elo_sorted[:10]):
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
    """
    Returns dict: team -> weighted_avg_finish
    Lower = stronger (avg finish position).
    Blends all available seasons using SEASON_WEIGHTS.
    2026 data grows in influence each race.
    """
    strength = {}
    available_seasons = sorted(results_df['season'].unique())

    for team in results_df['team'].unique():
        weighted_sum   = 0.0
        total_weight   = 0.0

        for s in available_seasons:
            d = results_df[(results_df['team']==team) & (results_df['season']==s)]
            if d.empty:
                continue

            avg_finish = d['finish_position'].mean()
            n          = len(d)
            base_w     = season_weight(s)

            # 2026: weight grows with each race (more data = more trust)
            if s == 2026:
                n_2026_races = results_df[results_df['season']==2026]['round'].nunique()
                base_w = min(n_2026_races / 10.0, 0.9)

            # Apply regulation break discount for pre-2022 data
            if s < 2022:
                base_w *= (1 - REG_BREAK_DISCOUNT)

            # Scale by number of races (more races = more reliable)
            race_scale = min(n / 20.0, 1.0)
            w = base_w * race_scale

            weighted_sum  += avg_finish * w
            total_weight  += w

        if total_weight > 0:
            strength[team] = round(weighted_sum / total_weight, 3)
        else:
            strength[team] = 10.5  # neutral prior

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

# SC probability per circuit
sc_events = track_status[track_status['status_type'].isin(['SC','VSC'])]
races_per_circuit = results.groupby(['season','round','circuit']).size().reset_index(name='n')
sc_count = sc_events.groupby(['season','round','circuit']).size().reset_index(name='sc_count')
sc_by_circuit = races_per_circuit.merge(sc_count, on=['season','round','circuit'], how='left')
sc_by_circuit['had_sc'] = sc_by_circuit['sc_count'].notna()

sc_prob_by_circuit_raw = sc_by_circuit.groupby('circuit')['had_sc'].mean().to_dict()

# If track_status data is sparse (extras-only not run yet),
# fall back to circuit-type defaults rather than 0.35 for everything
total_sc_events = len(track_status)
if total_sc_events < 10:
    step(f"  ⚠ Only {total_sc_events} track status rows — using circuit-type SC defaults")
    sc_prob_by_circuit = {}   # will use defaults per circuit type below
else:
    sc_prob_by_circuit = sc_prob_by_circuit_raw

# Avg pit stops per circuit
avg_pits = stints.groupby(['season','round']).apply(
    lambda x: x.groupby('driver_code')['compound'].count().mean() - 1
).reset_index(name='avg_pits')
avg_pits_circuit = avg_pits.merge(
    results[['season','round','circuit']].drop_duplicates(),
    on=['season','round']
)
avg_pits_by_circuit = avg_pits_circuit.groupby('circuit')['avg_pits'].mean().to_dict()

# Tyre deg per circuit — quadratic fit captures non-linear cliff effect
tyre_deg    = {}   # linear slope (backward compat for circuit profiles)
tyre_deg_gp = {}   # quadratic coefficients per circuit+compound

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
                coeffs = np.polyfit(x, y, 2)   # quadratic: a*x^2 + b*x + c
                tyre_deg_gp[circuit][compound] = {
                    'quad':   round(float(coeffs[0]), 5),   # acceleration term
                    'linear': round(float(coeffs[1]), 3),   # base deg rate ms/lap
                    'n_laps': len(comp_laps),
                }
                if compound == 'SOFT':
                    tyre_deg[circuit] = round(float(coeffs[1]), 2)
            except Exception:
                if compound == 'SOFT':
                    tyre_deg[circuit] = 80.0

# Circuit overtaking index (positions changed / total positions available)
# Note: this is a circuit-level aggregate across ALL historical races
# It's computed once and treated as a stable circuit characteristic.
# Minor leakage since each row's own positions_changed contributes ~1/N to the index
# (acceptable for a circuit-level prior — impact per row is negligible)
overtaking = results.copy()
overtaking['positions_changed'] = abs(overtaking['grid_position'] - overtaking['finish_position'])
overtaking_by_circuit = overtaking.groupby('circuit').apply(
    lambda x: x['positions_changed'].sum() / (len(x) * 10)
).to_dict()

circuit_profiles = {}
all_circuits = set(list(sc_prob_by_circuit.keys()) +
                   list(avg_pits_by_circuit.keys()) +
                   list(overtaking_by_circuit.keys()))

with open(OUT / 'tyre_deg_gp.json', 'w') as f:
    json.dump(tyre_deg_gp, f, indent=2)
step(f"Saved tyre_deg_gp.json for {len(tyre_deg_gp)} circuits")

for circuit in all_circuits:
    ctype = CIRCUIT_TYPES.get(circuit, 'permanent')
    # SC probability: use actual data if available, else circuit-type default
    if circuit in sc_prob_by_circuit:
        sc_prob = round(sc_prob_by_circuit[circuit], 3)
    else:
        sc_prob = SC_PROB_DEFAULTS.get(ctype, 0.40)

    circuit_profiles[circuit] = {
        'sc_probability':           sc_prob,
        'avg_pit_stops':            round(avg_pits_by_circuit.get(circuit, 2.0), 2),
        'tyre_deg_soft_ms_per_lap': round(tyre_deg.get(circuit, 80.0), 1),
        'overtaking_index':         round(overtaking_by_circuit.get(circuit, 0.3), 3),
        'circuit_type':             ctype,
        'arw_effectiveness':        round(overtaking_by_circuit.get(circuit, 0.3) * 0.85, 3),
        'pit_lane_delta_sec':       PIT_LANE_DELTA.get(circuit, PIT_LANE_DELTA['default']),
    }

print(f"\n  Circuit profiles computed for {len(circuit_profiles)} circuits")
if circuit_profiles:
    # Show top 3 highest SC probability
    top_sc = sorted(circuit_profiles.items(), key=lambda x: x[1]['sc_probability'], reverse=True)[:3]
    print("  Highest SC probability circuits:")
    for c, p in top_sc:
        print(f"    {c:20s}  SC prob={p['sc_probability']:.2f}  overtaking={p['overtaking_index']:.2f}")

with open(OUT / 'circuit_profiles.json', 'w') as f:
    json.dump(circuit_profiles, f, indent=2)
step(f"Saved circuit_profiles.json")

# ── DNF Survival Analysis (Weibull) ──────────────────────────────────────────
# Models lap-by-lap DNF probability — shape < 1 = survive lap 1 gets safer
dnf_survival = {}
for driver in results['driver_code'].unique():
    d_res    = results[results['driver_code'] == driver]
    n_races  = len(d_res)
    n_dnf    = int(d_res['is_dnf'].sum())
    dnf_rate = n_dnf / max(n_races, 1)
    # Weibull: shape=0.8 (F1 hazard decreasing after lap 1 chaos)
    shape = 0.8
    scale = 58 / ((-np.log(max(1 - dnf_rate, 0.01))) ** (1/shape))
    dnf_survival[driver] = {
        'dnf_rate': round(dnf_rate, 4),
        'shape':    round(shape, 3),
        'scale':    round(float(scale), 2),
        'n_races':  n_races, 'n_dnf': n_dnf,
    }

with open(OUT / 'dnf_survival.json', 'w') as f:
    json.dump(dnf_survival, f, indent=2)
top_dnf = sorted(dnf_survival.items(), key=lambda x: x[1]['dnf_rate'], reverse=True)[:5]
top_dnf_str = ', '.join(f'{d}({v["dnf_rate"]*100:.0f}%)' for d, v in top_dnf)
step(f"Saved dnf_survival.json — top risk: {top_dnf_str}")

# ─────────────────────────────────────────────────────────────
# STEP 6: Build feature matrix
# ─────────────────────────────────────────────────────────────
section("STEP 6: Building feature matrix")

features_rows = []

for (season, round_), race in results.groupby(['season','round']):
    circuit = race['circuit'].iloc[0]
    gp_name = race['gp_name'].iloc[0]
    cp      = circuit_profiles.get(circuit, {})
    circuit_type = cp.get('circuit_type', 'permanent')

    # Weather for this race (avg across race)
    wx = weather[(weather['season']==season) & (weather['round']==round_)]
    avg_air_temp   = wx['air_temp'].mean()   if not wx.empty else np.nan
    avg_track_temp = wx['track_temp'].mean() if not wx.empty else np.nan
    had_rain       = wx['rainfall'].any()    if not wx.empty else False

    # Qualifying for this race
    q = quali[(quali['season']==season) & (quali['round']==round_)]

    # Lap data for this race
    race_laps = laps_clean[(laps_clean['season']==season) & (laps_clean['round']==round_)]

    # Rolling window: last 3 races before this one
    prev = results[
        ((results['season'] < season) |
         ((results['season'] == season) & (results['round'] < round_)))
    ]

    for _, row in race.iterrows():
        driver = row['driver_code']
        team   = row['team']

        # ── Driver features ───────────────────────────────────
        # Use Elo rating AT TIME OF RACE (before the race result is known)
        # elo_history has elo_before = Elo going into that race
        race_elo_row = elo_df[
            (elo_df['driver_code'] == driver) &
            (elo_df['season'] == season) &
            (elo_df['round'] == round_)
        ]
        if not race_elo_row.empty:
            elo_rating         = float(race_elo_row.iloc[0]['elo_before'])
            circuit_elo_rating = float(race_elo_row.iloc[0].get('circuit_elo_before', elo_rating))
        else:
            elo_rating         = elo.get(driver, ELO_NEW_DRIVER)
            circuit_elo_rating = circuit_elo.get((driver, circuit), ELO_NEW_DRIVER)
        # Blended Elo: 70% global + 30% circuit-specific
        blended_elo = 0.70 * elo_rating + 0.30 * circuit_elo_rating

        # Rolling form: avg finish last 3 races
        driver_prev = prev[prev['driver_code']==driver].sort_values(['season','round']).tail(3)
        rolling_avg_finish  = driver_prev['finish_position'].mean() if len(driver_prev) > 0 else 10.5
        rolling_dnf_rate    = driver_prev['is_dnf'].mean()          if len(driver_prev) > 0 else 0.12
        rolling_points      = driver_prev['points'].sum()           if len(driver_prev) > 0 else 0.0

        # Circuit affinity: driver's historical finish at this circuit
        driver_circuit_hist = prev[
            (prev['driver_code']==driver) & (prev['circuit']==circuit)
        ]
        circuit_affinity = driver_circuit_hist['finish_position'].mean() if not driver_circuit_hist.empty else rolling_avg_finish

        # ── Team features ─────────────────────────────────────
        # Use team strength computed from races BEFORE this one (no leakage)
        team_prev = prev[prev['team']==team]
        if not team_prev.empty:
            # Weighted avg: recent races count more
            team_finishes = team_prev.sort_values(['season','round']).tail(10)['finish_position']
            team_strength_live = float(team_finishes.mean()) if not team_finishes.empty else 10.5
        else:
            # No prior data — fall back to global constructor prior
            team_strength_live = constructor_strength.get(team, 10.5)
        team_strength   = team_strength_live
        pu_manufacturer = PU_MANUFACTURERS.get(team, 'Unknown')
        pu_strength     = PU_PRIOR.get(pu_manufacturer, 0.5)

        # ── Qualifying features ───────────────────────────────
        q_row = q[q['driver_code']==driver]
        if not q_row.empty:
            qr           = q_row.iloc[0]
            grid_position    = qr['grid_position']   if pd.notna(qr['grid_position']) else row['grid_position']
            gap_to_pole_ms   = qr['gap_to_pole_ms']  if pd.notna(qr['gap_to_pole_ms']) else np.nan
            quali_compound   = qr['tyre_compound']   if pd.notna(qr.get('tyre_compound')) else 'SOFT'
            best_quali_ms    = qr['best_ms']         if pd.notna(qr.get('best_ms')) else np.nan
        else:
            grid_position  = row['grid_position']
            gap_to_pole_ms = np.nan
            quali_compound = 'SOFT'
            best_quali_ms  = np.nan

        # ── Race lap features (for model evaluation) ──────────
        driver_laps = race_laps[race_laps['driver_code']==driver]
        median_lap_ms = driver_laps['lap_time_ms'].median() if not driver_laps.empty else np.nan
        lap_consistency = driver_laps['lap_time_ms'].std()  if len(driver_laps) > 3 else np.nan

        # ── Tyre strategy ─────────────────────────────────────
        race_stints = stints[
            (stints['season']==season) & (stints['round']==round_) &
            (stints['driver_code']==driver)
        ]
        n_stints  = len(race_stints)
        n_pits    = max(n_stints - 1, 0)
        used_soft = (race_stints['compound']=='SOFT').any() if not race_stints.empty else False

        # ── Circuit features ──────────────────────────────────
        ctype              = cp.get('circuit_type', 'permanent')
        sc_probability     = cp.get('sc_probability', SC_PROB_DEFAULTS.get(ctype, 0.40))
        avg_pit_stops      = cp.get('avg_pit_stops', 2.0)
        overtaking_index   = cp.get('overtaking_index', 0.3)
        arw_effectiveness  = cp.get('arw_effectiveness', 0.255)
        tyre_deg_rate      = cp.get('tyre_deg_soft_ms_per_lap', 80.0)
        pit_lane_delta     = cp.get('pit_lane_delta_sec', PIT_LANE_DELTA.get(circuit, PIT_LANE_DELTA['default']))
        pit_crew_speed     = PIT_CREW_SPEED.get(team, PIT_CREW_SPEED['default'])

        # Lap 1 incident risk by grid band
        grid_pos_int = int(grid_position) if pd.notna(grid_position) else 10
        lap1_risk = (
            0.01 if grid_pos_int <= 3 else
            0.03 if grid_pos_int <= 10 else
            0.06
        )

        # ── ERS circuit adjustment (2026) ─────────────────────
        # Low-speed circuits benefit more from 350kW MGU-K
        ers_circuit_factor = {
            'street':         0.75,
            'street_hybrid':  0.60,
            'permanent':      0.45,
        }.get(circuit_type, 0.50)

        # Effective PU strength adjusted for circuit type
        pu_strength_adjusted = pu_strength * (1 - ers_circuit_factor * 0.15)

        features_rows.append({
            # Identifiers
            'season':            season,
            'round':             round_,
            'gp_name':           gp_name,
            'circuit':           circuit,
            'driver_code':       driver,
            'team':              team,
            # Target
            'finish_position':   row['finish_position'],
            'is_dnf':            int(row['is_dnf']),
            'points':            row['points'],
            # Driver features
            'elo_rating':            round(blended_elo, 1),
            'circuit_elo_rating':    round(circuit_elo_rating, 1),
            'rolling_avg_finish':    round(rolling_avg_finish, 2),
            'rolling_dnf_rate':      round(rolling_dnf_rate, 3),
            'rolling_points_last3':  round(rolling_points, 1),
            'circuit_affinity':      round(circuit_affinity, 2),
            # Team features
            'team_strength':         round(team_strength, 3),
            'pu_manufacturer':       pu_manufacturer,
            'pu_strength':           round(pu_strength, 3),
            'pu_strength_adjusted':  round(pu_strength_adjusted, 3),
            # Qualifying features
            'grid_position':         grid_position,
            'gap_to_pole_ms':        round(gap_to_pole_ms, 0) if pd.notna(gap_to_pole_ms) else np.nan,
            'gap_to_pole_sec':       round(gap_to_pole_ms/1000, 3) if pd.notna(gap_to_pole_ms) else np.nan,
            'quali_compound':        quali_compound,
            # Race execution features (available after race, used for training)
            'median_lap_ms':         round(median_lap_ms, 0) if pd.notna(median_lap_ms) else np.nan,
            'lap_consistency_ms':    round(lap_consistency, 0) if pd.notna(lap_consistency) else np.nan,
            'n_pits':                n_pits,
            'used_soft':             int(used_soft),
            # Circuit features
            'circuit_type':          circuit_type,
            'sc_probability':        sc_probability,
            'avg_pit_stops_circuit': avg_pit_stops,
            'overtaking_index':      overtaking_index,
            'arw_effectiveness':     arw_effectiveness,
            'tyre_deg_rate':         tyre_deg_rate,
            'ers_circuit_factor':    ers_circuit_factor,
            # New simulation features
            'pit_lane_delta_sec':    pit_lane_delta,
            'pit_crew_speed':        pit_crew_speed,
            'lap1_risk':             lap1_risk,
            # Season weight (how much to trust this row for 2026 prediction)
            'season_weight':         season_weight(season),
            # Weather features
            'air_temp':              round(avg_air_temp, 1)   if pd.notna(avg_air_temp)   else np.nan,
            'track_temp':            round(avg_track_temp, 1) if pd.notna(avg_track_temp) else np.nan,
            'had_rain':              int(had_rain),
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

print("\n  Feature correlations with finish_position:")
numeric_features = [
    'elo_rating', 'grid_position', 'gap_to_pole_sec',
    'rolling_avg_finish', 'team_strength', 'pu_strength_adjusted',
    'circuit_affinity', 'rolling_dnf_rate',
]
target = 'finish_position'
for col in numeric_features:
    d = features.dropna(subset=[col, target])
    if len(d) > 10:
        r = d[[col, target]].corr().iloc[0, 1]
        bar = '█' * int(abs(r) * 20)
        direction = '+' if r > 0 else '-'
        print(f"    {col:35s}  {direction}{abs(r):.4f}  {bar}")

print("\n  Feature statistics:")
print(features[numeric_features].describe().round(2).to_string())

# ─────────────────────────────────────────────────────────────
# STEP 8: Train/test split info
# ─────────────────────────────────────────────────────────────
section("STEP 8: Train / Test split")

# Train: 2025 data
# Test:  2026 data (all of it — it's too small to hold back)
train = features[features['season'] != 2026]   # all historical seasons
test  = features[features['season'] == 2026]

print(f"\n  Train ({train['season'].min()}-{train['season'].max()}): {len(train)} rows  ({train['round'].nunique()} races)")
print(f"  Test  (2026): {len(test)} rows  ({test['round'].nunique()} races)")
print(f"\n  ⚠️  Only {test['round'].nunique()} 2026 races — test set is tiny.")
print(f"  Model will improve significantly as 2026 data accumulates.")
print(f"\n  Train features available (non-null >80%):")
train_coverage = (train[numeric_features].notna().mean() * 100).round(1)
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

# Feature list for model
prediction_features = [
    # Pre-race features only (what we know BEFORE the race)
    'elo_rating', 'grid_position', 'gap_to_pole_sec',
    'rolling_avg_finish', 'rolling_dnf_rate',
    'team_strength', 'pu_strength_adjusted',
    'circuit_affinity', 'sc_probability',
    'overtaking_index', 'arw_effectiveness',
    'tyre_deg_rate', 'ers_circuit_factor',
    # Weather — available from forecast
    'track_temp', 'had_rain',
    # Simulation features
    'pit_lane_delta_sec', 'pit_crew_speed', 'lap1_risk',
]

available_train_seasons = sorted(features[features['season']!=2026]['season'].unique().tolist())
feature_meta = {
    'prediction_features': prediction_features,
    'target': 'finish_position',
    'train_seasons': available_train_seasons,
    'test_seasons': [2026],
    'total_rows': len(features),
    'train_rows': len(train),
    'test_rows': len(test),
    'reg_break_discount': REG_BREAK_DISCOUNT,
    'elo_k_factor': ELO_K_FACTOR,
    'season_weights': SEASON_WEIGHTS,
}
with open(OUT / 'feature_meta.json', 'w') as f:
    json.dump(feature_meta, f, indent=2)
step(f"Saved feature_meta.json")

print(f"\n{'='*55}")
print(f"  Feature engineering complete!")
print(f"  Output directory: {OUT.absolute()}")
print(f"\n  Files:")
for p in sorted(OUT.iterdir()):
    size = p.stat().st_size
    print(f"    {p.name:35s}  {size/1024:.1f} KB")
print(f"\n  Next step: python predict.py")
print(f"{'='*55}")