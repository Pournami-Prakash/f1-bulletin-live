"""Robust finishing-order and podium/top-10/win probability model.

Walk-forward over 107 races (2022-2026), versus qualifying order:
  - finishing-position Huber regression: MAE 3.21 vs 3.37 (p=0.002), better in every season
  - direct logistic podium / top-10 probabilities: log-loss -13% / -6% (p<0.01)
Gradient-boosted trees were worse than the grid order on the same data and are not used.

Every feature is computed from races strictly before the target race plus that weekend's
qualifying and sprint, honouring the F1_ASOF_ROUND boundary.
"""
import os
from pathlib import Path

import numpy as np
import pandas as pd
import psycopg2
from dotenv import load_dotenv
from sklearn.impute import SimpleImputer
from sklearn.linear_model import HuberRegressor, LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from asof import bounded_sql
from robust_features import build

load_dotenv(Path(__file__).resolve().parents[2] / "web" / ".env.local")

FEATURES = ["grid", "gap_pct", "gap_s", "mate_gap_s",
            "d_delta", "t_delta", "d_fin", "t_fin", "d_q", "t_q", "d_dnf", "t_dnf", "mate_fin",
            "circ_move", "grid_x_circ", "q_temp", "q_rain", "sprint_pos", "n",
            "d_pace", "d_pace_s", "t_pace", "pace_comb", "pace_rank", "pace_vs_grid", "mate_pace"]
POSITION_ALPHA = 1.0
LOGIT_C = 0.1
MIN_TRAIN_ROWS = 300
TARGETS = {"win": lambda y: y == 1, "podium": lambda y: y <= 3, "top10": lambda y: y <= 10}


def _query(connection, sql):
    return pd.read_sql(bounded_sql(sql), connection)


def _history(connection):
    race = _query(connection, """SELECT s.season, s.round, s.gp_name, s.circuit, s.date, r.driver_code, r.team,
        r.finish_position, r.points, COALESCE(r.status,'') AS status
        FROM results r JOIN sessions s ON s.id=r.session_id WHERE s.session_type='R' AND s.season>=2021""")
    quali = _query(connection, """SELECT s.season, s.round, ql.driver_code, ql.grid_position AS quali_pos,
        ql.gap_to_pole_ms, ql.best_ms FROM qualifying_laps ql JOIN sessions s ON s.id=ql.session_id
        WHERE s.session_type='Q' AND s.season>=2021""")
    sprint = _query(connection, """SELECT s.season, s.round, r.driver_code, r.finish_position AS sprint_pos
        FROM results r JOIN sessions s ON s.id=r.session_id WHERE s.session_type='S' AND s.season>=2021""")
    weather = _query(connection, """SELECT s.season, s.round, AVG(w.track_temp)::float AS q_track_temp,
        BOOL_OR(COALESCE(w.rainfall,FALSE))::int AS q_rain
        FROM weather w JOIN sessions s ON s.id=w.session_id WHERE s.session_type='Q' GROUP BY 1,2""")
    laps = _query(connection, """SELECT s.season, s.round, l.driver_code, l.lap_number, l.lap_time_ms
        FROM laps l JOIN sessions s ON s.id=l.session_id
        WHERE s.session_type='R' AND s.season>=2021 AND l.lap_time_ms IS NOT NULL
        AND l.pit_in_time_ms IS NULL AND l.pit_out_time_ms IS NULL AND l.lap_number>1""")
    return race, quali, sprint, weather, laps


def race_pace(laps):
    """Median lap time relative to the field on the same lap: cancels fuel, track evolution and SC."""
    keys = ["season", "round", "lap_number"]
    group = laps.groupby(keys)["lap_time_ms"]
    laps = laps.assign(field=group.transform("median"), n_lap=group.transform("size"))
    laps = laps[(laps.n_lap >= 10) & (laps.lap_time_ms < laps.field * 1.07)]
    laps = laps.assign(rel=(laps.lap_time_ms / laps.field - 1) * 100)
    out = laps.groupby(["season", "round", "driver_code"]).agg(pace=("rel", "median"), pace_laps=("rel", "size")).reset_index()
    return out[out.pace_laps >= 10]


def _pipeline(model):
    return make_pipeline(SimpleImputer(strategy="median"), StandardScaler(), model)


def forecast(season, round_, entries, circuit):
    """entries: dicts with driver_code, team, grid_position, gap_to_pole_sec (as used by predict.py).
    Returns {driver_code: {'score', 'win', 'podium', 'top10'}} or None if history is insufficient."""
    with psycopg2.connect(os.environ["NEON_DATABASE_URL"]) as connection:
        race, quali, sprint, weather, laps = _history(connection)
    race = race[(race.season < season) | ((race.season == season) & (race["round"] < round_))]
    race = race.merge(quali, on=["season", "round", "driver_code"], how="left")
    target = pd.DataFrame([{"season": season, "round": round_, "gp_name": "", "circuit": circuit, "date": pd.NaT,
                            "driver_code": e["driver_code"], "team": e["team"], "finish_position": np.nan,
                            "points": 0.0, "status": ""} for e in entries])
    current = quali[(quali.season == season) & (quali["round"] == round_)]
    target = target.merge(current, on=["season", "round", "driver_code"], how="left")
    grid = pd.Series({e["driver_code"]: e["grid_position"] for e in entries})
    gap = pd.Series({e["driver_code"]: e.get("gap_to_pole_sec", np.nan) * 1000 for e in entries})
    target["quali_pos"] = target["quali_pos"].fillna(target["driver_code"].map(grid))
    target["gap_to_pole_ms"] = target["gap_to_pole_ms"].fillna(target["driver_code"].map(gap))
    if target["best_ms"].isna().all():
        target["best_ms"] = 90000.0  # only the gap/best ratio matters
    df = pd.concat([race, target], ignore_index=True)
    df = df.merge(sprint, on=["season", "round", "driver_code"], how="left") \
           .merge(weather, on=["season", "round"], how="left")
    data = build(df, race_pace(laps))
    train = data[~((data.season == season) & (data["round"] == round_))]
    train = train[train.finish.notna()]
    test = data[(data.season == season) & (data["round"] == round_)]
    if len(train) < MIN_TRAIN_ROWS or test.empty:
        return None
    position = _pipeline(HuberRegressor(alpha=POSITION_ALPHA, epsilon=1.35, max_iter=300)).fit(train[FEATURES], train["finish"])
    score = position.predict(test[FEATURES])
    out = {code: {"score": float(s)} for code, s in zip(test["driver_code"], score)}
    probabilities = {}
    for name, rule in TARGETS.items():
        model = _pipeline(LogisticRegression(C=LOGIT_C, max_iter=1000)).fit(train[FEATURES], rule(train["finish"]).astype(int))
        probabilities[name] = model.predict_proba(test[FEATURES])[:, 1]
    total_win = probabilities["win"].sum()
    probabilities["win"] = probabilities["win"] / total_win if total_win > 0 else probabilities["win"]
    probabilities["podium"] = np.clip(probabilities["podium"] * 3 / probabilities["podium"].sum(), 0, 1)
    for name, values in probabilities.items():
        for code, value in zip(test["driver_code"], values):
            out[code][name] = float(value)
    return out
