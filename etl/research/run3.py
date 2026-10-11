import warnings; warnings.filterwarnings("ignore")
import numpy as np, pandas as pd
from sklearn.linear_model import Ridge, HuberRegressor, LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.impute import SimpleImputer
from xgboost import XGBRegressor
from evaluate import walk_forward, summarise

data = pd.read_parquet("features.parquet")
BASE = ["grid", "gap_pct", "gap_s", "mate_gap_s"]
FORM = ["d_delta", "t_delta", "d_fin", "t_fin", "d_q", "t_q", "d_dnf", "t_dnf", "mate_fin"]
CTX = ["circ_move", "grid_x_circ", "q_temp", "q_rain", "sprint_pos", "n"]
PACE = ["d_pace", "d_pace_s", "t_pace", "pace_comb", "pace_rank", "pace_vs_grid", "mate_pace"]
ALLP = BASE + FORM + CTX + PACE
CORE = ["grid", "gap_pct", "mate_gap_s", "d_delta", "t_delta", "t_fin", "d_dnf", "t_dnf", "circ_move", "pace_rank", "pace_vs_grid", "pace_comb"]

def pipe(model): return make_pipeline(SimpleImputer(strategy="median"), StandardScaler(), model)

def ridge_fit(feats, alpha, target="finish", denoise=False, huber=False):
    def f(train, test):
        y = train["finish"].astype(float).copy()
        if denoise:
            # DNF labels are noise: replace with the finish a first-pass model expects, then refit
            first = pipe(Ridge(alpha=alpha)).fit(train[feats], y)
            fin = train[~train.dnf.astype(bool)]
            first = pipe(Ridge(alpha=alpha)).fit(fin[feats], fin["finish"])
            y = np.where(train.dnf == 1, first.predict(train[feats]), y)
        if target == "delta": y = y - train["grid"].values
        model = HuberRegressor(alpha=alpha, epsilon=1.35, max_iter=300) if huber else Ridge(alpha=alpha)
        m = pipe(model).fit(train[feats], y)
        p = m.predict(test[feats]); return p + test["grid"].values if target == "delta" else p
    return f

def two_stage(feats, alpha, weight=1.0):
    """Finisher-position model + DNF-risk logistic: score = pos_if_finish + weight * p_dnf * (field_size/2)."""
    def f(train, test):
        fin = train[train.dnf == 0]
        pos = pipe(Ridge(alpha=alpha)).fit(fin[feats], fin["finish"]).predict(test[feats])
        clf = pipe(LogisticRegression(C=0.05, max_iter=500)).fit(train[feats], train["dnf"])
        p = clf.predict_proba(test[feats])[:, 1]
        return pos + weight * p * test["n"].values / 2
    return f

def blend(fa, fb, w):
    return lambda tr, te: w * fa(tr, te) + (1 - w) * fb(tr, te)

grid = lambda tr, te: te["grid"].values
MODELS = {"grid order": grid}
for a in (10, 30, 100, 300, 1000):
    MODELS[f"Ridge a={a} (+pace)"] = ridge_fit(ALLP, a)
MODELS["Ridge a=100 core feats"] = ridge_fit(CORE, 100)
MODELS["Huber a=1 (+pace)"] = ridge_fit(ALLP, 1.0, huber=True)
MODELS["Ridge a=100 denoised DNF"] = ridge_fit(ALLP, 100, denoise=True)
MODELS["Ridge a=100 delta+denoised"] = ridge_fit(ALLP, 100, target="delta", denoise=True)
for w in (0.5, 1.0):
    MODELS[f"Two-stage w={w}"] = two_stage(ALLP, 100, w)
MODELS["Blend ridge/grid 0.7"] = blend(ridge_fit(ALLP, 100), grid, 0.7)
rows = []
for name, fn in MODELS.items():
    res = walk_forward(data, fn); res.to_csv("res3_" + name.replace("/", "-").replace(" ", "_").replace("(", "").replace(")", "").replace("=", "") + ".csv", index=False)
    rows.append(summarise(name, res)); print(name, round(rows[-1]["mae"], 3), round(rows[-1]["rho"], 3), flush=True)
print(pd.DataFrame(rows).round(3).to_string())
