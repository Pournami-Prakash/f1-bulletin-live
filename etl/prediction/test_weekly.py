import os
from pathlib import Path
import unittest
from unittest.mock import patch

import pandas as pd
import weekly
from asof import bounded_sql


def event(number=1, year=2020):
    return dict(RoundNumber=number, EventName=f"Race {number}",
                Session4="Qualifying", Session4DateUtc=pd.Timestamp(f"{year}-06-06"),
                Session5="Race", Session5DateUtc=pd.Timestamp(f"{year}-06-07"))


class WeeklyTests(unittest.TestCase):
    def test_boundary_supports_existing_ctes_and_preserves_parameters(self):
        with patch.dict(os.environ, {"F1_ASOF_ROUND": "2026:11"}):
            sql = bounded_sql("WITH\npoints AS (SELECT * FROM sessions) SELECT * FROM points WHERE season=%s")
        self.assertIn("FROM public.sessions", sql)
        self.assertIn("round < 11", sql)
        self.assertIn(", points AS", sql)
        self.assertTrue(sql.endswith("season=%s"))

    def execute(self, events, state, *args):
        with patch.object(weekly.fastf1, "get_event_schedule", return_value=pd.DataFrame(events)), \
             patch.object(weekly, "state", side_effect=state), \
             patch.object(weekly, "expected_roster", return_value=set(map(str, range(22)))), \
             patch.object(weekly, "validate_fields"), \
             patch.object(weekly, "validate_qualifying"), \
             patch.object(weekly.sys, "argv", ["weekly.py", "--season", "2020", *args]), \
             patch.object(weekly, "result_urls", return_value={}), \
             patch.object(weekly, "reconcile") as reconcile, \
             patch.object(weekly.psycopg2, "connect"), \
             patch.object(weekly, "run") as run:
            weekly.main()
            self.reconciled = reconcile.call_count
            return run.call_args_list

    def test_manual_refresh_regenerates_existing_pre_race_forecast(self):
        now = pd.Timestamp.now(tz='UTC')
        upcoming = dict(event(), Session4DateUtc=now-pd.Timedelta(hours=3),
                        Session5DateUtc=now+pd.Timedelta(days=1))
        with patch.object(weekly, 'forecast') as forecast:
            self.execute([upcoming], [(0, 22, 22)], '--refresh')
        forecast.assert_called_once_with(2020, 1, False)

    def test_refresh_keeps_completed_forecasts_and_plan_read_only(self):
        with patch.object(weekly, 'forecast') as forecast:
            self.execute([event()], [(22, 22, 22)], '--refresh')
            self.assertEqual(self.execute([event()], [(22, 22, 22)], '--refresh', '--plan'), [])
        forecast.assert_not_called()

    def test_existing_forecast_scored_without_practice(self):
        calls = self.execute([event()], [(22, 0, 22)])
        self.assertEqual(len(calls), 1)
        self.assertIn("--score", calls[0].args)
        self.assertEqual(self.reconciled, 1)

    def test_off_week_waits_without_loading_future_sessions(self):
        self.assertEqual(self.execute([event(year=2099)], [(0, 0, 0)]), [])

    def test_missing_actuals_stops_before_next_round(self):
        with self.assertRaisesRegex(RuntimeError, "refusing to skip ahead"):
            self.execute([event(), event(2)], [(0, 22, 22), (0, 22, 22)])

    def test_completed_roster_uses_official_classification_without_timing_feed(self):
        with patch.object(weekly, 'classification', return_value=[('AAA', 1, 25, 'Finished'), ('BBB', 2, 18, 'Finished')]), \
             patch.object(weekly.fastf1, 'get_session') as timing:
            roster = weekly.expected_roster(2026, 1, event_name='Australian Grand Prix', urls={'australia': 'official'})
        self.assertEqual(roster, {'AAA', 'BBB'})
        timing.assert_not_called()

    def test_partial_timing_roster_cannot_trigger_reingestion(self):
        from unittest.mock import MagicMock
        session = MagicMock()
        session.results = pd.DataFrame({'Abbreviation': [f'A{chr(65+i//26)}{chr(65+i%26)}' for i in range(19)]})
        with patch.object(weekly.fastf1, 'get_session', return_value=session), \
             patch.object(weekly, 'qualifying_bundle', side_effect=RuntimeError('complete qualifying entry list unavailable')):
            with self.assertRaisesRegex(RuntimeError, 'complete qualifying entry list unavailable'):
                weekly.expected_roster(2026, 1)

    def test_backfill_rebuilds_isolated_artifacts_with_same_boundary(self):
        with patch.object(weekly, "run") as run:
            weekly.forecast(2026, 11, True)
            self.assertEqual(run.call_count, 3)
            weather, first, second = run.call_args_list
            self.assertEqual(weather.args[0], "load_quali_weather.py")
            env = first.kwargs["env"]
            self.assertEqual(env["F1_ASOF_ROUND"], "2026:11")
            self.assertEqual(env["F1_BACKFILL"], "1")
            self.assertEqual(env, second.kwargs["env"])
            self.assertFalse(Path(env["F1_FEATURES_DIR"]).exists())
            self.assertNotIn("F1_ASOF_ROUND", os.environ)


if __name__ == "__main__":
    unittest.main()
