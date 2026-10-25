"""Frozen experimental challenger; never used by the production prediction writer."""
import numpy as np
import pandas as pd
from sklearn.impute import SimpleImputer
from sklearn.linear_model import HuberRegressor, LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from robust_model import FEATURES
from forecast_quality import project_total

KEYS = ['season', 'round', 'driver_code']
TYRE_FEATURES = ['practice_relative_pace', 'practice_relative_wear', 'practice_evidence_laps']
MIN_PRACTICE_RACES = 10


def practice_features(rows):
    """Compare within event/session/compound/time windows, never physical tyre labels across years.

    Unknown starting fuel/traffic remain confounders. All observations must already
    have been available by the target forecast cutoff.
    """
    p = pd.DataFrame(rows)
    if p.empty:
        return pd.DataFrame(columns=KEYS+TYRE_FEATURES)
    p = p[p.eligible & p.tyre_life.notna() & p.session_time_s.notna()].copy()
    if p.empty:
        return pd.DataFrame(columns=KEYS+TYRE_FEATURES)
    stint = KEYS+['session_key', 'stint', 'compound']
    median = p.groupby(stint).lap_time_ms.transform('median')
    p = p[p.lap_time_ms.between(median*.94, median*1.06)].copy()
    p = p[p.groupby(stint).lap_time_ms.transform('size') >= 6].copy()
    if p.empty:
        return pd.DataFrame(columns=KEYS+TYRE_FEATURES)
    p['window'] = (p.session_time_s//900).astype(int)
    compare = ['season', 'round', 'session_key', 'compound', 'window']
    p = p[p.groupby(compare).driver_code.transform('nunique') >= 3].copy()
    if p.empty:
        return pd.DataFrame(columns=KEYS+TYRE_FEATURES)
    reference = p.groupby(compare).lap_time_ms.transform('median')
    p['relative'] = (p.lap_time_ms/reference-1)*100
    p = p[p.relative.abs() < 3].copy()
    from tyre_analysis import median_slope
    out = []
    for key, group in p.groupby(stint):
        if len(group) < 6 or group.tyre_life.nunique() < 5:
            continue
        slope = median_slope(group.tyre_life, group.lap_time_ms+28*group.lap_number)
        out.append(dict(zip(stint, key), pace=float(group.relative.median()),
                        wear=slope/group.lap_time_ms.median()*100, laps=len(group)))
    if not out:
        return pd.DataFrame(columns=KEYS+TYRE_FEATURES)
    q = pd.DataFrame(out)
    # Subtract the within-weekend/compound/session median. Features express
    # relative evidence, not a pooled C1/C2 physical degradation rate.
    compare = ['season', 'round', 'session_key', 'compound']
    q['wear'] -= q.groupby(compare).wear.transform('median')
    return q.groupby(KEYS).agg(practice_relative_pace=('pace', 'median'),
                              practice_relative_wear=('wear', 'median'),
                              practice_evidence_laps=('laps', 'sum')).reset_index()


def pipeline(model):
    return make_pipeline(SimpleImputer(strategy='median', keep_empty_features=True), StandardScaler(), model)


def forecast_pair(train, target, range_history=None, tyre_features=None):
    chosen = TYRE_FEATURES if tyre_features is None else list(tyre_features)
    if not set(chosen).issubset(TYRE_FEATURES):
        raise ValueError('Unknown experimental tyre feature')
    season, number = int(target.season.iloc[0]), int(target['round'].iloc[0])
    train = train[(train.season < season) | ((train.season == season) & (train['round'] < number))].copy()
    train = train[train.finish.notna()]
    if len(train) < 300:
        raise ValueError('Insufficient strictly earlier training observations')
    for column in TYRE_FEATURES:
        if column not in train:
            train[column] = np.nan
        if column not in target:
            target = target.assign(**{column: np.nan})
    practice_races = train[train.practice_relative_pace.notna()][['season', 'round']].drop_duplicates()
    supported = len(practice_races) >= MIN_PRACTICE_RACES
    result = dict(training_rows=len(train), training_practice_races=len(practice_races),
                  trained_through=list(max(zip(train.season.astype(int), train['round'].astype(int)))),
                  challenger_status='experimental' if supported else 'insufficient_practice_history',
                  scope='refitted robust-family baseline versus tyre-feature challenger; uncalibrated event models')
    for name, features in [('baseline', FEATURES), ('challenger', FEATURES+chosen if supported else FEATURES)]:
        position = pipeline(HuberRegressor(alpha=1., epsilon=1.35, max_iter=500)).fit(train[features], train.finish)
        scores = position.predict(target[features])
        rank = np.argsort(np.argsort(scores, kind='stable'), kind='stable')+1
        probability = {}
        for event, outcome in [('win', train.finish.eq(1)), ('podium', train.finish.le(3))]:
            model = pipeline(LogisticRegression(C=.1, max_iter=1000)).fit(train[features], outcome)
            probability[event] = model.predict_proba(target[features])[:, 1]
        win = probability['win']/probability['win'].sum()
        podium = project_total(probability['podium'], min(3, len(target)), lower=win)
        result[name] = [dict(driver_code=code, predicted_position=int(r), score=float(s),
                             win_probability=float(w), podium_probability=float(p))
                        for code, r, s, w, p in zip(target.driver_code, rank, scores, win, podium)]
        past = [r for r in (range_history or []) if (r['season'],r['round']) < (season,number)]
        errors = [abs(p['predicted_position']-r['actual'][p['driver_code']])
                  for r in past for p in r[name] if p['driver_code'] in r['actual']]
        # Empirical chronological residual ranges, not an exchangeability or
        # independence guarantee. Never use this race's outcomes to calibrate it.
        supported_range = len(past) >= 10 and bool(errors)
        radius = float(np.quantile(errors,.8,method='higher')) if supported_range else None
        for p in result[name]:
            p.update(finish_p10=max(1,p['predicted_position']-radius) if radius is not None else None,
                     finish_p90=min(len(target),p['predicted_position']+radius) if radius is not None else None,
                     range_basis='earlier_shadow_absolute_residuals_80pct' if supported_range else 'insufficient_earlier_shadow_races',
                     range_calibration_races=len(past))
    return result


def metrics(predictions, actual):
    if {p['driver_code'] for p in predictions} != set(actual) or set(actual.values()) != set(range(1, len(actual)+1)):
        raise ValueError('Forecast and complete classification fields differ')
    n = len(predictions)
    result = dict(position_mae=sum(abs(p['predicted_position']-actual[p['driver_code']]) for p in predictions)/n,
                win_brier=sum((p['win_probability']-float(actual[p['driver_code']]==1))**2 for p in predictions)/n,
                podium_brier=sum((p['podium_probability']-float(actual[p['driver_code']]<=3))**2 for p in predictions)/n,
                winner_log_loss=-float(np.log(max(next(p['win_probability'] for p in predictions if actual[p['driver_code']]==1), 1e-15))))
    ranged = all(p.get('finish_p10') is not None and p.get('finish_p90') is not None for p in predictions)
    result['range_coverage'] = sum(p['finish_p10'] <= actual[p['driver_code']] <= p['finish_p90'] for p in predictions)/n if ranged else None
    result['range_width'] = sum(p['finish_p90']-p['finish_p10'] for p in predictions)/n if ranged else None
    return result


def paired_summary(rows, seed=42):
    if not rows:
        return dict(races=0, promotion_approved=False, reason='No completed paired forecasts')
    delta = np.array([r['challenger']['position_mae']-r['baseline']['position_mae'] for r in rows])
    rng = np.random.default_rng(seed)
    # Resample contiguous groups of races, not independent driver rows.
    block = min(3, len(delta))
    values = []
    for _ in range(2000):
        starts = rng.integers(0, len(delta), int(np.ceil(len(delta)/block)))
        indices = np.concatenate([(s+np.arange(block)) % len(delta) for s in starts])[:len(delta)]
        values.append(float(delta[indices].mean()))
    extra = {metric+'_delta':float(np.mean([r['challenger'][metric]-r['baseline'][metric] for r in rows]))
             for metric in ['win_brier','podium_brier','winner_log_loss']}
    ranged = [r for r in rows if r['baseline'].get('range_coverage') is not None and r['challenger'].get('range_coverage') is not None]
    extra['range_scored_races'] = len(ranged)
    for name in ['baseline','challenger']:
        extra[name+'_range_coverage'] = float(np.mean([r[name]['range_coverage'] for r in ranged])) if ranged else None
        extra[name+'_range_width'] = float(np.mean([r[name]['range_width'] for r in ranged])) if ranged else None
    return dict(races=len(rows), position_mae_delta=float(delta.mean()), **extra,
                paired_race_block_interval=np.quantile(values, [.025, .975]).tolist(),
                promotion_approved=False, reason='Exploratory comparison; prospective evidence and probability calibration review required')
