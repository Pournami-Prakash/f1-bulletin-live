"""Leak-free features: every value is computed from races strictly before the target race,
plus that weekend's qualifying (and sprint, if any), which are known before the start."""
import numpy as np
import pandas as pd

ALPHA = 0.25  # EWMA weight of the newest race


def ewm_update(store, key, value, alpha=ALPHA):
    old = store.get(key)
    store[key] = value if old is None else (1 - alpha) * old + alpha * value


def build(df, pace=None):
    if pace is not None:
        df = df.merge(pace[['season','round','driver_code','pace']], on=['season','round','driver_code'], how='left')
    else:
        df = df.assign(pace=np.nan)
    df = df.sort_values(["season", "round", "quali_pos"]).reset_index(drop=True)
    df["finish_position"] = df["finish_position"].fillna(df.groupby(["season", "round"])["finish_position"].transform("max") + 1)
    df["quali_pos"] = df["quali_pos"].fillna(df.groupby(["season", "round"])["quali_pos"].transform("max") + 1)
    df["dnf"] = (~df["status"].str.contains(r"Finished|Lap", case=False, regex=True)).astype(int)
    d_pace, d_pace_s, t_pace = {}, {}, {}
    d_delta, t_delta, d_fin, t_fin, d_dnf, t_dnf, d_q, t_q = ({} for _ in range(8))
    circ = {}  # circuit -> list of |grid-finish|
    pole_conv = {}
    rows = []
    for (season, rnd), race in df.groupby(["season", "round"], sort=True):
        n = len(race)
        teams = race.groupby("team")
        gap = race["gap_to_pole_ms"].fillna(race["gap_to_pole_ms"].max())
        best = race["best_ms"].dropna().min()
        cur = len(rows)
        for _, r in race.iterrows():
            drv, team = r.driver_code, r.team
            mate = race[(race.team == team) & (race.driver_code != drv)]
            mate_gap = (gap[mate.index].mean() if len(mate) else np.nan)
            past = circ.get(r.circuit, [])
            rows.append(dict(
                season=season, round=rnd, driver_code=drv, team=team, circuit=r.circuit,
                finish=r.finish_position, grid=r.quali_pos, n=n,
                gap_pct=gap[r.name] / best * 100 if pd.notna(best) else np.nan,
                gap_s=gap[r.name] / 1000,
                mate_gap_s=(gap[r.name] - mate_gap) / 1000 if pd.notna(mate_gap) else 0.0,
                d_delta=d_delta.get(drv, 0.0), t_delta=t_delta.get((season, team), t_delta.get(team, 0.0)),
                d_fin=d_fin.get(drv, 11.0), t_fin=t_fin.get((season, team), t_fin.get(team, 11.0)),
                d_q=d_q.get(drv, 11.0), t_q=t_q.get((season, team), t_q.get(team, 11.0)),
                d_dnf=d_dnf.get(drv, 0.12), t_dnf=t_dnf.get(team, 0.12),
                circ_move=np.mean(past) if past else 3.0, circ_n=len(past),
                sprint_pos=r.sprint_pos if pd.notna(r.sprint_pos) else np.nan,
                d_pace=d_pace.get(drv, np.nan), d_pace_s=d_pace_s.get(drv, np.nan),
                t_pace=t_pace.get((season, team), t_pace.get(team, np.nan)),
                q_temp=r.q_track_temp, q_rain=r.q_rain, dnf=r.dnf,
            ))
        # state update AFTER the race (strictly after features were emitted)
        for _, r in race.iterrows():
            drv, team = r.driver_code, r.team
            delta = r.quali_pos - r.finish_position
            ewm_update(d_delta, drv, delta); ewm_update(d_fin, drv, r.finish_position); ewm_update(d_q, drv, r.quali_pos)
            ewm_update(d_dnf, drv, r.dnf)
            ewm_update(t_dnf, team, r.dnf, 0.15)
            for store, v in ((t_delta, delta), (t_fin, r.finish_position), (t_q, r.quali_pos)):
                ewm_update(store, (season, team), v, 0.3)
                store[team] = store[(season, team)]  # carry to next season as prior
            if pd.notna(r.pace):
                ewm_update(d_pace, drv, r.pace, 0.35); ewm_update(d_pace_s, drv, r.pace, 0.12)
                ewm_update(t_pace, (season, team), r.pace, 0.35); t_pace[team] = t_pace[(season, team)]
            circ.setdefault(r.circuit, []).append(abs(delta))
    out = pd.DataFrame(rows)
    key = ["season", "round"]
    out["pace_comb"] = out[["d_pace", "t_pace"]].mean(axis=1)
    out["pace_rank"] = out.groupby(key)["pace_comb"].rank()
    out["pace_vs_grid"] = out["pace_rank"] - out["grid"]
    out["mate_pace"] = out["d_pace"] - out.groupby(key + ["team"])["d_pace"].transform("mean")
    out["mate_fin"] = out["d_fin"] - out.groupby(["season", "round", "team"])["d_fin"].transform("mean")
    out["grid_x_circ"] = out["grid"] * out["circ_move"]
    return out
