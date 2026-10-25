"""Read-only, predeclared prospective ranking review. Never promotes a model."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path

import numpy as np
import pandas as pd

POLICY_PATH = Path(__file__).with_name('prospective_policy.json')


def qualifying_order(target):
    # robust_features calls the qualifying position "grid"; this is not a
    # separately verified post-penalty starting grid.
    ordered = target.sort_values(['grid', 'driver_code'], kind='stable')
    if ordered.driver_code.duplicated().any() or ordered.grid.isna().any():
        raise ValueError('Complete unique qualifying field required')
    return [dict(driver_code=code, predicted_position=i)
            for i, code in enumerate(ordered.driver_code, 1)]


def rank_mae(predictions, actual):
    codes = [p['driver_code'] for p in predictions]
    positions = [p['predicted_position'] for p in predictions]
    expected = set(range(1, len(actual)+1))
    if (not actual or len(set(codes)) != len(codes) or set(codes) != set(actual)
            or set(positions) != expected or set(actual.values()) != expected):
        raise ValueError('Complete matched rankings required')
    return sum(abs(p['predicted_position']-actual[p['driver_code']]) for p in predictions)/len(actual)


def evaluate(runs, policy):
    selected, rejected = {}, []
    for run in sorted(runs, key=lambda r: (r['season'], r['round'], str(r['forecast_cutoff']), r['id'])):
        event = (run['season'], run['round'])
        try:
            if (run['kind'] != 'prospective' or run['report'].get('protocol') != policy['protocol']
                    or pd.Timestamp(run['forecast_cutoff']) < pd.Timestamp(policy['registered_at'])
                    or pd.Timestamp(run['forecast_cutoff']) >= pd.Timestamp(run['race_start'])
                    or run['predictions'].get('challenger_status') != 'experimental'):
                raise ValueError('Outside frozen prospective protocol')
            actual = run['scores']['actual_positions']
            forecasts = run['predictions']
            published = forecasts['published_snapshot']
            if not published or any(pd.Timestamp(p['predicted_at']) >= pd.Timestamp(run['race_start']) for p in published):
                raise ValueError('Published snapshot was not issued before race')
            errors = {name: rank_mae(predictions, actual) for name, predictions in
                      [('challenger', forecasts['challenger']), ('qualifying', forecasts['qualifying']),
                       ('production', published), ('baseline', forecasts['baseline'])]}
            # Earliest eligible frozen forecast per event; later refreshes cannot cherry-pick it.
            selected.setdefault(event, dict(season=event[0], round=event[1], run_id=run['id'], **errors))
        except (ValueError, KeyError, TypeError) as error:
            rejected.append(dict(run_id=run['id'], reason=str(error)))
    rows = [selected[key] for key in sorted(selected)][:policy['minimum_races']]
    comparisons = {}
    for name in ['qualifying', 'production', 'baseline']:
        delta = np.array([r['challenger']-r[name] for r in rows])
        interval = None
        if len(rows) >= policy['minimum_races']:
            rng = np.random.default_rng(policy['seed'])
            block = policy['race_block_size']
            samples = []
            for _ in range(policy['bootstrap_draws']):
                starts = rng.integers(0, len(rows), int(np.ceil(len(rows)/block)))
                indices = np.concatenate([(s+np.arange(block)) % len(rows) for s in starts])[:len(rows)]
                samples.append(float(delta[indices].mean()))
            interval = np.quantile(samples, [.025, .975]).tolist()
        mean = float(delta.mean()) if len(delta) else None
        comparisons[name] = dict(mae_delta=mean, paired_95pct_interval=interval,
                                passes=bool(interval is not None and mean <= -policy['minimum_mae_gain'] and interval[1] < 0))
    passed = all(c['passes'] for c in comparisons.values())
    return dict(policy=policy, races=len(rows), review_status='review_eligible' if passed else
                ('insufficient_evidence' if len(rows) < policy['minimum_races'] else 'does_not_pass'),
                promotion_approved=False, comparisons=comparisons, events=rows, rejected=rejected,
                note='Single review at the first 10 eligible races. Ranking evidence only; probability calibration and manual review remain required.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    from tyre_shadow import connect
    from psycopg2.extras import RealDictCursor
    policy = json.loads(POLICY_PATH.read_text())
    with connect() as conn, conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute('SELECT id,season,round,kind,forecast_cutoff,race_start,report,predictions,scores FROM tyre_shadow_runs WHERE scores IS NOT NULL')
        report = evaluate([dict(r) for r in cur.fetchall()], policy)
    report['generated_at'] = datetime.now(timezone.utc).isoformat()
    path = Path(args.output); path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2)+'\n')
    print(json.dumps(dict(status=report['review_status'], races=report['races'], output=str(path))))


if __name__ == '__main__':
    main()
