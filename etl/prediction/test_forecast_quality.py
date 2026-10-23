import unittest

import numpy as np
import pandas as pd

from forecast_quality import calibrate, finalize, fit_calibration, calibration_is_valid, validate_forecast
from backtest_quality import metrics

POINTS = {1:25, 2:18, 3:15, 4:12, 5:10, 6:8, 7:6, 8:4, 9:2, 10:1}
VERSION = 'prod_v7_coherent_robust_xgb_mc'


def history(rounds=10):
    return pd.DataFrame([dict(season=2025, round=rnd, model_version=VERSION,
        driver_code=str(driver), raw_win=.5 if driver==1 else .5/19,
        raw_podium=.8 if driver<=3 else .6/17, actual_position=driver,
        predicted_at='2025-01-01T10:00:00Z', race_start_utc='2025-01-01T12:00:00Z', expected_drivers=20)
        for rnd in range(1, rounds+1) for driver in range(1,21)])


def forecast(n=20):
    return [dict(season=2025, round=11, model_version=VERSION, driver_code=str(i),
                 predicted_position=i, grid_position=i, _finish_score=float(i),
                 win_probability=.9 if i==1 else .1/(n-1),
                 podium_probability=.95 if i<6 else .01, data_weight_2026=.9)
            for i in range(1,n+1)]


class CalibrationTests(unittest.TestCase):
    def test_requires_ten_distinct_complete_races(self):
        self.assertIsNone(fit_calibration(history(9), 2025, 11, VERSION))
        fitted = fit_calibration(history(), 2025, 11, VERSION)
        self.assertEqual(fitted['n_races'], 10)
        self.assertEqual(fitted['n_rows'], 200)

    def test_mixed_versions_future_and_late_predictions_do_not_count(self):
        for column, value in [('model_version','other'), ('round',11),
                              ('predicted_at','2025-01-01T12:00:00Z')]:
            rows = history()
            rows.loc[rows['round']==10, column] = value
            self.assertIsNone(fit_calibration(rows, 2025, 11, VERSION))

    def test_incomplete_duplicate_and_invalid_races_are_excluded(self):
        rows = history()
        self.assertIsNone(fit_calibration(rows.iloc[:-1], 2025, 11, VERSION))
        self.assertIsNone(fit_calibration(pd.concat([rows, rows.iloc[-1:]]), 2025, 11, VERSION))
        rows.loc[rows.index[-1], 'actual_position'] = 1
        self.assertIsNone(fit_calibration(rows, 2025, 11, VERSION))

    def test_artifacts_are_versioned_and_strictly_bounded(self):
        fitted = fit_calibration(history(), 2025, 11, VERSION)
        self.assertTrue(calibration_is_valid(fitted, 2025, 11, VERSION))
        self.assertFalse(calibration_is_valid(fitted, 2025, 10, VERSION))
        self.assertFalse(calibration_is_valid(fitted, 2025, 11, 'other'))
        self.assertFalse(calibration_is_valid({'n_rows':200}, 2025, 11, VERSION))

    def test_wrong_curve_falls_back_and_never_uses_current_result(self):
        fitted = fit_calibration(history(), 2025, 11, VERSION)
        fitted['trained_through'] = [2025,11]
        predictions = calibrate(forecast(), fitted)
        self.assertEqual(predictions[0]['calibration_method'], 'shrinkage')

    def test_mixed_forecast_versions_are_rejected(self):
        rows=forecast()
        rows[-1]['model_version']='other'
        with self.assertRaisesRegex(ValueError,'mixed'):
            calibrate(rows)

    def test_non_finite_forecasts_are_rejected(self):
        rows=forecast()
        rows[-1]['win_probability']=float('nan')
        with self.assertRaisesRegex(ValueError,'Invalid raw'):
            calibrate(rows)

    def test_walk_forward_held_out_race_cannot_fit_its_own_curve(self):
        past = history(9)
        self.assertIsNone(fit_calibration(past,2025,10,VERSION))
        # Even if current actuals exist in storage, the target race is excluded.
        with_current = history(10)
        self.assertIsNone(fit_calibration(with_current,2025,10,VERSION))
        learned = fit_calibration(with_current,2025,11,VERSION)
        rows = calibrate(forecast(),learned)
        self.assertEqual(rows[0]['calibration_method'],'isotonic')
        self.assertEqual(rows[0]['calibration_races'],10)
        corrupted = pd.concat([with_current,history(11).query('round == 11')])
        corrupted.loc[corrupted['round']==11,'actual_position'] = 20
        self.assertEqual(learned,fit_calibration(corrupted,2025,11,VERSION))

    def test_isotonic_and_fallback_probabilities_obey_event_constraints(self):
        for fitted in [None, fit_calibration(history(), 2025, 11, VERSION)]:
            rows = calibrate(forecast(), fitted)
            self.assertAlmostEqual(sum(p['win_probability'] for p in rows), 1)
            self.assertAlmostEqual(sum(p['podium_probability'] for p in rows), 3)
            for p in rows:
                self.assertTrue(0 <= p['win_probability'] <= p['podium_probability'] <= 1)
                self.assertIn('raw_win', p)


