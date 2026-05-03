"""
F1 Bulletin — Race Prediction Engine
Bayesian prior + Monte Carlo simulation + XGBoost (when enough data)
Usage:
    python predict.py                          # predict next upcoming race
    python predict.py --season 2026 --round 3  # predict specific race
    python predict.py --season 2026 --round 2 --score  # score past prediction
    python predict.py --dry-run               # print predictions, don't write to DB
Requires:
    features_output/features.parquet  (from feature_engineering.py)
    features_output/elo_ratings.json
    features_output/constructor_strength.json
    features_output/circuit_profiles.json
    features_output/feature_meta.json
"""
from __future__ import annotations
import os, json, warnings, argparse
warnings.filterwarnings('ignore')
import numpy as np
import pandas as pd
from pathlib import Path
from datetime import datetime, timezone
from dotenv import load_dotenv
import psycopg2
from sklearn.linear_model import Ridge
from sklearn.ensemble import RandomForestRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
try:
    import xgboost as xgb
    XGBOOST_AVAILABLE = True
except ImportError:
    XGBOOST_AVAILABLE = False

load_dotenv("../../web/.env.local")
DATABASE_URL = os.environ.get("NEON_DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("NEON_DATABASE_URL not found in web/.env.local")

FEATURES_DIR  = Path("features_output")
MODEL_VERSION = "v4_regulation_aware_mc"
MC_RUNS       = 500
RACES_PER_SEASON = 22

SEASON_WEIGHTS = {
    2021: 0.20, 2022: 0.50, 2023: 0.75, 2024: 0.85, 2025: 0.90, 2026: 1.00,
}
XGB_TRIGGER_RACES = 8

CONSTRUCTOR_2026_DISCOUNT = {
    'Aston Martin': 0.30,
    'Cadillac':     0.50,
    'Alpine':       0.15,
    'Williams':     0.10,
}

FP_SESSION_WEIGHTS = {
    'FP3': 0.50,
    'FP2': 0.35,
    'FP1': 0.15,
}

PU_MANUFACTURERS = {
    'Red Bull Racing': 'Ford',   'Racing Bulls': 'Ford',
    'Ferrari': 'Ferrari',        'Haas F1 Team': 'Ferrari',
    'Mercedes': 'Mercedes',      'Williams': 'Mercedes',   'McLaren': 'Mercedes',
    'Aston Martin': 'Honda',     'Alpine': 'Renault',
    'Kick Sauber': 'Audi',       'Cadillac': 'General Motors',
}
PU_PRIOR = {
    'Ferrari': 0.65, 'Mercedes': 0.70, 'Honda': 0.60,
    'Ford': 0.50,    'Renault': 0.45,  'Audi': 0.40, 'General Motors': 0.35,
}
POINTS_MAP = {1:25, 2:18, 3:15, 4:12, 5:10, 6:8, 7:6, 8:4, 9:2, 10:1}

REGULATION_CONFIG_PATH = Path(__file__).with_name("regulation_eras.json")

def load_regulation_config() -> dict:
    output_path = FEATURES_DIR / "regulation_eras.json"
    path = output_path if output_path.exists() else REGULATION_CONFIG_PATH
    with open(path) as f:
        return json.load(f)

REGULATION_CONFIG = load_regulation_config()

def regulation_profile(season: int) -> dict:
    profile = dict(REGULATION_CONFIG.get("default", {}))
    profile.update(REGULATION_CONFIG.get(str(season), {}))
    return profile

def circuit_energy_demand(circuit: str, circuit_type: str = "permanent") -> float:
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

PIT_LANE_DELTA = {
    'Monaco': 19.0, 'Singapore': 24.0, 'Marina Bay': 24.0,
    'Baku': 18.0,   'Jeddah': 22.0,    'Las Vegas': 17.0,
    'Melbourne': 23.0, 'Shanghai': 23.5, 'Zandvoort': 19.0,
    'Budapest': 20.0,  'default': 21.0,
}
MAX_POSITION_GAIN = 12

RACE_LAPS_BY_CIRCUIT = {
    'Melbourne': 58,
    'Shanghai': 56,
    'Suzuka': 53,
    'Miami': 57,
    'Miami Gardens': 57,
    'Monaco': 78,
    'Monte Carlo': 78,
    'Barcelona': 66,
    'Spielberg': 71,
    'Silverstone': 52,
    'Spa': 44,
    'Spa-Francorchamps': 44,
    'Budapest': 70,
    'Zandvoort': 72,
    'Monza': 53,
    'Baku': 51,
    'Singapore': 62,
    'Marina Bay': 62,
    'Austin': 56,
    'Mexico City': 71,
    'São Paulo': 71,
    'Sao Paulo': 71,
    'Las Vegas': 50,
    'Lusail': 57,
    'Yas Island': 58,
}

PIT_CREW_SPEED = {
    'Red Bull Racing': 2.0, 'Mercedes': 2.2, 'Ferrari': 2.3,
    'McLaren': 2.2, 'Aston Martin': 2.6, 'Alpine': 2.8,
    'Williams': 3.0, 'Racing Bulls': 2.7, 'Kick Sauber': 2.9,
    'Haas F1 Team': 2.8, 'Cadillac': 3.2, 'default': 2.7,
}

def traffic_tyre_factor(position: int) -> float:
    if position <= 3:  return 0.92
    if position <= 5:  return 0.96
    if position <= 10: return 1.00
    if position <= 15: return 1.04
    return 1.08

COMPOUND_DEG = {
    'SOFT':         {'deg_ms_per_lap': 120, 'pace_advantage_ms': 0,   'max_life': 25},
    'MEDIUM':       {'deg_ms_per_lap': 70,  'pace_advantage_ms': 300, 'max_life': 38},
    'HARD':         {'deg_ms_per_lap': 35,  'pace_advantage_ms': 600, 'max_life': 55},
    'INTERMEDIATE': {'deg_ms_per_lap': 80,  'pace_advantage_ms': 0,   'max_life': 35},
    'WET':          {'deg_ms_per_lap': 100, 'pace_advantage_ms': 0,   'max_life': 25},
}

# ── DB helpers ────────────────────────────────────────────────
def get_conn():
    return psycopg2.connect(DATABASE_URL, connect_timeout=30)

def query(sql: str, params=None) -> pd.DataFrame:
    conn = get_conn()
    df = pd.read_sql(sql, conn, params=params)
    conn.close()
    return df

def count_completed_races(season: int) -> int:
    completed = query("""
        SELECT COUNT(DISTINCT s.round)::int AS n
        FROM sessions s
        JOIN results r ON r.session_id = s.id
        WHERE s.season = %s
          AND s.session_type = 'R'
          AND r.finish_position IS NOT NULL
    """, (season,))
    return int(completed.iloc[0]['n']) if not completed.empty else 0

def race_actuals_available(season: int, round_: int) -> bool:
    actuals = query("""
        SELECT 1
        FROM sessions s
        JOIN results r ON r.session_id = s.id
        WHERE s.season = %s
          AND s.round = %s
          AND s.session_type = 'R'
          AND r.finish_position IS NOT NULL
        LIMIT 1
    """, (season, round_))
    return not actuals.empty

def prediction_confidence(season: int, completed_2026_races: int) -> float:
    evidence_ratio = min(max(completed_2026_races / RACES_PER_SEASON, 0.0), 1.0)
    if season >= 2026:
        return min(0.40 + (evidence_ratio ** 0.60) * 0.48, 0.88)
    return min(0.46 + (evidence_ratio ** 0.60) * 0.49, 0.95)

def get_race_distance(season: int, round_: int, circuit: str) -> int:
    try:
        row = query("""
            SELECT race_laps
            FROM race_calendar
            WHERE season = %s AND round = %s
            LIMIT 1
        """, (season, round_))
        if not row.empty and pd.notna(row.iloc[0]['race_laps']):
            return int(row.iloc[0]['race_laps'])
    except Exception:
        pass
    return int(RACE_LAPS_BY_CIRCUIT.get(circuit, 58))

def section(t): print(f"\n{'='*55}\n  {t}\n{'='*55}")
def step(t):    print(f"  → {t}")

# ─────────────────────────────────────────────────────────────
# LOAD ARTIFACTS
# ─────────────────────────────────────────────────────────────
def load_artifacts() -> dict:
    if not FEATURES_DIR.exists():
        raise RuntimeError("features_output/ not found. Run feature_engineering.py first.")
    artifacts = {}
    with open(FEATURES_DIR / 'elo_ratings.json')          as f: artifacts['elo']        = json.load(f)
    with open(FEATURES_DIR / 'constructor_strength.json') as f: artifacts['constructor'] = json.load(f)
    with open(FEATURES_DIR / 'circuit_profiles.json')     as f: artifacts['circuits']    = json.load(f)
    with open(FEATURES_DIR / 'feature_meta.json')         as f: artifacts['meta']        = json.load(f)
    artifacts['regulation_config'] = artifacts['meta'].get('regulation_config', REGULATION_CONFIG)
    for fname, key in [
        ('circuit_elo.json',    'circuit_elo'),
        ('dnf_survival.json',   'dnf_survival'),
        ('tyre_deg_gp.json',    'tyre_deg_gp'),
    ]:
        p = FEATURES_DIR / fname
        artifacts[key] = json.load(open(p)) if p.exists() else {}
    features_path = FEATURES_DIR / 'features.parquet'
    artifacts['features'] = pd.read_parquet(features_path) if features_path.exists() else None
    return artifacts

# ─────────────────────────────────────────────────────────────
# ML MODELS
# ─────────────────────────────────────────────────────────────
RIDGE_FEATURES = [
    'elo_rating', 'grid_position', 'gap_to_pole_sec',
    'rolling_avg_finish', 'rolling_dnf_rate',
    'team_strength', 'pu_strength_adjusted',
    'circuit_affinity', 'sc_probability',
    'overtaking_index', 'tyre_deg_rate',
    'ers_circuit_factor', 'track_temp',
    'sprint_points_last3',   # sprint form signal
    'regulation_era', 'active_aero',
    'energy_demand_index', 'pu_uncertainty',
    'constructor_prior_reliability', 'live_weekend_weight',
    'wet_ers_deploy_factor', 'start_assist_factor',
    # q1_to_q3_ms and q2_to_q3_ms excluded from Ridge —
    # 51% null + weak correlation (0.04) adds noise at this stage.
    # Re-enabled automatically when XGBoost activates at R8 (handles nulls natively).
]

def _training_rows(features_df: pd.DataFrame, target_season: int, target_round: int) -> pd.DataFrame:
    train = features_df[
        (features_df['season'] < target_season) |
        ((features_df['season'] == target_season) & (features_df['round'] < target_round))
    ].copy()
    if target_season >= 2026 and 'season_weight' in train.columns:
        train['season_weight'] = train['season'].map(SEASON_WEIGHTS).fillna(0.5)
        train.loc[train['season'] < 2026, 'season_weight'] *= float(regulation_profile(2026).get('historical_weight_multiplier', 0.55))
        train.loc[train['season'] == 2026, 'season_weight'] *= 2.25
    return train

def _sample_weights(train: pd.DataFrame) -> np.ndarray:
    w = train['season'].map(SEASON_WEIGHTS).fillna(0.5)
    if 'season_weight' in train.columns:
        w = train['season_weight'].fillna(w)
    max_r = train[['season','round']].apply(tuple, axis=1).max()
    rec   = train.apply(
        lambda r: 2.0 if (r['season'], r['round']) >= (max_r[0], max_r[1]-3) else 1.0,
        axis=1,
    )
    return (w * rec).values

def train_ridge(features_df, target_season: int, target_round: int) -> Pipeline | None:
    if features_df is None or len(features_df) < 50:
        return None
    train     = _training_rows(features_df, target_season, target_round)
    if len(train) < 50:
        return None
    available = [f for f in RIDGE_FEATURES if f in train.columns]
    pipe = Pipeline([
        ('imputer', SimpleImputer(strategy='median')),
        ('scaler',  StandardScaler()),
        ('model',   Ridge(alpha=50.0)),
    ])
    pipe.fit(train[available], train['finish_position'], model__sample_weight=_sample_weights(train))
    step(f"  Ridge trained: {len(train)} rows, {len(available)} features")
    return pipe

def train_random_forest(features_df, target_season: int, target_round: int) -> Pipeline | None:
    if features_df is None or len(features_df) < 100:
        step("  Random Forest: insufficient data (<100 rows)")
        return None
    train     = _training_rows(features_df, target_season, target_round)
    if len(train) < 100:
        step("  Random Forest: insufficient eligible training rows (<100)")
        return None
    available = [f for f in RIDGE_FEATURES if f in train.columns]
    pipe = Pipeline([
        ('imputer', SimpleImputer(strategy='median')),
        ('model',   RandomForestRegressor(
            n_estimators=200, max_depth=6,
            min_samples_leaf=10, random_state=42, n_jobs=-1,
        )),
    ])
    pipe.fit(train[available], train['finish_position'], model__sample_weight=_sample_weights(train))
    importances = pipe.named_steps['model'].feature_importances_
    top = sorted(zip(available, importances), key=lambda x: x[1], reverse=True)[:4]
    step(f"  RF trained: {len(train)} rows — top: {', '.join(f+':'+str(round(v,2)) for f,v in top)}")
    return pipe

def predict_ridge(pipe: Pipeline | None, entries: list[dict]) -> dict[str, float] | None:
    if pipe is None:
        return None
    rows      = [{f: e.get(f, np.nan) for f in RIDGE_FEATURES} for e in entries]
    X         = pd.DataFrame(rows)
    available = [f for f in RIDGE_FEATURES if f in X.columns]
    X         = X[available]
    try:
        preds = np.clip(pipe.predict(X), 1, len(entries))
        return {e['driver_code']: float(preds[i]) for i, e in enumerate(entries)}
    except Exception as ex:
        step(f"  Ridge prediction failed: {ex}")
        return None

# XGBoost feature list extends Ridge with q1/q2 features —
# XGBoost handles 51% nulls natively (no imputer distortion)
XGB_EXTRA_FEATURES = ['q1_to_q3_ms', 'q2_to_q3_ms']

def train_xgboost(features_df: pd.DataFrame, n_2026_races: int, target_season: int, target_round: int) -> object | None:
    if not XGBOOST_AVAILABLE:
        step("  XGBoost not installed — run: pip install xgboost")
        return None
    if features_df is None or n_2026_races < XGB_TRIGGER_RACES:
        return None
    train     = _training_rows(features_df, target_season, target_round)
    if len(train) < 100:
        return None
    xgb_features = RIDGE_FEATURES + [f for f in XGB_EXTRA_FEATURES if f not in RIDGE_FEATURES]
    available = [f for f in xgb_features if f in train.columns]
    X         = train[available].copy()
    y         = train['finish_position'].values
    imp       = SimpleImputer(strategy='median')
    X_imp     = imp.fit_transform(X)
    weights   = _sample_weights(train)
    model     = xgb.XGBRegressor(
        n_estimators=300, max_depth=4, learning_rate=0.05,
        subsample=0.8, colsample_bytree=0.8,
        reg_alpha=1.0, reg_lambda=5.0,
        random_state=42, verbosity=0,
    )
    model.fit(X_imp, y, sample_weight=weights)
    model._imputer  = imp
    model._features = available
    step(f"  XGBoost trained: {len(train)} rows, {n_2026_races} 2026 races")
    top5 = sorted(zip(available, model.feature_importances_), key=lambda x: x[1], reverse=True)[:5]
    for feat, imp_val in top5:
        print(f"    {feat:35s}  {imp_val:.4f}")
    return model

def predict_xgboost(model, entries: list[dict]) -> dict[str, float] | None:
    if model is None:
        return None
    try:
        rows  = [{f: e.get(f, np.nan) for f in model._features} for e in entries]
        X     = pd.DataFrame(rows)[model._features]
        X_imp = model._imputer.transform(X)
        preds = np.clip(model.predict(X_imp), 1, len(entries))
        return {e['driver_code']: float(preds[i]) for i, e in enumerate(entries)}
    except Exception as ex:
        step(f"  XGBoost prediction failed: {ex}")
        return None

# ─────────────────────────────────────────────────────────────
# CALIBRATION
# ─────────────────────────────────────────────────────────────
MIN_CALIBRATION_RACES = 10
CALIBRATOR_PATH = FEATURES_DIR / 'calibrator.json'

def fit_calibrator() -> None:
    scored = query("""
        SELECT win_probability, podium_probability, actual_position
        FROM predictions
        WHERE actual_position IS NOT NULL AND season = 2026
        ORDER BY predicted_at
    """)
    if len(scored) < MIN_CALIBRATION_RACES * 5:
        step(f"  Calibration: only {len(scored)} rows, need {MIN_CALIBRATION_RACES*5}. Skipping.")
        return
    from sklearn.isotonic import IsotonicRegression
    y_true_win = (scored['actual_position'] == 1).astype(float).values
    y_prob_win = scored['win_probability'].astype(float).values
    ir_win = IsotonicRegression(out_of_bounds='clip')
    ir_win.fit(y_prob_win, y_true_win)
    y_true_pod = (scored['actual_position'] <= 3).astype(float).values
    y_prob_pod = scored['podium_probability'].astype(float).values
    ir_pod = IsotonicRegression(out_of_bounds='clip')
    ir_pod.fit(y_prob_pod, y_true_pod)
    calib = {
        'win':    {'x': ir_win.X_thresholds_.tolist(), 'y': ir_win.y_thresholds_.tolist()},
        'podium': {'x': ir_pod.X_thresholds_.tolist(), 'y': ir_pod.y_thresholds_.tolist()},
        'n_rows': len(scored),
        'fitted_at': str(pd.Timestamp.now()),
    }
    with open(CALIBRATOR_PATH, 'w') as f:
        json.dump(calib, f, indent=2)
    step(f"  Calibration fitted on {len(scored)} rows")

def load_calibrator() -> dict | None:
    if not CALIBRATOR_PATH.exists():
        return None
    try:
        with open(CALIBRATOR_PATH) as f:
            c = json.load(f)
        return c if c.get('n_rows', 0) >= MIN_CALIBRATION_RACES * 5 else None
    except Exception:
        return None

def apply_calibration(predictions: list[dict], calibrator: dict | None) -> list[dict]:
    if calibrator is None:
        n_d    = len(predictions)
        data_w = predictions[0].get('data_weight_2026', 0.1) if predictions else 0.1
        alpha  = max(0.04, 0.10 - data_w * 0.07)
        mean_win = 1.0 / n_d
        mean_pod = 3.0 / n_d
        for p in predictions:
            p['win_probability']    = round(alpha*mean_win + (1-alpha)*p['win_probability'], 4)
            p['podium_probability'] = round(min(alpha*mean_pod + (1-alpha)*p['podium_probability'], 1.0), 4)
        total = sum(p['win_probability'] for p in predictions)
        if total > 0:
            for p in predictions:
                p['win_probability'] = round(p['win_probability'] / total, 4)
        return predictions
    import numpy as _np
    win_x = _np.array(calibrator['win']['x'])
    win_y = _np.array(calibrator['win']['y'])
    pod_x = _np.array(calibrator['podium']['x'])
    pod_y = _np.array(calibrator['podium']['y'])
    for p in predictions:
        p['win_probability']    = round(float(_np.interp(p['win_probability'],    win_x, win_y)), 4)
        p['podium_probability'] = round(float(_np.interp(p['podium_probability'], pod_x, pod_y)), 4)
    total = sum(p['win_probability'] for p in predictions)
    if total > 0:
        for p in predictions:
            p['win_probability'] = round(p['win_probability'] / total, 4)
    step(f"  Calibration applied ({calibrator['n_rows']} training rows)")
    return predictions

# ─────────────────────────────────────────────────────────────
# CHAMPIONSHIP PROJECTION
# ─────────────────────────────────────────────────────────────
def project_championship(season: int) -> pd.DataFrame | None:
    """
    Project season championship standings.
    Includes both Race (R) and Sprint (S) points — sprint points count
    toward the championship. Gracefully handles seasons with no sprint data.
    """
    actual = query("""
        SELECT r.driver_code, r.team,
               SUM(r.points) AS actual_points,
               COUNT(DISTINCT s.round) AS races_completed
        FROM results r
        JOIN sessions s ON s.id = r.session_id
        WHERE s.season = %s
          AND s.session_type IN ('R', 'S')
        GROUP BY r.driver_code, r.team
        ORDER BY actual_points DESC
    """, (season,))
    if actual.empty:
        return None

    latest_pred = query("""
        SELECT driver_code, win_probability, podium_probability, points_expected
        FROM predictions
        WHERE season=%s
          AND round = (SELECT MAX(round) FROM predictions WHERE season=%s)
        ORDER BY win_probability DESC
    """, (season, season))
    if latest_pred.empty:
        return None

    # Count actual completed race result rounds, not merely scheduled sessions.
    races_done = count_completed_races(season)

    races_remaining = max(0, RACES_PER_SEASON - int(races_done))

    proj = actual.merge(latest_pred[['driver_code','points_expected']], on='driver_code', how='left')
    proj['points_expected'] = proj['points_expected'].fillna(2.0)
    proj['projected_total'] = proj['actual_points'] + proj['points_expected'] * races_remaining
    proj['races_done']      = races_done
    proj['races_remaining'] = races_remaining
    return proj.sort_values('projected_total', ascending=False)

# ─────────────────────────────────────────────────────────────
# DETERMINE TARGET RACE
# ─────────────────────────────────────────────────────────────
def get_target_race(season: int | None, round_: int | None) -> tuple[int, int, str, str]:
    if season and round_:
        row = query("""
            SELECT season, round, gp_name, circuit
            FROM sessions WHERE season=%s AND round=%s AND session_type='R'
        """, (season, round_))
        if not row.empty:
            r = row.iloc[0]
            return int(r['season']), int(r['round']), r['gp_name'], r['circuit']
        import fastf1 as f1
        Path("cache").mkdir(exist_ok=True)
        f1.Cache.enable_cache("cache")
        try:
            event = f1.get_event(season, round_)
            return season, round_, event["EventName"], event.get("Location", "Unknown")
        except Exception as e:
            raise RuntimeError(f"Cannot find race {season} R{round_}: {e}")

    upcoming = query("""
        SELECT s.season, s.round, s.gp_name, s.circuit, s.date
        FROM sessions s
        WHERE s.session_type = 'R' AND s.date > NOW()
        ORDER BY s.date ASC LIMIT 1
    """)
    if not upcoming.empty:
        r = upcoming.iloc[0]
        return int(r['season']), int(r['round']), r['gp_name'], r['circuit']

    latest = query("""
        SELECT season, round, gp_name, circuit
        FROM sessions WHERE session_type='R'
        ORDER BY season DESC, round DESC LIMIT 1
    """)
    if not latest.empty:
        r = latest.iloc[0]
        return int(r['season']), int(r['round']), r['gp_name'], r['circuit']
    raise RuntimeError("No races found in database")

# ─────────────────────────────────────────────────────────────
# GET RACE ENTRY LIST
# ─────────────────────────────────────────────────────────────
def get_entry_list(season: int, round_: int, artifacts: dict) -> list[dict]:
    elo         = artifacts['elo']
    constructor = artifacts['constructor']
    circuits    = artifacts['circuits']
    features_df = artifacts['features']

    quali = query("""
        SELECT q.driver_code, q.grid_position, q.gap_to_pole_ms, q.tyre_compound,
               q.best_ms, q.q1_ms, q.q2_ms, q.q3_ms
        FROM qualifying_laps q
        JOIN sessions s ON s.id = q.session_id
        WHERE s.season=%s AND s.round=%s
        ORDER BY q.grid_position
    """, (season, round_))
    if not quali.empty:
        valid_quali = quali['grid_position'].notna() & quali['best_ms'].notna()
        if int(valid_quali.sum()) < 3:
            step(f"  Ignoring qualifying data: {len(quali)} rows found but grid/times are missing")
            quali = pd.DataFrame()
        else:
            if int(valid_quali.sum()) < len(quali):
                step(f"  Dropping {len(quali) - int(valid_quali.sum())} incomplete qualifying rows")
                quali = quali[valid_quali].copy()
            step(f"  Using qualifying data: {len(quali)} drivers")
    if quali.empty:
        step(f"  No qualifying data for {season} R{round_} — estimating from Elo")

    race_results = query("""
        SELECT DISTINCT r.driver_code, r.team
        FROM results r
        JOIN sessions s ON s.id = r.session_id
        WHERE s.session_type='R' AND s.season=%s AND s.round=%s
        ORDER BY r.driver_code
    """, (season, round_))

    if not race_results.empty:
        latest_results = race_results
        step(f"  Using {season} R{round_} results for driver list")
    elif not quali.empty:
        latest_results = quali[['driver_code']].copy()
        teams = query("""
            SELECT DISTINCT ON (driver_code) driver_code, team
            FROM results r
            JOIN sessions s ON s.id = r.session_id
            WHERE s.session_type='R'
            ORDER BY driver_code, s.season DESC, s.round DESC
        """)
        latest_results = latest_results.merge(teams, on='driver_code', how='left')
        latest_results['team'] = latest_results['team'].fillna('Unknown')
        step(f"  Built driver list from qualifying data ({len(latest_results)} drivers)")
    else:
        latest_results = query("""
            SELECT DISTINCT r.driver_code, r.team
            FROM results r
            JOIN sessions s ON s.id = r.session_id
            WHERE s.session_type = 'R'
              AND s.season = (
                SELECT MAX(season) FROM sessions
                WHERE session_type = 'R' AND date <= NOW()
              )
              AND s.round = (
                SELECT MAX(s2.round) FROM sessions s2
                WHERE s2.season = (
                  SELECT MAX(season) FROM sessions
                  WHERE session_type = 'R' AND date <= NOW()
                )
                AND s2.session_type = 'R'
              )
            ORDER BY r.driver_code
        """)
        step(f"  Using latest {season} race driver list ({len(latest_results)} drivers)")

    circuit_row = query("""
        SELECT circuit FROM sessions
        WHERE season=%s AND round=%s
        ORDER BY CASE session_type WHEN 'R' THEN 1 WHEN 'Q' THEN 2 WHEN 'S' THEN 3 ELSE 4 END
        LIMIT 1
    """, (season, round_))
    circuit = circuit_row.iloc[0]['circuit'] if not circuit_row.empty else 'Unknown'
    cp = circuits.get(circuit, {})
    ctype = cp.get('circuit_type', 'permanent')
    reg = regulation_profile(season)
    energy_demand = cp.get('energy_demand_index', circuit_energy_demand(circuit, ctype))

    wx = query("""
        SELECT AVG(track_temp) as track_temp, BOOL_OR(rainfall) as had_rain
        FROM weather w
        JOIN sessions s ON s.id = w.session_id
        WHERE s.circuit = %s AND s.session_type='R'
    """, (circuit,))
    avg_track_temp = float(wx.iloc[0]['track_temp']) if not wx.empty and wx.iloc[0]['track_temp'] else 32.0
    had_rain       = bool(wx.iloc[0]['had_rain']) if not wx.empty else False

    fp_data = query("""
        SELECT pl.driver_code, pl.fp_session, pl.median_lap_ms, pl.best_lap_ms
        FROM practice_laps pl
        JOIN sessions s ON s.id = pl.session_id
        WHERE s.season=%s AND s.round=%s
    """, (season, round_))

    fp_pace: dict[str, float] = {}
    if not fp_data.empty:
        for fp_name, fp_w in FP_SESSION_WEIGHTS.items():
            fp_session_data = fp_data[fp_data['fp_session'] == fp_name].dropna(subset=['median_lap_ms'])
            if fp_session_data.empty:
                continue
            fp_best = fp_session_data['median_lap_ms'].min()
            for _, row in fp_session_data.iterrows():
                d       = row['driver_code']
                gap_ms  = float(row['median_lap_ms']) - float(fp_best)
                adj     = -min(gap_ms / 5000.0, 0.2) * fp_w
                fp_pace[d] = fp_pace.get(d, 0.0) + adj
        if fp_pace:
            step(f"  FP pace signal: {len(fp_pace)} drivers ({fp_data['fp_session'].nunique()} sessions)")

    # Sprint points lookup — used as entry-level feature signal
    # Fetch last 3 rounds' sprint results per driver before this round
    sprint_pts_map: dict[str, float] = {}
    sprint_recent = query("""
        SELECT r.driver_code, SUM(r.points) AS sprint_pts
        FROM results r
        JOIN sessions s ON s.id = r.session_id
        WHERE s.season = %s
          AND s.session_type = 'S'
          AND s.round <= %s
        GROUP BY r.driver_code
    """, (season, round_))
    if not sprint_recent.empty:
        for _, row in sprint_recent.iterrows():
            sprint_pts_map[row['driver_code']] = float(row['sprint_pts'])
        step(f"  Sprint points loaded for {len(sprint_pts_map)} drivers")
    else:
        step("  No sprint points yet for this season")

    n_2026_races = count_completed_races(2026)
    confidence = prediction_confidence(season, n_2026_races)

    entries = []
    all_drivers = latest_results['driver_code'].tolist() if not latest_results.empty else []

    for i, driver in enumerate(all_drivers):
        team_row = latest_results[latest_results['driver_code']==driver]
        team     = team_row.iloc[0]['team'] if not team_row.empty else 'Unknown'

        q_row = quali[quali['driver_code']==driver] if not quali.empty else pd.DataFrame()
        if not q_row.empty:
            qr             = q_row.iloc[0]
            grid_pos       = int(qr['grid_position']) if pd.notna(qr.get('grid_position')) else i+1
            gap_to_pole    = float(qr['gap_to_pole_ms']) / 1000 if pd.notna(qr.get('gap_to_pole_ms')) else (i * 0.3)
            start_compound = qr.get('tyre_compound') or 'SOFT'
        else:
            grid_pos       = i + 1
            gap_to_pole    = i * 0.22
            start_compound = 'SOFT'

        # Q1→Q3 and Q2→Q3 improvement (negative = got faster = better)
        # Drivers who extract more pace through Q sessions show real speed
        if not q_row.empty:
            q1ms     = float(qr['q1_ms']) if pd.notna(qr.get('q1_ms')) else None
            q2ms     = float(qr['q2_ms']) if pd.notna(qr.get('q2_ms')) else None
            q3ms     = float(qr['q3_ms']) if pd.notna(qr.get('q3_ms')) else None
            q1_to_q3 = (q3ms - q1ms) if q1ms and q3ms else np.nan
            q2_to_q3 = (q3ms - q2ms) if q2ms and q3ms else np.nan
        else:
            q1_to_q3 = np.nan
            q2_to_q3 = np.nan

        celo_map        = artifacts.get('circuit_elo', {})
        celo_val        = celo_map.get(f"{driver}|{circuit}", elo.get(driver, 1400))
        blended_elo_val = 0.70 * elo.get(driver, 1400) + 0.30 * celo_val

        dnf_surv = artifacts.get('dnf_survival', {}).get(driver, {'dnf_rate':0.10,'shape':0.8,'scale':60.0})

        driver_hist = features_df[
            (features_df['driver_code']==driver) &
            (features_df['season'] < 2026)
        ].tail(3) if features_df is not None else pd.DataFrame()

        rolling_avg = driver_hist['finish_position'].mean() if not driver_hist.empty else 10.5
        rolling_dnf = driver_hist['is_dnf'].mean()          if not driver_hist.empty else 0.10
        circuit_aff = driver_hist[
            driver_hist.get('circuit', pd.Series()) == circuit
        ]['finish_position'].mean() if (
            not driver_hist.empty and 'circuit' in driver_hist.columns
        ) else rolling_avg

        # Sprint points as a form signal — drivers with sprint points have proven
        # recent pace regardless of race finishes
        sprint_pts = sprint_pts_map.get(driver, 0.0)
        uncertainty = pu_uncertainty(team, season)
        ers_circuit_factor = (
            min(1.0, 0.35 + float(energy_demand) * 0.65)
            if reg.get('active_aero') else
            {'street': 0.75, 'street_hybrid': 0.60, 'permanent': 0.45}.get(ctype, 0.50)
        )
        pu_strength_adjusted = PU_PRIOR.get(PU_MANUFACTURERS.get(team, 'Unknown'), 0.50)
        pu_strength_adjusted = pu_strength_adjusted * (1 - ers_circuit_factor * 0.15) * (1 - uncertainty * 0.20)

        entries.append({
            'driver_code':        driver,
            'team':               team,
            'grid_position':      grid_pos,
            'gap_to_pole_sec':    gap_to_pole,
            'start_compound':     start_compound,
            'fp_pace_adj':        fp_pace.get(driver, 0.0),
            'elo_rating':         blended_elo_val,
            'circuit_elo':        celo_val,
            'dnf_shape':          float(dnf_surv.get('shape', 0.8)),
            'dnf_scale':          float(dnf_surv.get('scale', 60.0)),
            'team_strength':      constructor.get(team, 10.5),
            'pu_manufacturer':    PU_MANUFACTURERS.get(team, 'Unknown'),
            'pu_strength':        PU_PRIOR.get(PU_MANUFACTURERS.get(team, 'Unknown'), 0.50),
            'pu_strength_adjusted': pu_strength_adjusted,
            'rolling_avg_finish': rolling_avg,
            'rolling_dnf_rate':   rolling_dnf,
            'circuit_affinity':   circuit_aff,
            'sprint_points_last3': sprint_pts,  # sprint form signal
            'q1_to_q3_ms':         q1_to_q3,   # Q1→Q3 improvement
            'q2_to_q3_ms':         q2_to_q3,   # Q2→Q3 improvement
            'sc_probability':     cp.get('sc_probability', 0.35),
            'overtaking_index':   cp.get('overtaking_index', 0.30),
            'arw_effectiveness':  cp.get('arw_effectiveness', 0.255),
            'tyre_deg_rate':      cp.get('tyre_deg_soft_ms_per_lap', 80.0),
            'avg_pit_stops':      cp.get('avg_pit_stops', 2.0),
            'ers_circuit_factor': ers_circuit_factor,
            'regulation_era':     int(reg.get('regulation_era', 0)),
            'active_aero':        int(bool(reg.get('active_aero', False))),
            'ers_power_kw':       float(reg.get('ers_power_kw', 120)),
            'recharge_limit_mj':  float(reg.get('recharge_limit_mj', 8.5)),
            'race_boost_cap_kw':  float(reg.get('race_boost_cap_kw', 120)),
            'wet_ers_deploy_factor': float(reg.get('wet_ers_deploy_factor', 1.0)),
            'start_assist_factor': float(reg.get('start_assist_factor', 0.0)),
            'constructor_prior_reliability': float(reg.get('constructor_prior_reliability', 1.0)),
            'live_weekend_weight': float(reg.get('live_weekend_weight', 0.35)),
            'energy_demand_index': float(energy_demand),
            'pu_uncertainty':     uncertainty,
            'track_temp':         avg_track_temp,
            'had_rain':           had_rain,
            'circuit':            circuit,
            'confidence':         confidence,
        })

    if not quali.empty:
        entries.sort(key=lambda x: x['grid_position'])
    else:
        entries.sort(key=lambda x: x['elo_rating'], reverse=True)
        for i, e in enumerate(entries):
            e['grid_position']   = i + 1
            e['gap_to_pole_sec'] = i * 0.22

    return entries

# ─────────────────────────────────────────────────────────────
# BAYESIAN PRIOR
# ─────────────────────────────────────────────────────────────
def bayesian_prior(entries: list[dict]) -> dict[str, float]:
    scores        = {}
    overtaking_idx = entries[0].get('overtaking_index', 0.30) if entries else 0.30
    reg_era = entries[0].get('regulation_era', 0) if entries else 0
    live_w  = entries[0].get('live_weekend_weight', 0.35) if entries else 0.35
    reliability = entries[0].get('constructor_prior_reliability', 1.0) if entries else 1.0
    grid_w    = 0.35 + (1 - overtaking_idx) * 0.15
    elo_w     = 0.20 - (1 - overtaking_idx) * 0.05
    team_w    = 0.15
    gap_w     = 0.15
    circuit_w = 0.10
    pu_w      = 0.05
    if reg_era >= 1:
        grid_w = 0.30 + live_w * 0.20
        gap_w  = 0.20 + live_w * 0.12
        elo_w  = max(0.06, elo_w * 0.55)
        team_w = team_w * reliability
        pu_w   = pu_w * reliability

    for e in entries:
        n = len(entries)
        grid_score    = 1 - (e['grid_position'] - 1) / max(n - 1, 1)
        elo_score     = max(0, min(1, (e['elo_rating'] - 1300) / 400))
        team_score    = max(0, min(1, 1 - (e['team_strength'] - 1) / max(20 - 1, 1)))
        gap_score     = 1 - min(e['gap_to_pole_sec'] / 5.0, 1)
        circuit_score = max(0, min(1, 1 - (e['circuit_affinity'] - 1) / max(n - 1, 1)))
        pu_score      = e.get('pu_strength_adjusted', e['pu_strength'])

        team = e.get('team', '')
        extra_discount = CONSTRUCTOR_2026_DISCOUNT.get(team, 0.0)
        if extra_discount > 0:
            team_score = team_score * (1 - extra_discount)
            pu_score   = pu_score   * (1 - extra_discount * 0.5)

        fp_pace_adj        = e.get('fp_pace_adj', 0.0)
        adjusted_gap_score = max(0, min(1, gap_score + fp_pace_adj))
        if e.get('had_rain') and e.get('regulation_era', 0) >= 1:
            adjusted_gap_score *= e.get('wet_ers_deploy_factor', 0.62)

        composite = (
            grid_w    * grid_score        +
            elo_w     * elo_score         +
            team_w    * team_score        +
            gap_w     * adjusted_gap_score +
            circuit_w * circuit_score     +
            pu_w      * pu_score
        )
        scores[e['driver_code']] = composite

    total  = sum(np.exp(s * 5) for s in scores.values())
    priors = {d: np.exp(s * 5) / total for d, s in scores.items()}
    return priors

# ─────────────────────────────────────────────────────────────
# MONTE CARLO RACE SIMULATION
# ─────────────────────────────────────────────────────────────
def simulate_race(entries: list[dict], race_distance: int = 58, artifacts: dict | None = None) -> dict[str, list[int]]:
    n = len(entries)
    if n == 0:
        return {}

    results       = {e['driver_code']: [] for e in entries}
    circuit       = entries[0].get('circuit', 'default')
    pit_delta_sec = PIT_LANE_DELTA.get(circuit, PIT_LANE_DELTA['default'])
    avg_lap_sec   = 90.0
    pit_pos_loss  = pit_delta_sec / avg_lap_sec * n * 0.3
    reg_era       = entries[0].get('regulation_era', 0)
    active_aero   = bool(entries[0].get('active_aero', 0))
    energy_demand = float(entries[0].get('energy_demand_index', 0.6))
    wet_factor    = float(entries[0].get('wet_ers_deploy_factor', 1.0)) if entries[0].get('had_rain') else 1.0

    for run in range(MC_RUNS):
        positions = {e['driver_code']: float(e['grid_position']) for e in entries}
        start_pos = {e['driver_code']: e['grid_position'] for e in entries}
        retired      = set()
        pace_ms      = {}
        tyre_age     = {e['driver_code']: 0 for e in entries}
        tyre_type    = {e['driver_code']: e['start_compound'] for e in entries}
        pit_count    = {e['driver_code']: 0 for e in entries}
        sc_active    = False
        sc_laps_left = 0
        sc_count     = 0

        for e in entries:
            elo_adj = (1500 - e['elo_rating']) * 0.05
            era_noise = 120 + (80 * reg_era) + (70 * energy_demand if active_aero else 0)
            noise   = np.random.normal(0, era_noise)
            energy_penalty = energy_demand * max(e['grid_position'] - 1, 0) * 4 if active_aero else 0
            pace_ms[e['driver_code']] = e['gap_to_pole_sec'] * 1000 + elo_adj + energy_penalty + noise

        lap1_risk = {e['driver_code']: (
            0.01 if e['grid_position'] <= 3 else
            0.03 if e['grid_position'] <= 10 else
            0.06
        ) for e in entries}
        for e in entries:
            d = e['driver_code']
            assisted_lap1_risk = lap1_risk[d] * (1 - e.get('start_assist_factor', 0.0) * 0.35)
            if np.random.random() < assisted_lap1_risk:
                if np.random.random() < 0.3:
                    retired.add(d)
                else:
                    positions[d] = min(int(positions[d]) + np.random.randint(2, 6), n)

        for lap in range(1, race_distance + 1):
            if not sc_active and sc_count < 3:
                if np.random.random() < entries[0]['sc_probability'] / race_distance:
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
                e           = next(x for x in entries if x['driver_code'] == d)
                current_pos = i + 1
                tyre_age[d] += 1

                shape   = e.get('dnf_shape', 0.8)
                scale   = e.get('dnf_scale', 60.0)
                s_prev  = np.exp(-((max(lap-1,0)/scale)**shape))
                s_now   = np.exp(-((lap/scale)**shape))
                if np.random.random() < max(0.0, s_prev - s_now):
                    retired.add(d)
                    continue

                compound  = tyre_type[d]
                comp_data = COMPOUND_DEG.get(compound, COMPOUND_DEG['MEDIUM'])
                max_life  = comp_data['max_life']
                traffic_f = traffic_tyre_factor(current_pos)
                effective_age = tyre_age[d] * traffic_f

                avg_pits      = e['avg_pit_stops']
                pit_threshold = max_life * (0.82 + np.random.normal(0, 0.08))
                laps_remaining = race_distance - lap

                undercut_threat = False
                if i < len(pos_sorted) - 1:
                    car_behind = pos_sorted[i + 1]
                    behind_e   = next(x for x in entries if x['driver_code'] == car_behind)
                    if (pace_ms[car_behind] < pace_ms[d] - 300 and
                            tyre_age[car_behind] < tyre_age[d] * 0.7):
                        undercut_threat = True

                should_pit = (
                    (effective_age >= pit_threshold or undercut_threat) and
                    pit_count[d] < int(avg_pits + 1) and
                    laps_remaining > 8 and
                    not sc_active
                ) or (
                    effective_age > max_life * 1.15 and laps_remaining > 3
                )

                if should_pit:
                    pit_count[d] += 1
                    tyre_age[d]   = 0
                    if compound == 'SOFT':
                        tyre_type[d] = 'MEDIUM'
                    elif compound == 'MEDIUM':
                        tyre_type[d] = 'HARD' if laps_remaining > 20 else 'SOFT'
                    else:
                        tyre_type[d] = 'MEDIUM'
                    crew_speed   = PIT_CREW_SPEED.get(e['team'], PIT_CREW_SPEED['default'])
                    pit_variance = np.random.normal(crew_speed, 0.3)
                    pos_loss     = int(round(pit_pos_loss * (pit_variance / 2.5)))
                    positions[d] = min(positions[d] + max(1, pos_loss), n)

                gp_data    = (artifacts or {}).get('tyre_deg_gp', {}).get(e.get('circuit',''), {}).get(compound, None)
                if gp_data and effective_age > 0:
                    deg_factor = gp_data.get('quad',0)*effective_age**2 + gp_data.get('linear', comp_data['deg_ms_per_lap'])*effective_age
                else:
                    deg_factor = comp_data['deg_ms_per_lap'] * effective_age

                fuel_benefit   = (race_distance - lap) * 28
                effective_pace = pace_ms[d] + deg_factor - fuel_benefit
                if sc_active:
                    effective_pace = np.random.normal(0, 50)

                pos_overtake_factor = (
                    0.4 if current_pos <= 3 else
                    0.7 if current_pos <= 8 else
                    1.0 if current_pos <= 15 else
                    1.4
                )
                active_aero_factor = 1.0
                if e.get('active_aero'):
                    active_aero_factor = 0.88 + e.get('energy_demand_index', 0.6) * 0.45
                    active_aero_factor *= wet_factor
                base_overtake = e['arw_effectiveness'] * 0.15 * pos_overtake_factor * active_aero_factor
                for j, other in enumerate(pos_sorted):
                    if other == d or other in retired:
                        continue
                    if positions[d] > positions[other]:
                        other_pace = (
                            pace_ms[other] +
                            COMPOUND_DEG.get(tyre_type[other], COMPOUND_DEG['MEDIUM'])['deg_ms_per_lap'] * tyre_age[other]
                        )
                        if effective_pace - other_pace < -150 and np.random.random() < base_overtake:
                            positions[d]     -= 1
                            positions[other] += 1

        active = [d for d in positions if d not in retired]
        active.sort(key=lambda d: positions[d])
        final_order = []
        for d in active:
            gained = start_pos[d] - (active.index(d) + 1)
            capped = start_pos[d] - MAX_POSITION_GAIN if gained > MAX_POSITION_GAIN else active.index(d) + 1
            final_order.append((d, capped))
        final_order.sort(key=lambda x: x[1])
        retired_list = list(retired)
        ordered      = [d for d, _ in final_order] + retired_list
        for pos, driver in enumerate(ordered, 1):
            results[driver].append(pos)

    return results

# ─────────────────────────────────────────────────────────────
# COMPUTE PREDICTIONS
# ─────────────────────────────────────────────────────────────
def compute_predictions(
    entries:     list[dict],
    sim_results: dict[str, list[int]],
    priors:      dict[str, float],
    season:      int,
    round_:      int,
    gp_name:     str,
    ridge_preds: dict[str, float] | None = None,
    rf_preds:    dict[str, float] | None = None,
) -> list[dict]:
    n_2026       = count_completed_races(2026)
    reg_era      = entries[0].get('regulation_era', 0) if entries else 0
    live_w       = entries[0].get('live_weekend_weight', 0.35) if entries else 0.35
    data_weight  = min(n_2026 / 10.0, 0.9)
    if season >= 2026 and reg_era >= 1:
        prior_weight = max(0.38 - data_weight * 0.20, 0.16)
        ridge_weight_pos = 0.12 if ridge_preds else 0.0
        rf_weight_pos    = 0.06 if rf_preds    else 0.0
        live_boost       = min(live_w * 0.10, 0.08)
        mc_weight_pos    = 1.0 - ridge_weight_pos - rf_weight_pos + live_boost
    else:
        prior_weight = max(0.45 - data_weight * 0.25, 0.15)  # 0.45 at R1 → reduces as 2026 data grows
        ridge_weight_pos = 0.20 if ridge_preds else 0.0
        rf_weight_pos    = 0.10 if rf_preds    else 0.0
        mc_weight_pos    = 1.0 - ridge_weight_pos - rf_weight_pos  # 0.70
    mc_weight    = 1.0 - prior_weight
    pos_total     = mc_weight_pos + ridge_weight_pos + rf_weight_pos
    mc_weight_pos, ridge_weight_pos, rf_weight_pos = (
        mc_weight_pos / pos_total,
        ridge_weight_pos / pos_total,
        rf_weight_pos / pos_total,
    )

    n           = len(entries)
    predictions = []

    for e in entries:
        d    = e['driver_code']
        sims = sim_results.get(d, [])
        if not sims:
            continue
        arr = np.array(sims)

        win_prob    = float((arr == 1).mean())
        podium_prob = float((arr <= 3).mean())
        median_pos  = int(np.median(arr))
        points_exp  = float(np.mean([POINTS_MAP.get(p, 0) for p in sims]))

        ridge_pos      = ridge_preds.get(d, median_pos) if ridge_preds else median_pos
        rf_pos         = rf_preds.get(d, median_pos)    if rf_preds    else median_pos
        blended_median = round(mc_weight_pos*median_pos + ridge_weight_pos*ridge_pos + rf_weight_pos*rf_pos)

        blended_win = mc_weight * win_prob + prior_weight * priors.get(d, 1/n)
        blended_pod = mc_weight * podium_prob + prior_weight * min(priors.get(d, 1/n) * 3, 1.0)

        grid_expected_win = max(0.001, 1 - (e['grid_position'] - 1) * 0.08)
        upset_ratio = blended_win / grid_expected_win
        is_upset    = (
            e['grid_position'] >= 5 and
            blended_win >= 0.08 and
            upset_ratio >= 2.0
        )
        upset_score = round(upset_ratio - 1, 3) if is_upset else 0

        predictions.append({
            'season':             season,
            'round':              round_,
            'gp_name':            gp_name,
            'circuit':            e['circuit'],
            'driver_code':        d,
            'team':               e['team'],
            'predicted_position': int(blended_median) if ridge_preds else median_pos,
            'win_probability':    round(blended_win, 4),
            'podium_probability': round(blended_pod, 4),
            'points_expected':    round(points_exp, 2),
            'confidence':         round(e['confidence'], 3),
            'model_version':      MODEL_VERSION,
            'simulation_runs':    MC_RUNS,
            'data_weight_2026':   round(data_weight, 3),
            'training_seasons':   ','.join(str(s) for s in sorted(SEASON_WEIGHTS.keys()) if s < season or s == season),
            'elo_rating':         round(e['elo_rating'], 1),
            'grid_position':      e['grid_position'],
            'gap_to_pole_ms':     int(e['gap_to_pole_sec'] * 1000),
            'rolling_avg_finish': round(e['rolling_avg_finish'], 2),
            'is_upset_pick':      is_upset,
            'upset_score':        round(float(upset_score), 3),
        })

    total_win = sum(p['win_probability'] for p in predictions)
    if total_win > 0:
        for p in predictions:
            p['win_probability']    = round(p['win_probability'] / total_win, 4)
            p['podium_probability'] = round(min(p['podium_probability'], 1.0), 4)

    predictions.sort(key=lambda x: x['win_probability'], reverse=True)

    # Monotonic smoothing
    for i in range(1, len(predictions)):
        if predictions[i]['win_probability'] > predictions[i-1]['win_probability']:
            avg = (predictions[i]['win_probability'] + predictions[i-1]['win_probability']) / 2
            predictions[i-1]['win_probability'] = round(avg + 0.001, 4)
            predictions[i]['win_probability']   = round(avg - 0.001, 4)
    for i in range(1, len(predictions)):
        if predictions[i]['podium_probability'] > predictions[i-1]['podium_probability'] * 1.05:
            avg = (predictions[i]['podium_probability'] + predictions[i-1]['podium_probability']) / 2
            predictions[i-1]['podium_probability'] = round(avg + 0.001, 4)
            predictions[i]['podium_probability']   = round(avg - 0.001, 4)

    total = sum(p['win_probability'] for p in predictions)
    if total > 0:
        for p in predictions:
            p['win_probability'] = round(p['win_probability'] / total, 4)

    # Overwrite predicted_position with win-probability rank (1 = favourite).
    # This ensures position_error = predicted_rank - actual_position, which is
    # meaningful (ANT P1 win-prob favourite, finishes P1 → error = 0).
    # The Ridge/MC blended median is kept internally but not stored as predicted_position.
    for rank, p in enumerate(predictions, 1):
        p['predicted_position'] = rank

    return predictions

# ─────────────────────────────────────────────────────────────
# WRITE TO NEON
# ─────────────────────────────────────────────────────────────
def write_predictions(predictions: list[dict]) -> None:
    conn = get_conn()
    cur  = conn.cursor()
    for p in predictions:
        def f(v): return float(v) if v is not None else None
        def i(v): return int(v)   if v is not None else None
        cur.execute("""
            INSERT INTO predictions (
                season, round, gp_name, circuit, driver_code, team,
                predicted_position, win_probability, podium_probability, points_expected,
                confidence, model_version, simulation_runs, data_weight_2026, training_seasons,
                elo_rating, grid_position, gap_to_pole_ms, rolling_avg_finish,
                is_upset_pick, upset_score, predicted_at
            ) VALUES (
                %s,%s,%s,%s,%s,%s,
                %s,%s,%s,%s,
                %s,%s,%s,%s,%s,
                %s,%s,%s,%s,
                %s,%s, NOW()
            )
            ON CONFLICT (season, round, driver_code, model_version)
            DO UPDATE SET
                gp_name             = EXCLUDED.gp_name,
                circuit             = EXCLUDED.circuit,
                team                = EXCLUDED.team,
                predicted_position  = EXCLUDED.predicted_position,
                win_probability     = EXCLUDED.win_probability,
                podium_probability  = EXCLUDED.podium_probability,
                points_expected     = EXCLUDED.points_expected,
                confidence          = EXCLUDED.confidence,
                simulation_runs     = EXCLUDED.simulation_runs,
                data_weight_2026    = EXCLUDED.data_weight_2026,
                training_seasons    = EXCLUDED.training_seasons,
                elo_rating          = EXCLUDED.elo_rating,
                grid_position       = EXCLUDED.grid_position,
                gap_to_pole_ms      = EXCLUDED.gap_to_pole_ms,
                rolling_avg_finish  = EXCLUDED.rolling_avg_finish,
                is_upset_pick       = EXCLUDED.is_upset_pick,
                upset_score         = EXCLUDED.upset_score,
                position_error      = CASE
                    WHEN predictions.actual_position IS NOT NULL
                    THEN EXCLUDED.predicted_position - predictions.actual_position
                    ELSE predictions.position_error
                END,
                predicted_at        = NOW(),
                updated_at          = NOW()
        """, (
            i(p['season']), i(p['round']), p['gp_name'], p['circuit'],
            p['driver_code'], p['team'],
            i(p['predicted_position']), f(p['win_probability']),
            f(p['podium_probability']), f(p['points_expected']),
            f(p['confidence']), p['model_version'], i(p['simulation_runs']),
            f(p['data_weight_2026']), p['training_seasons'],
            f(p['elo_rating']), i(p['grid_position']), i(p['gap_to_pole_ms']),
            f(p['rolling_avg_finish']), bool(p['is_upset_pick']), f(p['upset_score']),
        ))
    conn.commit()
    cur.close()
    conn.close()
    step(f"Wrote {len(predictions)} predictions to Neon")

# ─────────────────────────────────────────────────────────────
# SCORE PAST PREDICTION
# ─────────────────────────────────────────────────────────────
def score_prediction(season: int, round_: int) -> None:
    section(f"Scoring {season} R{round_}")
    version_row = query("""
        SELECT model_version FROM predictions
        WHERE season=%s AND round=%s
        ORDER BY predicted_at DESC LIMIT 1
    """, (season, round_))
    score_model_version = version_row.iloc[0]['model_version'] if not version_row.empty else MODEL_VERSION

    preds = query("""
        SELECT driver_code, predicted_position, win_probability, podium_probability
        FROM predictions
        WHERE season=%s AND round=%s AND model_version=%s
        ORDER BY win_probability DESC
    """, (season, round_, score_model_version))
    actuals = query("""
        SELECT r.driver_code, r.finish_position, r.points
        FROM results r
        JOIN sessions s ON s.id = r.session_id
        WHERE s.season=%s AND s.round=%s AND s.session_type='R'
    """, (season, round_))
    if preds.empty or actuals.empty:
        print("  No predictions or actuals found")
        return

    merged = preds.merge(actuals, on='driver_code', how='inner')
    if merged.empty:
        print("  Cannot merge predictions with actuals")
        return

    conn = get_conn()
    cur  = conn.cursor()
    for _, row in merged.iterrows():
        cur.execute("""
            UPDATE predictions
            SET actual_position = %s, actual_points = %s, position_error = %s, updated_at = NOW()
            WHERE season=%s AND round=%s AND driver_code=%s AND model_version=%s
        """, (
            int(row['finish_position']), float(row['points']),
            int(row['predicted_position']) - int(row['finish_position']),
            season, round_, row['driver_code'], score_model_version,
        ))
    conn.commit()

    mae           = float((merged['predicted_position'] - merged['finish_position']).abs().mean())
    actual_winner = actuals[actuals['finish_position']==1]['driver_code'].iloc[0] if not actuals.empty else None
    pred_winner   = preds.iloc[0]['driver_code'] if not preds.empty else None
    winner_correct = actual_winner == pred_winner
    actual_podium = set(actuals[actuals['finish_position']<=3]['driver_code'].tolist())
    pred_podium   = set(preds.head(3)['driver_code'].tolist())
    podium_hits   = len(actual_podium & pred_podium)
    actual_top5   = set(actuals[actuals['finish_position']<=5]['driver_code'].tolist())
    pred_top5     = set(preds.head(5)['driver_code'].tolist())
    top5_hits     = len(actual_top5 & pred_top5)
    merged['actual_win'] = (merged['finish_position'] == 1).astype(float)
    brier = float(((merged['win_probability'] - merged['actual_win'])**2).mean())

    cur.execute("""
        INSERT INTO prediction_accuracy
            (season, round, model_version, mae_position, winner_correct,
             podium_hits, top5_hits, brier_score)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
        ON CONFLICT (season, round, model_version) DO UPDATE SET
            mae_position   = EXCLUDED.mae_position,
            winner_correct = EXCLUDED.winner_correct,
            podium_hits    = EXCLUDED.podium_hits,
            top5_hits      = EXCLUDED.top5_hits,
            brier_score    = EXCLUDED.brier_score,
            evaluated_at   = NOW()
    """, (season, round_, score_model_version, mae, winner_correct, podium_hits, top5_hits, brier))
    conn.commit()
    cur.close()
    conn.close()

    print(f"\n  Accuracy for {season} R{round_}:")
    print(f"    MAE position:    {mae:.2f}")
    print(f"    Winner correct:  {'✓' if winner_correct else '✗'} (predicted {pred_winner}, actual {actual_winner})")
    print(f"    Podium hits:     {podium_hits}/3")
    print(f"    Top 5 hits:      {top5_hits}/5")
    print(f"    Brier score:     {brier:.4f}")

# ─────────────────────────────────────────────────────────────
# PRINT PREDICTIONS
# ─────────────────────────────────────────────────────────────
def print_predictions(predictions: list[dict], gp_name: str) -> None:
    print(f"\n  {'─'*60}")
    print(f"  RACE PREDICTIONS: {gp_name}")
    print(f"  Model: {MODEL_VERSION}  |  {MC_RUNS} MC sims  |  Confidence: {predictions[0]['confidence']:.0%}")
    print(f"  {'─'*60}")
    print(f"  {'POS':4} {'DRV':6} {'TEAM':22} {'WIN%':6} {'POD%':6} {'EXP PTS':8} {'GRID':5} {'UPSET'}")
    print(f"  {'─'*60}")
    for i, p in enumerate(predictions[:10]):
        upset = '⚡ UPSET PICK' if p['is_upset_pick'] else ''
        print(f"  {i+1:4} {p['driver_code']:6} {p['team']:22} "
              f"{p['win_probability']*100:5.1f}% "
              f"{p['podium_probability']*100:5.1f}% "
              f"{p['points_expected']:7.1f}  "
              f"P{p['grid_position']:2}   {upset}")
    print(f"  {'─'*60}")
    upsets = [p for p in predictions if p['is_upset_pick']]
    if upsets:
        print(f"\n  ⚡ UPSET ALERTS:")
        for u in upsets:
            print(f"    {u['driver_code']} (P{u['grid_position']} grid) → {u['win_probability']*100:.1f}% win probability")
    print(f"\n  ⚠️  Confidence: {predictions[0]['confidence']:.0%} "
          f"(grows each race as 2026 data accumulates)")

# ─────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="F1 Race Prediction Engine")
    parser.add_argument("--season",         type=int, default=None)
    parser.add_argument("--round",          type=int, default=None, dest='round_')
    parser.add_argument("--score",          action="store_true")
    parser.add_argument("--dry-run",        action="store_true")
    parser.add_argument("--fit-calibrator", action="store_true")
    args = parser.parse_args()

    if args.fit_calibrator:
        step("Fitting calibration curves...")
        fit_calibrator()
        return

    if args.score:
        if not args.season or not args.round_:
            raise ValueError("--score requires --season and --round")
        score_prediction(args.season, args.round_)
        return

    section("F1 Race Prediction Engine")
    step("Loading feature artifacts...")
    artifacts = load_artifacts()
    meta      = artifacts['meta']
    step(f"Training seasons: {meta.get('train_seasons', 'unknown')}")
    step(f"Sprint races in features: {meta.get('sprint_races_found', 'unknown')}")

    season, round_, gp_name, circuit = get_target_race(args.season, args.round_)
    step(f"Target: {season} R{round_} — {gp_name} ({circuit})")

    n_2026_races = count_completed_races(2026)
    step(f"2026 races in DB: {n_2026_races} / {XGB_TRIGGER_RACES} needed for XGBoost")

    if XGBOOST_AVAILABLE and n_2026_races >= XGB_TRIGGER_RACES:
        step(f"Training XGBoost...")
        ml_model = train_xgboost(artifacts['features'], n_2026_races, season, round_)
        ml_type  = 'xgboost'
    else:
        step(f"Training Ridge (XGBoost activates at R{XGB_TRIGGER_RACES})...")
        ml_model = train_ridge(artifacts['features'], season, round_)
        ml_type  = 'ridge'

    global MODEL_VERSION
    MODEL_VERSION = f"v4_regaware_{'xgb' if ml_type == 'xgboost' else 'ridge'}_mc"

    step("Building entry list...")
    entries = get_entry_list(season, round_, artifacts)
    step(f"  {len(entries)} drivers in entry list")
    if len(entries) == 0:
        print("  ✗ No drivers found. Load qualifying data first:")
        print("    python load_fastf1_v3.py --seasons 2026 --quali-only")
        return

    if ml_type == 'xgboost':
        ridge_preds = predict_xgboost(ml_model, entries)
    else:
        ridge_preds = predict_ridge(ml_model, entries)
    if ridge_preds:
        step(f"  {ml_type.capitalize()} predictions computed for {len(ridge_preds)} drivers")

    step("Training Random Forest ensemble...")
    rf_pipe  = train_random_forest(artifacts['features'], season, round_)
    rf_preds = predict_ridge(rf_pipe, entries) if rf_pipe else None
    if rf_preds:
        step(f"  Random Forest predictions computed")

    calibrator = load_calibrator()

    step("Projecting championship standings...")
    champ = project_championship(season)
    if champ is not None:
        print(f"\n  Championship projection (top 5):")
        for _, row in champ.head(5).iterrows():
            print(f"    {row['driver_code']:6s}  actual={int(row['actual_points']):3d}pts"
                  f"  projected={int(row['projected_total']):3d}pts"
                  f"  ({int(row['races_remaining'])} races left)")

    step("Computing Bayesian prior...")
    priors = bayesian_prior(entries)

    race_distance = get_race_distance(season, round_, circuit)
    step(f"Running {MC_RUNS} Monte Carlo simulations over {race_distance} laps...")
    sim_results = simulate_race(entries, race_distance=race_distance, artifacts=artifacts)
    step("  Simulations complete")

    step("Computing final predictions...")
    predictions = compute_predictions(
        entries, sim_results, priors, season, round_, gp_name,
        ridge_preds=ridge_preds, rf_preds=rf_preds,
    )
    predictions = apply_calibration(predictions, calibrator)

    print_predictions(predictions, gp_name)

    if not args.dry_run:
        step("Writing to Neon...")
        write_predictions(predictions)
        if race_actuals_available(season, round_):
            step("Actual race results found — refreshing score for this round...")
            score_prediction(season, round_)
        step(f"Done. View at /api/predictions?season={season}&round={round_}")
    else:
        step("Dry run — not writing to DB")

    print(f"\n  ✓ Complete")

if __name__ == "__main__":
    main()
