"""Robust per-stint tyre diagnostics and explicitly conditional strategy scenarios.

This module never writes production predictions. Slopes are conditional pace loss,
not physical wear measurements or an estimate of actual fuel load.
"""
from collections import Counter
import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd

from tyre_model import DEFAULT_DEG, FUEL_MS_PER_LAP

PROTOCOL_VERSION = 'tyre-shadow-v2'
FUEL_SCENARIOS = (0., 14., 28., 42., 56.)
MIN_LAPS = 6
BOOTSTRAP_DRAWS = 200


def protocol_manifest():
    here = Path(__file__).parent
    files = ['tyre_observations.py', 'tyre_analysis.py', 'tyre_challenger.py', 'tyre_allocations.json',
             'event_identity.py', 'tyre_benchmark.py', 'evaluation_foundations.py',
             'predict.py', 'robust_model.py', 'robust_features.py']
    return dict(version=PROTOCOL_VERSION, estimator='within-stint median pairwise slope',
                fuel_scenarios_ms_per_lap=list(FUEL_SCENARIOS), minimum_fit_laps=MIN_LAPS,
                bootstrap_draws=BOOTSTRAP_DRAWS, relative_lap_screen=.06,
                selection='fixed protocol; no automatic model promotion',
                source_sha256={name:hashlib.sha256((here/name).read_bytes()).hexdigest() for name in files})


def median_slope(x, y):
    """Theil-Sen slope resists single anomalous lap times without clipping slopes."""
    x, y = np.asarray(x, float), np.asarray(y, float)
    a, b = np.triu_indices(len(x), 1)
    valid = x[b] != x[a]
    if not valid.any():
        return None
    return float(np.median((y[b[valid]]-y[a[valid]])/(x[b[valid]]-x[a[valid]])))


def correlate(x, y):
    x, y = np.asarray(x, float), np.asarray(y, float)
    valid = np.isfinite(x) & np.isfinite(y)
    if valid.sum() < 4 or np.std(x[valid]) < 1e-9 or np.std(y[valid]) < 1e-9:
        return None
    return float(np.corrcoef(x[valid], y[valid])[0, 1])


def fit_stint(frame, fuel_ms=FUEL_MS_PER_LAP, seed=42, draws=BOOTSTRAP_DRAWS, holdout_frame=None):
    frame = frame.sort_values('lap_number')
    x = frame.tyre_life.to_numpy(float)
    lap = frame.lap_number.to_numpy(float)
    observed = frame.lap_time_ms.to_numpy(float)
    corrected = observed + fuel_ms * (lap-lap[0])
    slope = median_slope(x, corrected)
    intercept = float(np.median(corrected-slope*x))
    fitted = intercept+slope*x
    residual = corrected-fitted
    # Circular residual blocks preserve short-range dependence. These conditional
    # intervals do not cover fuel, traffic, filtering or engine-mode uncertainty.
    rng = np.random.default_rng(seed)
    block = max(2, int(np.ceil(len(x)**(1/3))))
    samples = []
    for _ in range(draws):
        starts = rng.integers(0, len(x), int(np.ceil(len(x)/block)))
        indices = np.concatenate([(s+np.arange(block)) % len(x) for s in starts])[:len(x)]
        samples.append(median_slope(x, fitted+residual[indices]))
    interval = np.quantile(samples, [.025, .975]).tolist() if samples else [None, None]
    # Split before time-based outlier selection. Only earlier laps establish the
    # training screen; every provider-quality-eligible tail lap is scored.
    held = (holdout_frame if holdout_frame is not None else frame).sort_values('lap_number')
    tail = max(2, int(np.ceil(len(held)*.25)))
    training, testing = held.iloc[:-tail], held.iloc[-tail:]
    reference = training.lap_time_ms.median()
    training = training[training.lap_time_ms.between(reference*.94,reference*1.06)]
    error = None
    if len(training) >= 4 and training.tyre_life.nunique() >= 3:
        held_y = training.lap_time_ms.to_numpy(float)+fuel_ms*training.lap_number.to_numpy(float)
        held_slope = median_slope(training.tyre_life,held_y)
        held_intercept = float(np.median(held_y-held_slope*training.tyre_life.to_numpy(float)))
        observed_tail = testing.lap_time_ms.to_numpy(float)+fuel_ms*testing.lap_number.to_numpy(float)
        error = np.abs(observed_tail-(held_intercept+held_slope*testing.tyre_life.to_numpy(float)))
    temps = pd.to_numeric(frame.track_temp, errors='coerce').to_numpy(float)
    half = len(x)//2
    early, late = median_slope(x[:half], corrected[:half]), median_slope(x[half:], corrected[half:])
    return dict(raw_slope_ms_per_lap=slope, intercept_ms=intercept, fuel_ms_per_lap=fuel_ms,
                conditional_slope_interval_ms=interval, interval_method='circular_residual_block_bootstrap',
                interval_limitations='conditional on fuel and accepted laps; short stints give weak uncertainty estimates',
                bootstrap_draws=draws, bootstrap_block_laps=block,
                residual_mae_ms=float(np.mean(np.abs(residual))),
                residual_lag1=correlate(residual[:-1], residual[1:]),
                residual_time_correlation=correlate(lap, residual),
                residual_temperature_correlation=correlate(temps, residual),
                tail_holdout_laps=tail, tail_training_laps=len(training),
                tail_mae_ms=float(error.mean()) if error is not None else None,
                tail_screen_basis='earlier training laps only; all quality-eligible tail laps scored',
                late_minus_early_slope_ms=late-early if late is not None and early is not None else None,
                observed_ms=observed.tolist(), fitted_observed_ms=(fitted-fuel_ms*(lap-lap[0])).tolist(),
                residual_ms=residual.tolist(), tyre_age_completed=x.tolist(), lap_numbers=lap.astype(int).tolist())


