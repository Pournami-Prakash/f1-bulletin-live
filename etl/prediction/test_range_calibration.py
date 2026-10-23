import copy
import json
import unittest
import numpy as np
import pandas as pd
from range_calibration import fit_range_calibration, apply_range_calibration, RAW_METHOD

VERSION='prod_v7_calibrated_robust_ridge_mc'


def history(rounds=10):
    return pd.DataFrame([dict(season=2025,round=r,model_version=VERSION,driver_code=str(i),
        actual_position=i,expected_drivers=20,raw_finish_p10=5,raw_finish_p90=10,
        raw_range_method=RAW_METHOD,predicted_at='2025-01-01T10:00:00Z',race_start_utc='2025-01-01T12:00:00Z')
        for r in range(1,rounds+1) for i in range(1,21)])


def forecast(n=20):
    return [dict(season=2025,round=11,model_version=VERSION,driver_code=str(i),
                 finish_p10=min(5,n),finish_p90=min(10,n),predicted_position=i,
                 win_probability=1/n,podium_probability=min(3,n)/n,points_expected=2.)
            for i in range(1,n+1)]


class RangeCalibrationTests(unittest.TestCase):
    def test_minimum_is_complete_distinct_races_not_driver_rows(self):
        self.assertIsNone(fit_range_calibration(history(9),2025,11,VERSION))
        self.assertIsNone(fit_range_calibration(history().iloc[:-1],2025,11,VERSION))
        rows=history()
        self.assertIsNone(fit_range_calibration(pd.concat([rows,rows.iloc[-1:]]),2025,11,VERSION))
        fitted=fit_range_calibration(rows,2025,11,VERSION)
        self.assertEqual(fitted['n_races'],10)
        json.dumps(fitted)

    def test_future_current_other_version_late_and_wrong_method_are_excluded(self):
        for column,value in [('round',11),('model_version','other'),
                             ('predicted_at','2025-01-01T12:00:00Z'),('raw_range_method','coherent'),
                             ('actual_position',1),('raw_finish_p10',float('nan')),
                             ('raw_finish_p90',3),('raw_finish_p10',1.5)]:
            rows=history()
            if column=='raw_finish_p10':
                rows[column]=rows[column].astype(float)
            rows.loc[rows['round']==10,column]=value
            self.assertIsNone(fit_range_calibration(rows,2025,11,VERSION),column)

    def test_target_outcome_cannot_change_its_own_padding(self):
        earlier=history()
        fitted=fit_range_calibration(earlier,2025,11,VERSION)
        with_current=history(11)
        with_current.loc[with_current['round']==11,'actual_position']=20
        self.assertEqual(fitted,fit_range_calibration(with_current,2025,11,VERSION))

    def test_ranges_expand_and_keep_rank_points_and_probabilities(self):
        fitted=fit_range_calibration(history(),2025,11,VERSION)
        rows=forecast()
        original=copy.deepcopy(rows)
        output=apply_range_calibration(rows,fitted)
        self.assertGreater(output[0]['range_padding'],0)
        self.assertEqual(output[0]['range_basis'],'simulation_calibrated')
        for before,after in zip(original,output):
            for key in ['predicted_position','win_probability','podium_probability','points_expected']:
                self.assertEqual(before[key],after[key])
            self.assertTrue(1<=after['finish_p10']<=before['finish_p10'])
            self.assertTrue(before['finish_p90']<=after['finish_p90']<=len(rows))
        self.assertEqual(output,apply_range_calibration(copy.deepcopy(output),fitted))

    def test_stale_wrong_version_or_invalid_artifact_leaves_nominal_range(self):
        good=fit_range_calibration(history(),2025,11,VERSION)
        variants=[None]
        for key,value in [('trained_through',[2025,11]),('model_version','other'),
                          ('padding_fraction',float('nan')),('padding_fraction',-1),('n_races',9)]:
            changed=copy.deepcopy(good);changed[key]=value;variants.append(changed)
        for fitted in variants:
            row=apply_range_calibration(forecast(),fitted)[0]
            self.assertEqual((row['finish_p10'],row['finish_p90']),(5,10))
            self.assertEqual(row['range_calibration_method'],'unadjusted')

    def test_raw_bounds_not_expanded_bounds_are_preserved(self):
        good=fit_range_calibration(history(),2025,11,VERSION)
        row=apply_range_calibration(forecast(),good)[0]
        self.assertEqual((row['raw_finish_p10'],row['raw_finish_p90']),(5,10))
        self.assertEqual(row['raw_range_method'],RAW_METHOD)

    def test_field_size_adjusts_normalized_padding_and_clips_bounds(self):
        good=fit_range_calibration(history(),2025,11,VERSION)
        for n in [1,2,3,20,22]:
            rows=apply_range_calibration(forecast(n),good)
            for row in rows:
                self.assertTrue(1<=row['finish_p10']<=row['finish_p90']<=n)

    def test_mixed_forecasts_and_invalid_bounds_are_rejected(self):
        rows=forecast();rows[-1]['model_version']='other'
        with self.assertRaisesRegex(ValueError,'Mixed'):
            apply_range_calibration(rows)
        rows=forecast();rows[0]['finish_p10']=21
        with self.assertRaisesRegex(ValueError,'Invalid raw'):
            apply_range_calibration(rows)


if __name__=='__main__':unittest.main()
