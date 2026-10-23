"""Read-only chronological comparison against a Git baseline and qualifying order.

Example: python etl/prediction/backtest_quality.py --rounds 10 12 14 16 --baseline-ref 6cf81d6
No predictions or scores are persisted; all artifacts are isolated per round.
"""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import numpy as np
import pandas as pd
from forecast_quality import fit_calibration
from range_calibration import fit_range_calibration

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent


def evaluate(directory, source, season, number, history=None, *, coherent=False, candidate=False,
             calendar_counts=None):
    os.environ['F1_FEATURES_DIR'] = str(directory)
    spec = importlib.util.spec_from_file_location('evaluation_model', HERE / 'predict.py')
    model = importlib.util.module_from_spec(spec)
    exec(compile(source, str(HERE / 'predict.py'), 'exec'), model.__dict__)
    if calendar_counts:
        original_calendar_count = model.races_per_season
        model.races_per_season = lambda year: (calendar_counts[year] if year in calendar_counts
                                               else original_calendar_count(year))
    artifacts = model.load_artifacts()
    _, _, gp, circuit = model.get_target_race(season, number)
    entries = model.get_entry_list(season, number, artifacts)
    completed = min(model.count_completed_races(2026), number-1) if season == 2026 else model.count_completed_races(2026)
    if model.XGBOOST_AVAILABLE and completed >= model.XGB_TRIGGER_RACES:
        fitted = model.train_xgboost(artifacts['features'], completed, season, number)
        ml = model.predict_xgboost(fitted, entries)
    else:
        ml = model.predict_ridge(model.train_ridge(artifacts['features'], season, number), entries)
    rf = model.predict_ridge(model.train_random_forest(artifacts['features'], season, number), entries)
    priors = model.bayesian_prior(entries, completed)
    np.random.seed(model.DEFAULT_MC_SEED + season*100 + number)
    sims = model.simulate_race(entries, race_distance=model.get_race_distance(season, number, circuit, gp), artifacts=artifacts)
    kwargs = {}
    if hasattr(model, 'robust_model'):
        kwargs['robust'] = model.robust_model.forecast(season, number, entries, circuit)
    flavor = 'xgb' if model.XGBOOST_AVAILABLE and completed >= model.XGB_TRIGGER_RACES else 'ridge'
    family = 'v6_robust' if kwargs.get('robust') else 'v5_regaware'
    if candidate:
        prefix = 'v7_coherent' if coherent else 'v7_calibrated'
        family = prefix + ('_robust' if kwargs.get('robust') else '')
    model.MODEL_VERSION = f'prod_{family}_{flavor}_mc'
    predictions = model.compute_predictions(entries, sims, priors, season, number, gp,
                                            ridge_preds=ml, rf_preds=rf, n_2026_races=completed, **kwargs)
    # Isolated replay history only: do not read production calibrators or artifacts.
    calibrator = fit_calibration(pd.DataFrame(history or []), season, number, model.MODEL_VERSION)
    if candidate:
        if coherent:
            return model.finalize_predictions(predictions, sims, calibrator)
        range_calibrator = fit_range_calibration(pd.DataFrame(history or []), season, number, model.MODEL_VERSION)
        return model.simulation_uncertainty(model.apply_calibration(predictions, calibrator), sims, range_calibrator)
    raw = {p['driver_code']:(p['win_probability'],p['podium_probability']) for p in predictions}
    predictions = model.apply_calibration(predictions, calibrator)
    for p in predictions:
        p['raw_win'], p['raw_podium'] = raw[p['driver_code']]
    return predictions


