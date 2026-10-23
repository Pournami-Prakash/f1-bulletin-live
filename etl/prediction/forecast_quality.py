"""Chronological calibration and coherent finishing-position marginals.

Calibration uses raw, out-of-sample predictions from complete, earlier races of
one exact model version. Reconstructed forecasts must be supplied explicitly by
an isolated walk-forward evaluator; production history excludes backfills.
"""
import numpy as np
import pandas as pd
from sklearn.isotonic import IsotonicRegression

MIN_CALIBRATION_RACES = 10
CALIBRATION_SCHEMA = 2


def fit_calibration(scored, season, round_, model_version):
    if scored.empty:
        return None
    frame = scored.copy()
    earlier = (frame.season < season) | ((frame.season == season) & (frame['round'] < round_))
    frame = frame[earlier & frame.model_version.eq(model_version)]
    frame = frame.dropna(subset=['raw_win', 'raw_podium', 'actual_position', 'predicted_at', 'race_start_utc', 'expected_drivers'])
    frame = frame[pd.to_datetime(frame.predicted_at, utc=True, errors='coerce') < pd.to_datetime(frame.race_start_utc, utc=True, errors='coerce')]
    complete = []
    for _, race in frame.groupby(['season', 'round']):
        n = int(race.expected_drivers.iloc[0])
        if (len(race) == n and n >= 3 and race.driver_code.nunique() == n
                and set(race.actual_position) == set(range(1, n + 1))
                and np.isfinite(race[['raw_win', 'raw_podium']].to_numpy(dtype=float)).all()
                and race.raw_win.between(0, 1).all() and race.raw_podium.between(0, 1).all()):
            complete.append(race)
    if len(complete) < MIN_CALIBRATION_RACES:
        return None
    frame = pd.concat(complete, ignore_index=True)
    result = dict(schema=CALIBRATION_SCHEMA, model_version=model_version, n_races=len(complete),
                  n_rows=len(frame), trained_through=list(max(zip(frame.season.astype(int), frame['round'].astype(int)))))
    for name, rule in [('win', frame.actual_position.eq(1)), ('podium', frame.actual_position.le(3))]:
        estimator = IsotonicRegression(out_of_bounds='clip').fit(frame['raw_' + name], rule.astype(float))
        result[name] = dict(x=estimator.X_thresholds_.tolist(), y=estimator.y_thresholds_.tolist())
    return result


def calibration_is_valid(calibrator, season, round_, model_version):
    try:
        valid = (calibrator['schema'] == CALIBRATION_SCHEMA
                 and calibrator['model_version'] == model_version
                 and calibrator['n_races'] >= MIN_CALIBRATION_RACES
                 and tuple(calibrator['trained_through']) < (season, round_))
        for name in ('win', 'podium'):
            x, y = np.asarray(calibrator[name]['x']), np.asarray(calibrator[name]['y'])
            valid = valid and len(x) == len(y) and len(x) > 0 and np.isfinite(x).all() and np.isfinite(y).all()
            valid = valid and (np.diff(x) > 0).all() and (np.diff(y) >= 0).all() and ((y >= 0) & (y <= 1)).all()
        return bool(valid)
    except (KeyError, TypeError, ValueError):
        return False


def project_total(values, total, lower=None):
    """Euclidean projection to a bounded simplex; preserves caps and event nesting."""
    values = np.asarray(values, dtype=float)
    lower = np.zeros_like(values) if lower is None else np.asarray(lower, dtype=float)
    lo, hi = -2.0, 2.0
    for _ in range(80):
        shift = (lo + hi) / 2
        if np.clip(values + shift, lower, 1).sum() < total:
            lo = shift
        else:
            hi = shift
    return np.clip(values + (lo + hi) / 2, lower, 1)


def calibrate(predictions, calibrator=None):
    if not predictions:
        return predictions
    first = predictions[0]
    keys = ('season', 'round', 'model_version')
    if any(any(p[key] != first[key] for key in keys) for p in predictions):
        raise ValueError('Cannot calibrate a mixed race or model version')
    if len({p['driver_code'] for p in predictions}) != len(predictions):
        raise ValueError('Duplicate forecast driver')
    raw = np.array([[p['win_probability'], p['podium_probability']] for p in predictions], dtype=float)
    if not np.isfinite(raw).all() or ((raw < 0) | (raw > 1)).any():
        raise ValueError('Invalid raw event probabilities')
    if calibrator is not None and not calibration_is_valid(calibrator, first['season'], first['round'], first['model_version']):
        calibrator = None
    n = len(predictions)
    win, podium = [], []
    for p in predictions:
        p['raw_win'] = p['win_probability']
        p['raw_podium'] = p['podium_probability']
        if calibrator:
            win.append(np.interp(p['raw_win'], calibrator['win']['x'], calibrator['win']['y']))
            podium.append(np.interp(p['raw_podium'], calibrator['podium']['x'], calibrator['podium']['y']))
        else:
            # Explicit shrinkage fallback, not a fitted accuracy claim.
            alpha = max(.04, .10 - p.get('data_weight_2026', .1) * .07)
            win.append(alpha / n + (1-alpha) * p['raw_win'])
            podium.append(alpha * min(3, n) / n + (1-alpha) * p['raw_podium'])
    win = np.maximum(win, 1e-12)
    win = win / win.sum()
    podium = project_total(podium, min(3, n), lower=win)
    for p, w, pod in zip(predictions, win, podium):
        p['win_probability'], p['podium_probability'] = float(w), float(pod)
        p['calibration_method'] = 'isotonic' if calibrator else 'shrinkage'
        p['calibration_races'] = calibrator['n_races'] if calibrator else 0
    return predictions


