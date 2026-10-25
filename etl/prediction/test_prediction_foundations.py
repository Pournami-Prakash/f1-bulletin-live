"""Regression tests for physical symmetry, routing, identity and evaluation controls."""
import copy
import unittest
from unittest.mock import patch
import numpy as np
import pandas as pd
import predict
from event_identity import resolve
from evaluation_foundations import simple_orders,position_error,error_breakdown,shuffle_practice
from tyre_challenger import TYRE_FEATURES


def entries():
    return [dict(driver_code=code,team='Test',circuit='Test',grid_position=i,elo_rating=1500,
                 start_compound='SOFT',gap_to_pole_sec=0.,rolling_avg_finish=2.,confidence=.5,
                 avg_pit_stops=1.,arw_effectiveness=100.,dnf_scale=float('inf'),dnf_shape=1.,
                 sc_race_probability=0.,first_stop_median_lap=1.)
            for i,code in enumerate(['AAA','BBB','CCC'],1)]


class SimulatorFoundationTests(unittest.TestCase):
    def test_coherent_postprocessing_reports_its_final_ranking_route(self):
        rows=[dict(driver_code='AAA',ranking_source='robust')]
        with patch.object(predict,'apply_calibration',return_value=rows), \
             patch.object(predict,'finalize',return_value=rows),patch.object(predict,'validate_forecast'):
            result=predict.finalize_predictions(rows,{})
        self.assertEqual(result[0]['ranking_source'],'coherent_distribution')
        self.assertEqual(result[0]['pre_reconciliation_ranking_source'],'robust')

    def test_common_fuel_cancels_and_fitted_curves_apply_symmetrically(self):
        e={x['driver_code']:x for x in entries()[:2]}
        base={'AAA':0.,'BBB':-400.};compound=dict.fromkeys(e,'SOFT');age=dict.fromkeys(e,5);rank=dict.fromkeys(e,1)
        artifact={'tyre_deg_gp':{'Test':{'SOFT':{'linear':140.,'quad':2.}}}}
        with patch.object(predict,'traffic_tyre_factor',return_value=1.):
            early=predict.lap_paces(e,base,compound,age,rank,1,56,artifact)
            late=predict.lap_paces(e,base,compound,age,rank,55,56,artifact)
        self.assertAlmostEqual(early['AAA']-early['BBB'],400.)
        self.assertAlmostEqual(late['AAA']-late['BBB'],400.)
        self.assertAlmostEqual(early['AAA'],140*5+2*25+55*28)

    def test_post_stop_compound_and_age_are_used_for_both_cars(self):
        e={x['driver_code']:x for x in entries()[:2]};base=dict.fromkeys(e,0.)
        artifact={'tyre_deg_gp':{'Test':{'SOFT':{'linear':200.},'HARD':{'linear':20.}}}}
        with patch.object(predict,'traffic_tyre_factor',return_value=1.):
            pace=predict.lap_paces(e,base,{'AAA':'HARD','BBB':'SOFT'},{'AAA':0,'BBB':5},dict.fromkeys(e,1),10,56,artifact)
        self.assertAlmostEqual(pace['BBB']-pace['AAA'],1000.)

    def test_simulation_is_deterministic_under_input_permutation_and_has_full_fields(self):
        with patch.object(predict,'MC_RUNS',25):
            np.random.seed(34);a=predict.simulate_race(entries(),race_distance=20)
            np.random.seed(34);b=predict.simulate_race(list(reversed(entries())),race_distance=20)
        self.assertEqual(a,b)
        for draw in zip(*a.values()):self.assertEqual(sorted(draw),[1,2,3])

    def test_no_overtakes_under_safety_car(self):
        e=entries()
        for row in e:row['early_sc_probability']=1.;row['sc_race_probability']=1.
        with patch.object(predict,'MC_RUNS',1),patch.object(predict.np.random,'random',return_value=.1), \
             patch.object(predict.np.random,'randint',return_value=8):
            result=predict.simulate_race(e,race_distance=1)
        self.assertEqual([result[x][0] for x in ['AAA','BBB','CCC']],[1,2,3])

    def test_faster_car_recovers_without_an_artificial_early_fuel_barrier(self):
        e=entries();e[-1]['gap_to_pole_sec']=-5.
        with patch.object(predict,'MC_RUNS',1),patch.object(predict.np.random,'random',return_value=.5), \
             patch.object(predict.np.random,'normal',return_value=0.):
            result=predict.simulate_race(e,race_distance=2)
        self.assertEqual(result['CCC'],[1])

    def test_ranking_route_is_explicit_and_simulation_changes_can_reach_order(self):
        e=entries();sims={'AAA':[1]*10,'BBB':[2]*10,'CCC':[3]*10}
        robust={code:dict(score=score,win=1/3,podium=1.) for code,score in [('AAA',3),('BBB',2),('CCC',1)]}
        a=predict.compute_predictions(e,sims,dict.fromkeys(sims,1/3),2026,18,'Test',robust=robust)
        b=predict.compute_predictions(e,sims,dict.fromkeys(sims,1/3),2026,18,'Test',robust=robust,ranking_source='simulation')
        self.assertEqual(a[0]['driver_code'],'CCC');self.assertEqual(a[0]['ranking_source'],'robust')
        self.assertEqual(b[0]['driver_code'],'AAA');self.assertEqual(b[0]['ranking_source'],'simulation')
        self.assertEqual(b[0]['simulation_version'],predict.SIMULATION_VERSION)
        with self.assertRaises(ValueError):predict.compute_predictions(e,sims,{},2026,18,'Test',ranking_source='robust')
        with self.assertRaisesRegex(ValueError,'complete entrant field'):
            predict.compute_predictions(e,sims,{},2026,18,'Test',robust={'AAA':robust['AAA']})


