import warnings; warnings.filterwarnings("ignore")
import numpy as np, pandas as pd
from xgboost import XGBRegressor, XGBRanker
from sklearn.linear_model import Ridge
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.impute import SimpleImputer
from features import build
from evaluate import walk_forward, summarise

data = build(pd.read_parquet("races.parquet"), pd.read_parquet("pace.parquet"))
data.to_parquet("features.parquet", index=False)
BASE = ["grid", "gap_pct", "gap_s", "mate_gap_s"]
PACE = ["d_pace", "d_pace_s", "t_pace", "pace_comb", "pace_rank", "pace_vs_grid", "mate_pace"]
FORM = ["d_delta", "t_delta", "d_fin", "t_fin", "d_q", "t_q", "d_dnf", "t_dnf", "mate_fin"]
CTX = ["circ_move", "grid_x_circ", "q_temp", "q_rain", "sprint_pos", "n"]
ALL = BASE + FORM + CTX
ALLP = ALL + PACE
xgb = lambda: XGBRegressor(n_estimators=250, max_depth=3, learning_rate=0.04, subsample=0.8, colsample_bytree=0.8, min_child_weight=5, verbosity=0)

def grid_only(train, test): return test["grid"].values
def fit_finish(feats, model):
    def f(train, test):
        m = model(); m.fit(train[feats], train["finish"]); return m.predict(test[feats])
    return f
def fit_delta(feats, model):
    def f(train, test):
        m = model(); m.fit(train[feats], train["finish"] - train["grid"]); return test["grid"].values + m.predict(test[feats])
    return f
def ridge(): return make_pipeline(SimpleImputer(strategy="median"), StandardScaler(), Ridge(alpha=30))
def ranker(feats):
    def f(train, test):
        tr = train.sort_values(["season", "round"])
        grp = tr.groupby(["season", "round"], sort=False).size().values
        rel = (tr.groupby(["season", "round"])["finish"].transform("max") + 1 - tr["finish"]).clip(upper=30).astype(int)
        m = XGBRanker(n_estimators=250, max_depth=3, learning_rate=0.04, subsample=0.8, colsample_bytree=0.8, objective="rank:pairwise", verbosity=0)
        m.fit(tr[feats], rel, group=grp)
        return -m.predict(test[feats])
    return f

MODELS = {
    "grid order": grid_only,
    "Ridge finish (all)": fit_finish(ALL, ridge),
    "Ridge finish (+pace)": fit_finish(ALLP, ridge),
    "Ridge delta (+pace)": fit_delta(ALLP, ridge),
    "XGB delta (+pace)": fit_delta(ALLP, xgb),
    "XGB ranker (+pace)": ranker(ALLP),
}
rows = []
for name, fn in MODELS.items():
    res = walk_forward(data, fn); res.to_csv(f"res2_{name.replace(' ','_').replace('(','').replace(')','')}.csv", index=False)
    rows.append(summarise(name, res)); print(rows[-1], flush=True)
print(pd.DataFrame(rows).round(3).to_string())
