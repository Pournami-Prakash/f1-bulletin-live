import warnings; warnings.filterwarnings("ignore")
import numpy as np, pandas as pd
from scipy.stats import spearmanr

def race_metrics(g, score):
    """g: one race; score: predicted finishing score (lower = better)."""
    order = g.assign(s=score).sort_values("s")
    pred_rank = np.arange(1, len(order) + 1)
    actual = order["finish"].values
    return dict(
        mae=np.mean(np.abs(pred_rank - actual)),
        rho=spearmanr(pred_rank, actual).correlation,
        win=float(actual[0] == 1),
        podium=int(np.sum(actual[:3] <= 3)),
        top10=int(np.sum(actual[:10] <= 10)),
    )

def walk_forward(data, make_scores, start=(2022, 1)):
    """make_scores(train_df, test_df) -> score array for test_df. Refit per race, train = all earlier races."""
    results = []
    keys = data[["season", "round"]].drop_duplicates().sort_values(["season", "round"]).itertuples(index=False)
    for season, rnd in keys:
        if (season, rnd) < start: continue
        mask = (data.season < season) | ((data.season == season) & (data["round"] < rnd))
        test = data[(data.season == season) & (data["round"] == rnd)]
        train = data[mask]
        if len(test) < 15: continue
        m = race_metrics(test, make_scores(train, test))
        m.update(season=season, round=rnd); results.append(m)
    return pd.DataFrame(results)

def summarise(name, res):
    return dict(model=name, races=len(res), mae=res.mae.mean(), rho=res.rho.mean(), win=res.win.mean(),
                podium=res.podium.mean(), top10=res.top10.mean())
