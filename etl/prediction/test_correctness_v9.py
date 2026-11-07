import unittest
import json
from pathlib import Path
from unittest.mock import patch

import numpy as np
import pandas as pd

import predict
from robust_features import build
from simulation_events import first_safety_car_lap
from survival import fraction_survival_parameters, race_retirement_probability, empirical_fraction_survival
from test_robust_features import races


class CorrectnessV9Tests(unittest.TestCase):
    def test_team_state_is_race_mean_and_independent_of_teammate_qualifying_order(self):
        data=races();changed=data.copy()
        changed.loc[(changed['round']==1)&changed.driver_code.eq('AAA'),'quali_pos']=2
        changed.loc[(changed['round']==1)&changed.driver_code.eq('BBB'),'quali_pos']=1
        first=build(data);second=build(changed)
        columns=['t_fin','t_delta','t_q','t_dnf','t_pace']
        pick=lambda f:f[f['round']==2].sort_values('driver_code')[columns].reset_index(drop=True)
        pd.testing.assert_frame_equal(pick(first),pick(second))
        self.assertEqual(first[first['round'].eq(2)&first.driver_code.eq('AAA')].iloc[0].t_fin,1.5)

    def test_safety_car_probability_zero_one_and_event_frequency(self):
        rng=np.random.default_rng(42)
        self.assertTrue(all(first_safety_car_lap(58,0,[1,1,1],rng) is None for _ in range(20)))
        self.assertTrue(all(first_safety_car_lap(58,1,[1,1,1],rng) is not None for _ in range(20)))
        occurrence=np.mean([first_safety_car_lap(58,.37,[1,1,1],rng) is not None for _ in range(10000)])
        self.assertAlmostEqual(occurrence,.37,delta=.02)
        self.assertTrue(all(first_safety_car_lap(60,1,[1,0,0],rng)<=19 for _ in range(100)))

    def test_safety_car_live_conditioning_uses_remaining_probability_mass(self):
        rng=np.random.default_rng(7)
        # These phase weights make every lap equally likely, independently
        # giving P(future event | no event through half distance)=1/3.
        probability=np.mean([first_safety_car_lap(60,.5,[19,21,20],rng,after_lap=30) is not None for _ in range(10000)])
        self.assertAlmostEqual(probability,1/3,delta=.02)
        self.assertIsNone(first_safety_car_lap(60,1,[1,1,1],rng,after_lap=60))
        with self.assertRaises(ValueError):first_safety_car_lap(58,1.1,[1,1,1],rng)

    def test_whole_race_reliability_is_independent_of_lap_count(self):
        parameters=fraction_survival_parameters(.12)
        entry=dict(dnf_shape=parameters['shape'],dnf_scale=parameters['scale'],dnf_time_unit='race_fraction')
        for laps in [44,58,71,78]:
            survival=np.prod([1-race_retirement_probability(entry,lap-1,lap,laps) for lap in range(1,laps+1)])
            self.assertAlmostEqual(1-survival,.12,places=12)
            remainder=np.prod([1-race_retirement_probability(entry,lap-1,lap,laps) for lap in range(laps//2+1,laps+1)])
            self.assertAlmostEqual(remainder,np.exp(-((1/entry['dnf_scale'])**.8-((laps//2/laps)/entry['dnf_scale'])**.8)))

    def test_legacy_survival_artifacts_are_read_at_reference_probability(self):
        legacy=dict(dnf_shape=.8,dnf_scale=200.)
        expected=1-np.exp(-(58/200)**.8)
        for distance in [44,78]:
            risk=1-np.prod([1-race_retirement_probability(legacy,lap-1,lap,distance) for lap in range(1,distance+1)])
            self.assertAlmostEqual(risk,expected,places=12)

    def test_reliability_excludes_dns_disqualification_and_missing_status(self):
        result=empirical_fraction_survival(['Finished','+1 Lap','Retired','Engine','DNS','Disqualified',None])
        self.assertEqual((result['n_races'],result['n_dnf'],result['n_excluded']),(4,2,3))
        self.assertEqual(result['dnf_rate'],.5)
        self.assertEqual(empirical_fraction_survival(['DNS'])['dnf_rate'],.10)

    def test_fast_car_can_recover_without_posthoc_classification_cap(self):
        entries=[dict(driver_code=f'A{chr(65+i//26)}{chr(65+i%26)}',team='Test',circuit='Test',grid_position=i+1,
            elo_rating=1500,start_compound='HARD',gap_to_pole_sec=-5. if i==21 else 0.,rolling_avg_finish=2.,
            avg_pit_stops=0.,arw_effectiveness=100.,dnf_scale=float('inf'),dnf_shape=1.,sc_race_probability=0.,
            first_stop_median_lap=1000.,team_strength=10.5) for i in range(22)]
        with patch.object(predict,'MC_RUNS',1),patch.object(predict.np.random,'random',return_value=.5), \
             patch.object(predict.np.random,'normal',return_value=0.):
            result=predict.simulate_race(entries,race_distance=30)
        self.assertEqual(result[entries[-1]['driver_code']],[1])
        self.assertEqual(sorted(r[0] for r in result.values()),list(range(1,23)))

    def test_registered_future_review_matches_current_protocol(self):
        from tyre_analysis import protocol_manifest
        policy=json.loads(Path(__file__).with_name('prospective_policy.json').read_text())
        self.assertEqual(policy['protocol'],protocol_manifest())
        archived=json.loads(Path(__file__).with_name('prospective_policy_v1.json').read_text())
        self.assertNotEqual(policy['protocol'],archived['protocol'])


if __name__=='__main__':unittest.main()
