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

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent


def evaluate(directory, source, season, number):
    os.environ['F1_FEATURES_DIR'] = str(directory)
    spec = importlib.util.spec_from_file_location('evaluation_model', HERE / 'predict.py')
    model = importlib.util.module_from_spec(spec)
    exec(compile(source, str(HERE / 'predict.py'), 'exec'), model.__dict__)
    artifacts = model.load_artifacts()
    _, _, gp, circuit = model.get_target_race(season, number)
    entries = model.get_entry_list(season, number, artifacts)
    completed = min(model.count_completed_races(2026), number-1)
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
    return model.compute_predictions(entries, sims, priors, season, number, gp,
                                     ridge_preds=ml, rf_preds=rf, n_2026_races=completed, **kwargs)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--season', type=int, default=2026)
    parser.add_argument('--rounds', type=int, nargs='+', required=True)
    parser.add_argument('--baseline-ref', required=True)
    parser.add_argument('--output', default='/tmp/f1-quality-backtest.json')
    args = parser.parse_args()
    baseline = {name: subprocess.check_output(['git', 'show', f'{args.baseline_ref}:etl/prediction/{name}'], cwd=ROOT, text=True)
                for name in ['feature_engineering.py', 'predict.py']}
    from dotenv import load_dotenv
    import psycopg2
    load_dotenv(ROOT / 'web/.env.local')
    report = []
    for number in sorted(args.rounds):
        os.environ['F1_ASOF_ROUND'] = f'{args.season}:{number}'
        with psycopg2.connect(os.environ['NEON_DATABASE_URL']) as conn, conn.cursor() as cur:
            cur.execute("""SELECT r.driver_code, r.finish_position FROM results r JOIN sessions s ON s.id=r.session_id
                WHERE s.season=%s AND s.round=%s AND s.session_type='R' AND r.finish_position IS NOT NULL""", (args.season, number))
            actual = dict(cur.fetchall())
        row = {'season': args.season, 'round': number, 'drivers': len(actual)}
        for version in ['baseline', 'candidate']:
            with tempfile.TemporaryDirectory(prefix='f1-quality-') as directory:
                env = dict(os.environ, F1_FEATURES_DIR=directory)
                feature_source = baseline['feature_engineering.py'] if version == 'baseline' else (HERE/'feature_engineering.py').read_text()
                command = '__file__ = '+repr(str(HERE/'feature_engineering.py'))+'\n'+feature_source.replace('from __future__ import annotations', '')
                subprocess.run([sys.executable, '-c', command], env=env, cwd=HERE, check=True)
                source = baseline['predict.py'] if version == 'baseline' else (HERE/'predict.py').read_text()
                predictions = evaluate(directory, source, args.season, number)
                if {p['driver_code'] for p in predictions} != set(actual):
                    raise RuntimeError(f'R{number}: entrants do not match actuals')
                mae = lambda key: sum(abs(p[key]-actual[p['driver_code']]) for p in predictions)/len(predictions)
                row[version] = {'mae': mae('predicted_position'), 'winner_correct': actual[predictions[0]['driver_code']]==1,
                                'podium_hits': sum(actual[p['driver_code']]<=3 for p in predictions[:3]),
                                'brier': sum((p['win_probability']-(actual[p['driver_code']]==1))**2 for p in predictions)/len(predictions)}
                row['qualifying_mae'] = mae('grid_position')
        report.append(row)
        Path(args.output).write_text(json.dumps(report, indent=2)+'\n')
        print('BACKTEST', json.dumps(row), flush=True)

if __name__ == '__main__':
    main()