def metrics(predictions, actual):
    if not actual or {p['driver_code'] for p in predictions} != set(actual):
        raise RuntimeError('Prediction entrants do not match actuals')
    n = len(predictions)
    mae = lambda key: sum(abs(p[key]-actual[p['driver_code']]) for p in predictions)/n
    result = dict(mae=mae('predicted_position'),
                  winner_correct=actual[predictions[0]['driver_code']]==1,
                  podium_hits=sum(actual[p['driver_code']]<=3 for p in predictions[:3]),
                  brier=sum((p['win_probability']-(actual[p['driver_code']]==1))**2 for p in predictions)/n,
                  podium_brier=sum((p['podium_probability']-(actual[p['driver_code']]<=3))**2 for p in predictions)/n,
                  winner_log_loss=-float(np.log(max(next(p['win_probability'] for p in predictions if actual[p['driver_code']]==1), 1e-15))),
                  calibration_method=predictions[0].get('calibration_method', 'legacy_shrinkage'),
                  calibration_races=predictions[0].get('calibration_races', 0))
    if all('finish_p10' in p for p in predictions):
        result['range_coverage'] = sum(p['finish_p10'] <= actual[p['driver_code']] <= p['finish_p90'] for p in predictions)/n
        result['range_width'] = sum(p['finish_p90']-p['finish_p10'] for p in predictions)/n
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--season', type=int, default=2026)
    parser.add_argument('--rounds', type=int, nargs='+', required=True)
    parser.add_argument('--baseline-ref', required=True)
    parser.add_argument('--coherent', action='store_true', help='Evaluate the experimental reconciled distribution instead of default safeguards')
    parser.add_argument('--output', default='/tmp/f1-quality-backtest.json')
    args = parser.parse_args()
    baseline = {name: subprocess.check_output(['git', 'show', f'{args.baseline_ref}:etl/prediction/{name}'], cwd=ROOT, text=True)
                for name in ['feature_engineering.py', 'predict.py']}
    from dotenv import load_dotenv
    import psycopg2
    load_dotenv(ROOT / 'web/.env.local')
    report = []
    histories = {"baseline": [], "candidate": []}
    for number in sorted(args.rounds):
        os.environ['F1_ASOF_ROUND'] = f'{args.season}:{number}'
        with psycopg2.connect(os.environ['NEON_DATABASE_URL']) as conn, conn.cursor() as cur:
            cur.execute("""SELECT r.driver_code, r.finish_position FROM results r JOIN sessions s ON s.id=r.session_id
                WHERE s.season=%s AND s.round=%s AND s.session_type='R' AND r.finish_position IS NOT NULL""", (args.season, number))
            actual = dict(cur.fetchall())
            if len(actual) < 3 or set(actual.values()) != set(range(1, len(actual)+1)):
                raise RuntimeError(f'R{number}: incomplete classification')
            cur.execute('SELECT race_start_utc FROM race_calendar WHERE season=%s AND round=%s', (args.season, number))
            start = cur.fetchone()
            if not start or start[0] is None:
                raise RuntimeError(f'R{number}: race start unavailable')
            race_start = pd.Timestamp(start[0])
        row = {'season': args.season, 'round': number, 'drivers': len(actual), 'forecast_type': 'historical_reconstruction', 'candidate_pipeline': 'coherent' if args.coherent else 'calibration_safeguards'}
        for version in ['baseline', 'candidate']:
            with tempfile.TemporaryDirectory(prefix='f1-quality-') as directory:
                env = dict(os.environ, F1_FEATURES_DIR=directory)
                feature_source = baseline['feature_engineering.py'] if version == 'baseline' else (HERE/'feature_engineering.py').read_text()
                command = '__file__ = '+repr(str(HERE/'feature_engineering.py'))+'\n'+feature_source.replace('from __future__ import annotations', '')
                subprocess.run([sys.executable, '-c', command], env=env, cwd=HERE, check=True)
                source = baseline['predict.py'] if version == 'baseline' else (HERE/'predict.py').read_text()
                predictions = evaluate(directory, source, args.season, number, histories[version], coherent=args.coherent, candidate=version=='candidate')
                row[version] = metrics(predictions, actual)
                row['qualifying_mae'] = sum(abs(p['grid_position']-actual[p['driver_code']]) for p in predictions)/len(predictions)
                # Results enter calibration history only AFTER this race was forecast/scored.
                # Synthetic pre-start timestamps mark reconstructed as-of forecasts;
                # these rows never enter production calibration or storage.
                for p in predictions:
                    if 'raw_win' in p:
                        histories[version].append(dict(
                            season=args.season, round=number, model_version=p['model_version'],
                            driver_code=p['driver_code'], raw_win=p['raw_win'], raw_podium=p['raw_podium'],
                            raw_finish_p10=p.get('raw_finish_p10'),raw_finish_p90=p.get('raw_finish_p90'),
                            raw_range_method=p.get('raw_range_method'),
                            actual_position=actual[p['driver_code']], expected_drivers=len(actual),
                            predicted_at=race_start-pd.Timedelta(seconds=1), race_start_utc=race_start))
        report.append(row)
        Path(args.output).write_text(json.dumps(report, indent=2)+'\n')
        print('BACKTEST', json.dumps(row), flush=True)

if __name__ == '__main__':
    main()
