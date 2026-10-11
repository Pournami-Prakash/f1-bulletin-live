import warnings; warnings.filterwarnings("ignore")
import numpy as np, pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.impute import SimpleImputer

data = pd.read_parquet("features.parquet")
BASE = ["grid", "gap_pct", "gap_s", "mate_gap_s"]
FORM = ["d_delta", "t_delta", "d_fin", "t_fin", "d_q", "t_q", "d_dnf", "t_dnf", "mate_fin"]
CTX = ["circ_move", "grid_x_circ", "q_temp", "q_rain", "sprint_pos", "n"]
PACE = ["d_pace", "d_pace_s", "t_pace", "pace_comb", "pace_rank", "pace_vs_grid", "mate_pace"]
ALLP = BASE + FORM + CTX + PACE
TARGETS = {"win": lambda d: d.finish == 1, "podium": lambda d: d.finish <= 3, "top10": lambda d: d.finish <= 10}

def logit(C):
    return make_pipeline(SimpleImputer(strategy="median"), StandardScaler(), LogisticRegression(C=C, max_iter=1000))

def run(start=(2022, 1)):
    rec = []
    keys = data[["season", "round"]].drop_duplicates().sort_values(["season", "round"]).itertuples(index=False)
    for season, rnd in keys:
        if (season, rnd) < start: continue
        tr = data[(data.season < season) | ((data.season == season) & (data["round"] < rnd))]
        te = data[(data.season == season) & (data["round"] == rnd)]
        if len(te) < 15: continue
        for tname, tf in TARGETS.items():
            y, yt = tf(tr).astype(int), tf(te).astype(int).values
            # (a) empirical rate by grid slot (as-of, smoothed toward a monotone prior)
            rate = y.groupby(tr.grid.clip(upper=20)).mean()
            pa = te.grid.clip(upper=20).map(rate).fillna(y.mean()).values
            # (b) direct logistic on all features
            pb = logit(0.1).fit(tr[ALLP], y).predict_proba(te[ALLP])[:, 1]
            # (c) logistic on grid + pace only (small, robust)
            small = ["grid", "gap_pct", "pace_comb", "pace_vs_grid", "t_fin", "d_dnf"]
            pc = logit(0.3).fit(tr[small], y).predict_proba(te[small])[:, 1]
            for name, p in (("grid-slot rate", pa), ("logit all", pb), ("logit small", pc)):
                if tname == "win": p = p / p.sum()           # one winner per race
                if tname == "podium": p = np.clip(p * 3 / p.sum(), 0, 1)
                rec.append(dict(season=season, round=rnd, target=tname, model=name, brier=np.mean((p - yt) ** 2),
                                logloss=-np.mean(yt * np.log(np.clip(p, 1e-4, 1)) + (1 - yt) * np.log(np.clip(1 - p, 1e-4, 1)))))
    return pd.DataFrame(rec)

r = run(); r.to_csv("res4.csv", index=False)
print("ALL RACES 2022+ (mean over races)")
print(r.groupby(["target", "model"])[["brier", "logloss"]].mean().round(4).unstack(0).to_string())
last = r[(r.season == 2026) & (r["round"].between(8, 16))]
print("\n2026 R8-16 (same rounds as the production backtest)")
print(last.groupby(["target", "model"])[["brier"]].mean().round(4).unstack(0).to_string())