class DistributionTests(unittest.TestCase):
    def test_entire_pipeline_has_coherent_points_ranking_and_ranges(self):
        rng = np.random.default_rng(42)
        draws = np.array([rng.permutation(np.arange(1,21)) for _ in range(100)])
        simulations = {str(i):draws[:,i-1].tolist() for i in range(1,21)}
        for fitted in [None, fit_calibration(history(),2025,11,VERSION)]:
            rows = finalize(calibrate(forecast(),fitted), simulations, POINTS)
            matrix = np.array([p['position_probabilities'] for p in rows])
            np.testing.assert_allclose(matrix.sum(axis=0), 1, atol=1e-8)
            np.testing.assert_allclose(matrix.sum(axis=1), 1, atol=1e-8)
            self.assertAlmostEqual(sum(p['points_expected'] for p in rows), sum(POINTS.values()), places=6)
            self.assertEqual([p['predicted_position'] for p in rows], list(range(1,21)))
            self.assertEqual([p['expected_finish'] for p in rows], sorted(p['expected_finish'] for p in rows))
            for p in rows:
                marginal = np.array(p['position_probabilities'])
                self.assertAlmostEqual(marginal[0], p['win_probability'])
                self.assertAlmostEqual(marginal[:3].sum(), p['podium_probability'])
                self.assertTrue(1 <= p['finish_p10'] <= p['finish_p90'] <= 20)
            result = metrics(rows, {str(i):i for i in range(1,21)})
            self.assertIn('range_coverage', result)
            self.assertIn('winner_log_loss', result)

    def test_tiny_fields_and_zero_win_curves(self):
        for n in (1,2,3,4):
            rows = forecast(max(2,n))[:n]
            simulations = {str(i):[i]*10 for i in range(1,n+1)}
            rows = finalize(calibrate(rows),simulations,POINTS)
            self.assertAlmostEqual(sum(p['win_probability'] for p in rows),1)
            self.assertAlmostEqual(sum(p['podium_probability'] for p in rows),min(3,n))

    def test_publication_rejects_inconsistent_expected_points(self):
        rows=finalize(calibrate(forecast(4)),{str(i):[i]*10 for i in range(1,5)},POINTS)
        validate_forecast(rows,POINTS)
        rows[0]['points_expected'] += 1
        with self.assertRaisesRegex(ValueError,'disagrees'):
            validate_forecast(rows,POINTS)

    def test_empty_forecast_is_safe(self):
        self.assertEqual(finalize(calibrate([]),{},POINTS),[])

    def test_backtest_metrics_include_final_probabilities(self):
        rows=forecast(4)
        rows=finalize(calibrate(rows),{str(i):[i]*10 for i in range(1,5)},POINTS)
        result=metrics(rows,{str(i):i for i in range(1,5)})
        self.assertAlmostEqual(result['brier'],sum((p['win_probability']-(p['driver_code']=='1'))**2 for p in rows)/4)

if __name__ == '__main__':
    unittest.main()
