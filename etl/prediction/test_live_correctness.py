import unittest
from unittest.mock import patch

import pandas as pd

import live_repredict as live


class LiveCorrectnessTests(unittest.TestCase):
    def test_session_resolution_uses_venue_date_and_active_status(self):
        sessions=[dict(session_key=1,session_name='Race',location='Mexico City',date_start='2026-11-01T20:00:00Z',is_cancelled=True),
                  dict(session_key=2,session_name='Race',location='Mexico City',date_start='2026-11-01T20:00:00Z'),
                  dict(session_key=3,session_name='Race',location='Abu Dhabi',date_start='2026-12-01T20:00:00Z')]
        calendar=pd.DataFrame([dict(city='Mexico City',race_start_utc=pd.Timestamp('2026-11-01T20:00:00Z'))])
        with patch.object(live,'openf1_get',return_value=sessions),patch.object(live,'query',return_value=calendar):
            self.assertEqual(live.get_session_key(2026,19),2)
        with patch.object(live,'openf1_get',return_value=sessions[-1:]),patch.object(live,'query',return_value=calendar):
            self.assertIsNone(live.get_session_key(2026,19))

    def test_live_state_retains_safety_car_history_planned_distance_and_driver_identity(self):
        endpoints={
            'drivers':[dict(driver_number=50,name_acronym='HIR')],
            'position':[dict(driver_number=50,position=18,date='2026-11-01T20:15:00Z')],
            'laps':[dict(lap_number=10)],'stints':[],
            'race_control':[dict(message='SAFETY CAR DEPLOYED',date='2026-11-01T20:05:00Z'),
                            dict(message='SAFETY CAR ENDED',date='2026-11-01T20:10:00Z')],
        }
        with patch.object(live,'get_session_key',return_value=77), \
             patch.object(live,'openf1_get',side_effect=lambda endpoint,params:endpoints[endpoint]), \
             patch.object(live,'get_target_race',return_value=(2026,19,'Mexico City Grand Prix','Mexico City')), \
             patch.object(live,'get_race_distance',return_value=71):
            state=live.fetch_live_state(2026,19)
        self.assertEqual(state['total_laps'],71)
        self.assertTrue(state['safety_car_seen'])
        self.assertFalse(state['safety_car_active'])
        self.assertEqual(state['positions'][0]['driver_code'],'HIR')

    def test_seen_safety_car_is_not_conditioned_as_never_having_happened(self):
        entries=[dict(driver_code=c,team='Test',circuit='Test',grid_position=i,elo_rating=1500,
            start_compound='HARD',arw_effectiveness=.3,dnf_scale=float('inf'),dnf_shape=1.,sc_race_probability=0.)
            for i,c in enumerate(['AAA','BBB','CCC'],1)]
        state=dict(current_lap=8,total_laps=10,safety_car_active=False,safety_car_seen=True,
                   positions=[dict(driver_code=e['driver_code'],position=e['grid_position'],tyre='HARD',tyre_age=2,dnf=False) for e in entries])
        with patch.object(live,'MC_RUNS',3),patch.object(live,'first_safety_car_lap',side_effect=AssertionError('Must not condition on no earlier SC')):
            result=live.simulate_from_live(entries,state,{})
        for draw in zip(*result.values()):self.assertEqual(sorted(draw),[1,2,3])


if __name__=='__main__':unittest.main()