def analyze(rows, fuels=FUEL_SCENARIOS, draws=BOOTSTRAP_DRAWS):
    fuels = tuple(sorted(set(map(float, fuels)) | {FUEL_MS_PER_LAP}))
    if any(not np.isfinite(f) or f < 0 or f > 200 for f in fuels):
        raise ValueError('Fuel scenarios must be finite and between 0 and 200 ms/lap')
    frame = pd.DataFrame(rows)
    if frame.empty:
        raise ValueError('No observed laps supplied')
    if frame.duplicated(['session_key', 'driver_code', 'lap_number']).any():
        raise ValueError('Duplicate observation versions; select one batch per session')
    excluded = Counter(reason for row in rows for reason in row['exclusion_reasons'])
    stints = []
    eligible = frame[frame.eligible & frame.tyre_life.notna() & frame.lap_time_ms.notna()].copy()
    keys = ['season', 'round', 'circuit', 'session_key', 'fp_session', 'driver_code', 'stint', 'compound']
    for key, group in eligible.groupby(keys, dropna=False):
        group = group.sort_values('lap_number')
        median = group.lap_time_ms.median()
        clean = group[group.lap_time_ms.between(median*.94, median*1.06)]
        enough = len(clean) >= MIN_LAPS and clean.tyre_life.max()-clean.tyre_life.min() >= 5
        entry = {k: (int(v) if k in ['season', 'round', 'session_key', 'stint'] else v) for k, v in zip(keys, key)}
        entry.update(n_eligible_laps=len(group), n_fit_laps=len(clean), outlier_laps=len(group)-len(clean),
                     observed_age_range=[float(clean.tyre_life.min()),float(clean.tyre_life.max())] if len(clean) else None,
                     actual_compound=group.actual_compound.iloc[0], tyre_spec=group.tyre_spec.iloc[0],
                     allocation_source=group.allocation_source.iloc[0], traffic_status='unknown',
                     status='fitted' if enough else 'insufficient_laps', scenarios=[])
        if enough:
            seed = int(hashlib.sha256(str(key).encode()).hexdigest()[:8], 16)
            for fuel in fuels:
                entry['scenarios'].append(fit_stint(clean, fuel, seed, draws, holdout_frame=group))
            base = next(s for s in entry['scenarios'] if s['fuel_ms_per_lap'] == FUEL_MS_PER_LAP)
            raw = base['raw_slope_ms_per_lap']
            reason = ('negative_estimate' if raw < 0 else 'extreme_estimate' if raw > 300
                      else 'unknown_compound_identity' if entry['tyre_spec'] is None else None)
            entry.update(raw_slope_ms_per_lap=raw, selected_rate_ms_per_lap=DEFAULT_DEG[key[-1]] if reason else raw,
                         fallback_reason=reason, uses_fitted_rate=reason is None)
            # The main screen is an explicit heuristic; report its influence.
            screens = []
            for fraction in [.03, .06, .09]:
                subset = group[group.lap_time_ms.between(median*(1-fraction), median*(1+fraction))]
                screens.append(dict(relative_screen=fraction, laps=len(subset), slope_ms_per_lap=(
                    median_slope(subset.tyre_life, subset.lap_time_ms+FUEL_MS_PER_LAP*subset.lap_number)
                    if len(subset) >= MIN_LAPS else None)))
            entry['filter_sensitivity'] = screens
        else:
            entry.update(raw_slope_ms_per_lap=None, selected_rate_ms_per_lap=DEFAULT_DEG[key[-1]],
                         fallback_reason='insufficient_laps', uses_fitted_rate=False)
        stints.append(entry)
    # Separate every event, season and physical compound specification. Unknown
    # identity can be inspected, but never borrowed into another event or season.
    curves = []
    for key, compound in frame.groupby(['season', 'round', 'circuit', 'compound'], dropna=False):
        if key[-1] not in DEFAULT_DEG:
            continue
        matches = [s for s in stints if (s['season'], s['round'], s['circuit'], s['compound']) == key]
        valid = [s for s in matches if s['status'] == 'fitted']
        for fuel in fuels:
            values = [next(sc['raw_slope_ms_per_lap'] for sc in s['scenarios'] if sc['fuel_ms_per_lap'] == fuel) for s in valid]
            raw = float(np.median(values)) if values else None
            spec = compound.tyre_spec.dropna().unique()
            reason = ('insufficient_stints' if len(values) < 3 else 'unknown_compound_identity' if len(spec) != 1
                      else 'negative_estimate' if raw < 0 else 'extreme_estimate' if raw > 300 else None)
            curves.append(dict(season=int(key[0]), round=int(key[1]), circuit=key[2], compound=key[3],
                               tyre_spec=spec[0] if len(spec) == 1 else None, fuel_ms_per_lap=fuel,
                               n_stints=len(values), n_drivers=len({s['driver_code'] for s in valid}),
                               max_observed_age=max((s['observed_age_range'][1] for s in valid),default=None),
                               raw_slope_ms_per_lap=raw, fallback_reason=reason,
                               selected_rate_ms_per_lap=DEFAULT_DEG[key[-1]] if reason else raw))
    return dict(protocol_version=PROTOCOL_VERSION, protocol=protocol_manifest(), scope='experimental practice pace loss',
                fuel_is_assumed=True, total_laps=len(frame), eligible_laps=len(eligible),
                exclusion_counts=dict(excluded), stints=stints, curves=curves,
                limitations=['Starting fuel, engine mode and practice traffic are unobserved.',
                             'Fitted pace loss is not a causal measurement of tyre wear.',
                             'Physical tyre-set identity is unavailable; observed starting age is retained.',
                             'No tyre-life limit or nonlinear cliff is inferred.',
                             'No cross-season or cross-event pooling of relative compound names.'])