class IdentityTests(unittest.TestCase):
    def test_cancelled_duplicate_is_not_the_relocated_race(self):
        meetings=[dict(meeting_key=1,meeting_name='Bahrain Grand Prix',is_cancelled=True),
                  dict(meeting_key=2,meeting_name='Bahrain Grand Prix',is_cancelled=False)]
        sessions=[dict(meeting_key=2,session_key=5,session_name='Race',date_start='2026-10-04T07:00:00Z',
                       location='Kuala Lumpur',circuit_short_name='Kuala Lumpur')]
        race=dict(gp_name='Bahrain Grand Prix',date='2026-10-04',circuit='Kuala Lumpur')
        meeting,session=resolve(race,meetings,sessions)
        self.assertEqual(meeting['meeting_key'],2);self.assertEqual(session['session_key'],5)
        with self.assertRaises(ValueError):resolve(dict(race,circuit='Sakhir'),meetings,sessions)
        with self.assertRaises(ValueError):resolve(dict(race,date='2026-04-10'),meetings,sessions)


class EvaluationTests(unittest.TestCase):
    def frame(self):
        return pd.DataFrame([dict(season=2026,round=1,driver_code=code,grid=grid,d_fin=form,finish=finish,status=status,
                                  **dict(zip(TYRE_FEATURES,[i,i*2,np.nan if i==2 else i*4])))
                            for i,(code,grid,form,finish,status) in enumerate([
                                ('AAA',1,2,3,'Retired'),('BBB',2,1,1,'Finished'),('CCC',3,3,2,'Lapped')])])

    def test_simple_baselines_use_same_roster_and_error_split_is_post_race(self):
        data=self.frame();order=simple_orders(data)['qualifying'];actual=dict(zip(data.driver_code,data.finish))
        self.assertAlmostEqual(position_error(order,actual),4/3)
        report=error_breakdown(order,data)
        self.assertEqual(report['groups']['retired_or_other_nonfinish']['drivers'],1)
        self.assertEqual(report['finisher_relative_order_mae'],0.)
        self.assertEqual(report['groups']['finished']['absolute_error'],2)

    def test_shuffle_preserves_joint_evidence_and_does_not_touch_outcomes(self):
        data=self.frame();shuffled=shuffle_practice(data,11)
        pd.testing.assert_frame_equal(data.drop(columns=TYRE_FEATURES),shuffled.drop(columns=TYRE_FEATURES))
        np.testing.assert_allclose(np.sort(data[TYRE_FEATURES].to_numpy(),axis=0),
                                   np.sort(shuffled[TYRE_FEATURES].to_numpy(),axis=0),equal_nan=True)
        pd.testing.assert_frame_equal(shuffled,shuffle_practice(data,11))
        future=data.assign(round=20);extended=shuffle_practice(pd.concat([data,future],ignore_index=True),11)
        pd.testing.assert_frame_equal(shuffled.reset_index(drop=True),extended.iloc[:3].reset_index(drop=True))


if __name__=='__main__':unittest.main()
