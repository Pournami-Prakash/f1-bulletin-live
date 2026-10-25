"""Analytic and labelled synthetic fixtures; no synthetic data enters observed storage."""
import copy
import unittest
from unittest.mock import patch

import numpy as np
import pandas as pd

from tyre_observations import normalize, allocation
from tyre_analysis import analyze, fit_stint, strategy_sensitivity
from tyre_challenger import metrics, paired_summary, forecast_pair, TYRE_FEATURES
from robust_model import FEATURES
import tyre_shadow


def payload():
    return dict(sessions=[dict(session_key=1,meeting_key=7,session_name='Practice 3',location='Austin',
                              date_start='2026-10-24T17:30:00Z',date_end='2026-10-24T18:30:00Z')],
                drivers=[dict(session_key=1,driver_number=i,name_acronym=f'AA{chr(65+i)}') for i in range(3)],
                laps=[dict(session_key=1,driver_number=i,lap_number=lap,date_start=f'2026-10-24T17:{30+lap*2:02d}:00Z',
                           lap_duration=90.,is_pit_out_lap=lap==1,duration_sector_1=30.,duration_sector_2=30.,duration_sector_3=30.)
                      for i in range(3) for lap in range(1,10)],
                stints=[dict(session_key=1,driver_number=i,stint_number=1,lap_start=1,lap_end=9,compound='MEDIUM',tyre_age_at_start=3)
                        for i in range(3)],race_control=[],weather=[])


def laps(slope=100., season=2026, number=18, compound='MEDIUM'):
    return [dict(season=season,round=number,circuit='Austin',session_key=1,fp_session='FP2',
                 driver_code=f'AA{chr(65+d)}',stint=1,compound=compound,actual_compound='C3',tyre_spec=f'pirelli-{season}:C3',
                 allocation_source='synthetic fixture',lap_number=i,tyre_life=float(i),lap_time_ms=90000+d*1000+(slope-28)*i,
                 eligible=True,exclusion_reasons=[],track_temp=None,session_time_s=i*90)
            for d in range(3) for i in range(2,16)]


class ObservationTests(unittest.TestCase):
    def test_preserves_source_age_and_fp3_identity(self):
        original=payload();raw=copy.deepcopy(original)
        batch,rows=normalize(raw,2026,18,'2026-10-25T20:00:00Z')
        self.assertEqual(raw,original)
        self.assertEqual(rows[0]['tyre_age_start'],3)
        self.assertEqual(rows[0]['tyre_life'],4)
        self.assertEqual(rows[0]['fp_session'],'FP3')
        self.assertEqual(rows[0]['traffic_status'],'unknown')
        self.assertIn('out_lap_or_unknown',rows[0]['exclusion_reasons'])
        self.assertEqual(batch['id'],normalize(raw,2026,18,'2026-10-25T20:00:00Z')[0]['id'])

    def test_caution_deleted_and_sector_mismatch_are_recorded(self):
        raw=payload()
        raw['race_control']=[dict(session_key=1,date='2026-10-24T17:35:00Z',flag='YELLOW'),
                             dict(session_key=1,date='2026-10-24T17:39:00Z',flag='GREEN'),
                             dict(session_key=1,date='2026-10-24T17:50:00Z',driver_number=1,lap_number=7,message='LAP TIME DELETED')]
        raw['laps'][3]['duration_sector_1']=35.
        _,rows=normalize(raw,2026,18,'2026-10-25T20:00:00Z')
        self.assertIn('caution_overlap_conservative',rows[2]['exclusion_reasons'])
        self.assertIn('sector_consistency',rows[3]['exclusion_reasons'])
        deleted=next(r for r in rows if r['driver_number']==1 and r['lap_number']==7)
        self.assertIn('deleted_lap',deleted['exclusion_reasons'])

    def test_refuses_duplicate_mixed_and_future_sessions(self):
        for mutation in ['duplicate','mixed','future']:
            raw=payload()
            if mutation=='duplicate':raw['laps'].append(raw['laps'][0])
            if mutation=='mixed':raw['weather']=[dict(session_key=9,date='2026-10-24T17:30:00Z')]
            if mutation=='future':raw['sessions'][0]['date_end']='2099-10-25T00:00:00Z'
            with self.assertRaises(ValueError):normalize(raw,2026,18,'2026-10-25T20:00:00Z')

    def test_unknown_age_is_not_filled_with_zero(self):
        raw=payload();raw['stints'][0]['tyre_age_at_start']=None
        _,rows=normalize(raw,2026,18,'2026-10-25T20:00:00Z')
        self.assertIsNone(rows[0]['tyre_life'])
        self.assertIn('missing_or_ambiguous_stint',rows[0]['exclusion_reasons'])

    def test_no_future_weather_interpolation_or_unknown_compound_invention(self):
        raw=payload();raw['weather']=[dict(session_key=1,date='2026-10-24T17:59:00Z',track_temperature=40)]
        _,rows=normalize(raw,2026,18,'2026-10-25T20:00:00Z')
        self.assertIsNone(rows[0]['track_temp'])
        self.assertIsNone(allocation(2026,'Other','HARD')['tyre_spec'])
        self.assertEqual(allocation(2025,'Austin','HARD')['actual_compound'],'C1')
        self.assertEqual(allocation(2026,'Austin','HARD')['actual_compound'],'C2')
        self.assertNotEqual(allocation(2025,'Austin','SOFT')['tyre_spec'],allocation(2026,'Austin','SOFT')['tyre_spec'])
        self.assertIsNone(allocation(2026,'Austin','HARD','2026-01-01T00:00:00Z')['tyre_spec'])