def _balance(block, row_totals):
    """IPF: row event masses and one expected driver per finishing position."""
    if not block.shape[1]:
        return block
    block = np.maximum(block, 1e-8)
    for _ in range(10000):
        block *= (row_totals / np.maximum(block.sum(axis=1), 1e-300))[:, None]
        block /= block.sum(axis=0)[None, :]
        if np.max(np.abs(block.sum(axis=1) - row_totals)) < 1e-9:
            return block
    raise RuntimeError('Finishing distribution did not converge')


def finalize(predictions, simulations, points_map):
    """Reconcile simulated shape with calibrated win/podium marginals.

    A doubly stochastic position matrix represents a feasible mixture of complete
    finishing orders. Ranking, points and central 80% model ranges share it.
    These ranges reflect modeled race variability, not verified interval coverage.
    """
    if not predictions:
        return predictions
    n = len(predictions)
    positions = np.arange(1, n + 1)
    base = []
    for p in predictions:
        samples = np.asarray(simulations[p['driver_code']], dtype=int)
        histogram = np.bincount(samples, minlength=n+1)[1:n+1].astype(float) + .01
        # Retain simulation shape while incorporating the order model's score.
        target = np.clip(p.get('_finish_score', samples.mean()), 1.001, n - .001) if n > 1 else 1
        low, high = -50., 50.
        for _ in range(80):
            tilt = (low + high) / 2
            log_mass = np.log(histogram) + tilt * positions
            mass = np.exp(log_mass - log_mass.max())
            if mass @ positions / mass.sum() < target:
                low = tilt
            else:
                high = tilt
        base.append(mass / mass.sum())
    base = np.asarray(base)
    win = np.array([p['win_probability'] for p in predictions])
    podium = np.array([p['podium_probability'] for p in predictions])
    cut = min(3, n)
    matrix = np.column_stack([win, _balance(base[:, 1:cut], podium-win),
                              _balance(base[:, cut:], 1-podium)])
    if not np.allclose(matrix.sum(axis=1), 1, atol=1e-8):
        raise RuntimeError('Inconsistent finishing distribution')
    points = np.array([points_map.get(int(pos), 0) for pos in positions])
    for p, marginal in zip(predictions, matrix):
        cdf = marginal.cumsum()
        p['win_probability'] = float(marginal[0])
        p['podium_probability'] = float(marginal[:cut].sum())
        p['points_expected'] = float(marginal @ points)
        p['expected_finish'] = float(marginal @ positions)
        p['finish_p10'] = min(n, int(np.searchsorted(cdf, .1) + 1))
        p['finish_p90'] = min(n, int(np.searchsorted(cdf, .9) + 1))
        p['position_probabilities'] = marginal.tolist()
        p['range_basis'] = 'coherent'
        grid = p.get('grid_position', n)
        upset_ratio = p['win_probability'] / max(.001, 1-(grid-1)*.08)
        p['is_upset_pick'] = bool(grid >= 5 and p['win_probability'] >= .08 and upset_ratio >= 2)
        p['upset_score'] = float(upset_ratio-1) if p['is_upset_pick'] else 0.0
    predictions.sort(key=lambda p: (p['expected_finish'], -p['points_expected'], p['driver_code']))
    for rank, p in enumerate(predictions, 1):
        p['predicted_position'] = rank
        # MC sampling stability: uncertainty in estimated win frequency only.
        arr = np.asarray(simulations[p['driver_code']])
        mc_win = np.mean(arr == 1)
        p['mc_win_standard_error'] = float(np.sqrt(mc_win * (1-mc_win) / len(arr)))
    return predictions


def validate_forecast(predictions, points_map):
    """Reject inconsistent v7 payloads before persistence, including non-finite values."""
    n = len(predictions)
    if n == 0:
        raise ValueError('Empty forecast')
    matrix = np.asarray([p['position_probabilities'] for p in predictions], dtype=float)
    if matrix.shape != (n,n) or not np.isfinite(matrix).all() or (matrix < 0).any():
        raise ValueError('Invalid finishing probabilities')
    if not np.allclose(matrix.sum(axis=0), 1, atol=1e-8) or not np.allclose(matrix.sum(axis=1), 1, atol=1e-8):
        raise ValueError('Finishing probabilities must allocate each position exactly once')
    if [p['predicted_position'] for p in predictions] != list(range(1,n+1)):
        raise ValueError('Forecast ranking must be complete and ordered')
    expected = matrix @ np.arange(1,n+1)
    if (np.diff(expected) < -1e-8).any():
        raise ValueError('Forecast ranking disagrees with expected finish')
    points = np.array([points_map.get(i,0) for i in range(1,n+1)])
    for p, marginal in zip(predictions,matrix):
        actual = np.array([p['win_probability'], p['podium_probability'], p['points_expected'], p['expected_finish']])
        required = np.array([marginal[0], marginal[:min(3,n)].sum(), marginal@points, marginal@np.arange(1,n+1)])
        if not np.isfinite(actual).all() or not np.allclose(actual,required,atol=1e-8):
            raise ValueError('Published forecast disagrees with finishing distribution')
