import copy
import unittest

import pandas as pd

from prospective_gate import evaluate, qualifying_order


class ProspectiveGateTests(unittest.TestCase):
    def setUp(self):
        self.policy = dict(protocol={'version': 'frozen'}, registered_at='2026-10-25T00:00:00Z',
                           minimum_races=10, minimum_mae_gain=.1, seed=42,
                           race_block_size=3, bootstrap_draws=2000)

    def run_row(self, number):
        good = [dict(driver_code='A', predicted_position=1), dict(driver_code='B', predicted_position=2)]
        bad = [dict(driver_code='A', predicted_position=2, predicted_at='2026-10-25T01:00:00Z'),
               dict(driver_code='B', predicted_position=1, predicted_at='2026-10-25T01:00:00Z')]
        return dict(id=str(number), season=2027, round=number, kind='prospective',
                    forecast_cutoff='2026-10-25T02:00:00Z', race_start='2026-10-26T00:00:00Z',
                    report=dict(protocol={'version': 'frozen'}), scores=dict(actual_positions={'A': 1, 'B': 2}),
                    predictions=dict(challenger_status='experimental', challenger=good, qualifying=bad,
                                     published_snapshot=bad, baseline=bad))

    def test_ten_races_are_required_and_never_auto_promote(self):
        runs = [self.run_row(i) for i in range(1, 11)]
        self.assertEqual(evaluate(runs[:9], self.policy)['review_status'], 'insufficient_evidence')
        result = evaluate(runs, self.policy)
        self.assertEqual(result['review_status'], 'review_eligible')
        self.assertFalse(result['promotion_approved'])
        runs[0]['predictions']['qualifying'] = runs[0]['predictions']['challenger']
        # All three comparisons must pass; an equal qualifying baseline fails.
        for run in runs:
            run['predictions']['qualifying'] = run['predictions']['challenger']
        self.assertEqual(evaluate(runs, self.policy)['review_status'], 'does_not_pass')

    def test_excludes_changed_protocol_late_incomplete_and_old_forecasts(self):
        runs = [self.run_row(i) for i in range(1, 6)]
        runs[0]['report']['protocol']['version'] = 'changed'
        runs[1]['forecast_cutoff'] = runs[1]['race_start']
        runs[2]['predictions']['qualifying'] = []
        runs[3]['forecast_cutoff'] = '2026-10-24T00:00:00Z'
        runs[4]['predictions']['published_snapshot'][0]['predicted_at'] = runs[4]['race_start']
        result = evaluate(runs, self.policy)
        self.assertEqual(result['races'], 0)
        self.assertEqual(len(result['rejected']), 5)

    def test_refreshes_do_not_add_races_or_replace_first_and_review_does_not_roll(self):
        runs = [self.run_row(i) for i in range(1, 12)]
        refresh = copy.deepcopy(runs[0]); refresh['id'] = 'refresh'
        refresh['forecast_cutoff'] = '2026-10-25T03:00:00Z'
        refresh['predictions']['challenger'] = refresh['predictions']['qualifying']
        result = evaluate([refresh]+runs, self.policy)
        self.assertEqual(result['races'], 10)
        self.assertEqual(result['events'][0]['run_id'], '1')
        self.assertEqual(result['events'][-1]['round'], 10)

    def test_qualifying_ties_are_deterministic(self):
        target = pd.DataFrame(dict(driver_code=['B', 'A', 'C'], grid=[1, 1, 3]))
        self.assertEqual([p['driver_code'] for p in qualifying_order(target)], ['A', 'B', 'C'])


if __name__ == '__main__':
    unittest.main()