class AnalysisTests(unittest.TestCase):
    def test_recovers_known_slope_and_fuel_derivative(self):
        frame=pd.DataFrame(laps());frame=frame[frame.driver_code=='AAA']
        a=fit_stint(frame,28,draws=30);b=fit_stint(frame,42,draws=30)
        self.assertAlmostEqual(a['raw_slope_ms_per_lap'],100.)
        self.assertAlmostEqual(b['raw_slope_ms_per_lap']-a['raw_slope_ms_per_lap'],14.)
        self.assertAlmostEqual(a['tail_mae_ms'],0.)
        np.testing.assert_allclose(a['conditional_slope_interval_ms'],[100,100])

    def test_negative_fit_is_preserved_with_separate_fallback(self):
        report=analyze(laps(-60),draws=10)
        stint=report['stints'][0]
        self.assertAlmostEqual(stint['raw_slope_ms_per_lap'],-60)
        self.assertEqual(stint['fallback_reason'],'negative_estimate')
        self.assertGreater(stint['selected_rate_ms_per_lap'],0)
        self.assertEqual(len(stint['filter_sensitivity']),3)

    def test_tail_outlier_is_scored_without_future_based_filtering(self):
        frame=pd.DataFrame(laps());frame=frame[frame.driver_code=='AAA'].copy()
        frame.loc[frame.index[-1],'lap_time_ms']+=10000
        fit=fit_stint(frame,draws=5)
        self.assertGreater(fit['tail_mae_ms'],2000)
        self.assertIn('earlier training laps only',fit['tail_screen_basis'])

    def test_does_not_pool_other_seasons_or_compounds(self):
        report=analyze(laps(50)+[{**r,'session_key':2} for r in laps(200,season=2025)],draws=5)
        curves=[c for c in report['curves'] if c['fuel_ms_per_lap']==28]
        self.assertEqual(len(curves),2)
        self.assertEqual({round(c['raw_slope_ms_per_lap']) for c in curves},{50,200})

    def test_missing_identity_is_flagged_and_duplicate_batches_rejected(self):
        rows=laps()
        for r in rows:r['tyre_spec']=None;r['actual_compound']=None
        report=analyze(rows,draws=5)
        self.assertEqual(report['stints'][0]['fallback_reason'],'unknown_compound_identity')
        with self.assertRaises(ValueError):analyze(rows+rows,draws=5)

    def test_pit_window_and_fuel_common_term_have_explicit_assumptions(self):
        report=analyze(laps(70)+[{**r,'session_key':2} for r in laps(40,compound='HARD')],draws=5)
        scenarios=strategy_sensitivity(report,56)
        self.assertTrue(scenarios)
        self.assertTrue(all(5 <= s['best_stop_lap'] <= 51 for s in scenarios))
        self.assertIn('assumed_compound_offsets_ms',scenarios[0])


class ShadowTests(unittest.TestCase):
    def test_future_race_does_not_enter_training(self):
        rows=[]
        for rnd in range(1,21):
            for driver in range(20):
                row={name:float(driver) for name in FEATURES}
                row.update(season=2026,round=rnd,driver_code=f'D{driver}',finish=driver+1)
                row.update({name:float(driver) for name in TYRE_FEATURES})
                rows.append(row)
        data=pd.DataFrame(rows);target=data[data['round']==19].copy()
        result=forecast_pair(data,target)
        self.assertEqual(result['trained_through'],[2026,18])
        self.assertEqual(result['training_rows'],360)
        self.assertEqual(len(result['challenger']),20)
        self.assertAlmostEqual(sum(p['win_probability'] for p in result['challenger']),1)
        self.assertAlmostEqual(sum(p['podium_probability'] for p in result['challenger']),3)
        self.assertIsNone(result['challenger'][0]['finish_p10'])
        history=[dict(season=2026,round=i,actual={f'D{j}':j+1 for j in range(20)},
                      baseline=[dict(driver_code=f'D{j}',predicted_position=j+1) for j in range(20)],
                      challenger=[dict(driver_code=f'D{j}',predicted_position=j+1) for j in range(20)])
                 for i in range(1,11)]
        # A future entry deliberately lacks calibration data: it must be ignored.
        history.append(dict(season=2026,round=20))
        calibrated=forecast_pair(data,target,history)
        self.assertEqual(calibrated['challenger'][0]['range_calibration_races'],10)
        self.assertIsNotNone(calibrated['challenger'][0]['finish_p10'])

    def test_incomplete_results_cannot_score(self):
        predictions=[dict(driver_code='AAA',predicted_position=1,win_probability=.5,podium_probability=1),
                     dict(driver_code='BBB',predicted_position=2,win_probability=.5,podium_probability=1)]
        with self.assertRaises(ValueError):metrics(predictions,{'AAA':1})
        self.assertFalse(paired_summary([])['promotion_approved'])

    def test_scoring_before_race_makes_no_database_calls(self):
        with patch.object(tyre_shadow,'connect') as db:
            with self.assertRaisesRegex(ValueError,'not complete'):
                tyre_shadow.score_event({'race_start_utc':'2099-01-01T00:00:00Z'})
        db.assert_not_called()

    def test_weekly_shadow_failure_does_not_mutate_or_block_published_forecast(self):
        import weekly
        with patch.object(weekly,'run',side_effect=RuntimeError('provider unavailable')) as run:
            weekly.tyre_shadow(2026,18,False)
        self.assertEqual(run.call_count,1)
        self.assertIn('--persist',run.call_args.args)
        self.assertNotIn('--production',run.call_args.args)


if __name__=='__main__':unittest.main()
