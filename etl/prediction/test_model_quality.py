import unittest
from unittest.mock import patch, MagicMock
import numpy as np
import pandas as pd
import predict
import weekly
from tyre_model import fit_tyre_curve


class QualityTests(unittest.TestCase):
    def test_ensemble_changes_ranking_and_keeps_probabilities(self):
        entries = [dict(driver_code=d, circuit='Test', team='Test', grid_position=i,
                        confidence=.5, elo_rating=1500, gap_to_pole_sec=0,
                        rolling_avg_finish=2) for i, d in enumerate(['AAA', 'BBB', 'CCC'], 1)]
        sims = {'AAA': [1, 2, 3], 'BBB': [2, 3, 1], 'CCC': [3, 1, 2]}
        a = predict.compute_predictions(entries, sims, dict.fromkeys(sims, 1/3), 2025, 1, 'Test',
                                        ridge_preds={'AAA': 3, 'BBB': 2, 'CCC': 1})
        b = predict.compute_predictions(entries, sims, dict.fromkeys(sims, 1/3), 2025, 1, 'Test',
                                        rf_preds={'AAA': 3, 'BBB': 2, 'CCC': 1})
        for result in [a, b]:
            self.assertEqual(result[0]['driver_code'], 'CCC')
            self.assertEqual([p['predicted_position'] for p in result], [1, 2, 3])
            self.assertAlmostEqual(sum(p['win_probability'] for p in result), 1, places=3)
            self.assertAlmostEqual(sum(p['podium_probability'] for p in result), 3, places=3)

    def test_default_safeguards_preserve_order_and_expected_points(self):
        rows = [dict(driver_code=str(i), season=2026, round=5,
                     model_version='prod_v7_calibrated_robust_ridge_mc',
                     predicted_position=i, points_expected=20-i,
                     win_probability=.8 if i==1 else .1, podium_probability=1.)
                for i in range(1,4)]
        original = [(p['driver_code'],p['predicted_position'],p['points_expected']) for p in rows]
        output = predict.simulation_uncertainty(predict.apply_calibration(rows,None),
                                               {str(i):[i]*10 for i in range(1,4)})
        self.assertEqual(original,[(p['driver_code'],p['predicted_position'],p['points_expected']) for p in output])
        self.assertEqual(output[0]['range_basis'],'simulation')
        self.assertEqual((output[0]['finish_p10'],output[0]['finish_p90']),(1,1))
        self.assertAlmostEqual(sum(p['win_probability'] for p in output),1)
        self.assertAlmostEqual(sum(p['podium_probability'] for p in output),3)

    def test_tyre_fit_removes_pace_and_fuel_confounding(self):
        rows = [dict(season=2025, round=1, driver_code=str(driver), lap_number=age,
                     tyre_life=age, compound='SOFT', lap_time_ms=90000+driver*5000+(100-28)*age,
                     pit_in_time_ms=None, pit_out_time_ms=None)
                for driver in range(4) for age in range(1, 21)]
        curve = fit_tyre_curve(pd.DataFrame(rows), 'SOFT')
        self.assertAlmostEqual(curve['linear'], 100)
        for row in rows:
            row['lap_time_ms'] = 90000 - row['tyre_life']*1000
        curve = fit_tyre_curve(pd.DataFrame(rows), 'SOFT')
        self.assertEqual(curve['method'], 'conservative_fallback')
        self.assertGreaterEqual(curve['linear'], 0)

    def test_partial_forecast_cannot_pass_with_15_drivers(self):
        conn = MagicMock()
        conn.__enter__.return_value.cursor.return_value.__enter__.return_value.fetchall.return_value = [
            ('prod_v5', str(i)) for i in range(15)]
        with patch.object(weekly.psycopg2, 'connect', return_value=conn):
            with self.assertRaisesRegex(RuntimeError, 'incomplete forecast'):
                weekly.validate_fields(2026, 17, set(map(str, range(22))))

    def test_same_size_wrong_driver_forecast_is_rejected(self):
        conn = MagicMock()
        conn.__enter__.return_value.cursor.return_value.__enter__.return_value.fetchall.return_value = [
            ('prod_v5', 'AAA'), ('prod_v5', 'WRONG')]
        with patch.object(weekly.psycopg2, 'connect', return_value=conn):
            with self.assertRaisesRegex(RuntimeError, "missing=.*BBB"):
                weekly.validate_fields(2026, 17, {'AAA', 'BBB'})

    def test_incomplete_actuals_cannot_be_scored(self):
        conn = MagicMock()
        cur = conn.__enter__.return_value.cursor.return_value.__enter__.return_value
        cur.fetchall.side_effect = [[('prod_v5', 'AAA'), ('prod_v5', 'BBB')], [('AAA',)]]
        with patch.object(weekly.psycopg2, 'connect', return_value=conn):
            with self.assertRaisesRegex(RuntimeError, 'incomplete race classification'):
                weekly.validate_fields(2026, 17, {'AAA', 'BBB'}, actuals=True)

    def test_missing_qualifying_driver_rejected_before_forecast(self):
        conn = MagicMock()
        conn.__enter__.return_value.cursor.return_value.__enter__.return_value.fetchall.return_value = [('AAA',)]
        with patch.object(weekly.psycopg2, 'connect', return_value=conn):
            with self.assertRaisesRegex(RuntimeError, 'qualifying entrants differ'):
                weekly.validate_qualifying(2026, 17, {'AAA', 'BBB'})

    def test_late_forecast_rejected_at_publication(self):
        row = dict(season=2020, round=1, model_version='prod_v5_regaware_mc')
        with patch.object(predict, 'query', return_value=pd.DataFrame({'race_start_utc': ['2020-06-01T12:00:00Z']})):
            with self.assertRaisesRegex(RuntimeError, 'Race has started'):
                predict.validate_publication([row])

    def test_replay_requires_matching_boundary(self):
        row = dict(season=2020, round=1, model_version='prod_backfill_v5_regaware_mc')
        with patch.dict(predict.os.environ, {'F1_ASOF_ROUND': '2020:2'}):
            with self.assertRaisesRegex(RuntimeError, 'matching query boundary'):
                predict.validate_publication([row])

    def test_calendar_count_drives_evidence(self):
        with patch.object(predict, 'query', return_value=pd.DataFrame({'total': [23]})):
            self.assertAlmostEqual(predict.prediction_confidence(2026, 16), .24+16/23*.64)

if __name__ == '__main__':
    unittest.main()