def strategy_sensitivity(report, race_laps=56, pit_loss_ms=22000., offsets=None):
    """Isolated dry one-stop comparison; offsets/pit loss are scenario assumptions."""
    offsets = offsets or {'SOFT': 0., 'MEDIUM': 350., 'HARD': 700.}
    output = []
    events = {(c['season'], c['round'], c['circuit']) for c in report['curves']}
    for event in sorted(events):
        for fuel in sorted({c['fuel_ms_per_lap'] for c in report['curves']}):
            curves = {c['compound']: c for c in report['curves']
                      if (c['season'], c['round'], c['circuit']) == event and c['fuel_ms_per_lap'] == fuel}
            for first, second in [('MEDIUM', 'HARD'), ('SOFT', 'HARD'), ('SOFT', 'MEDIUM')]:
                if first not in curves or second not in curves:
                    continue
                costs = []
                for stop in range(5, race_laps-4):
                    a, b = stop, race_laps-stop
                    # Shared fuel contribution is constant across pit laps but
                    # retained to distinguish its direct effect from wear fitting.
                    total = offsets[first]*a+offsets[second]*b+pit_loss_ms
                    total += curves[first]['selected_rate_ms_per_lap']*a*(a+1)/2
                    total += curves[second]['selected_rate_ms_per_lap']*b*(b+1)/2
                    total += fuel*race_laps*(race_laps-1)/2
                    costs.append((stop, total))
                minimum = min(cost for _, cost in costs)
                near = [stop for stop, cost in costs if cost <= minimum+1000]
                best_stop = min(costs, key=lambda x:x[1])[0]
                output.append(dict(season=event[0], round=event[1], circuit=event[2], fuel_ms_per_lap=fuel,
                                   sequence=f'{first}-{second}', best_stop_lap=best_stop,
                                   extrapolates_observed_age=any(curves[c]['max_observed_age'] is None or age > curves[c]['max_observed_age']
                                                                for c,age in [(first,best_stop),(second,race_laps-best_stop)]),
                                   within_one_second_window=[min(near), max(near)],
                                   uses_fallback=any(curves[c]['fallback_reason'] for c in [first, second]),
                                   assumed_pit_loss_ms=pit_loss_ms, assumed_compound_offsets_ms=offsets,
                                   scope='isolated one-stop dry scenario; no opponents, traffic, safety cars or tyre-life limit'))
    return output


def dumps(value):
    return json.dumps(value, indent=2, allow_nan=False, default=lambda x:x.item() if isinstance(x, np.generic) else str(x))
