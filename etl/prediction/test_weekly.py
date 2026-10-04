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

    def execute(self, events, state):
        with patch.object(weekly.fastf1, "get_event_schedule", return_value=pd.DataFrame(events)), \
             patch.object(weekly, "state", side_effect=state), \
             patch.object(weekly.sys, "argv", ["weekly.py", "--season", "2020"]), \
             patch.object(weekly, "run") as run:
            weekly.main()
            return run.call_args_list

    def test_existing_forecast_scored_without_practice(self):
        calls = self.execute([event()], [(22, 0, 22)])
        self.assertEqual(len(calls), 1)
        self.assertIn("--score", calls[0].args)

    def test_off_week_waits_without_loading_future_sessions(self):
        self.assertEqual(self.execute([event(year=2099)], [(0, 0, 0)]), [])

    def test_missing_actuals_stops_before_next_round(self):
        with self.assertRaisesRegex(RuntimeError, "refusing to skip ahead"):
            self.execute([event(), event(2)], [(0, 22, 22), (0, 22, 22)])

    def test_backfill_rebuilds_isolated_artifacts_with_same_boundary(self):
        with patch.object(weekly, "run") as run:
            weekly.forecast(2026, 11, True)
            self.assertEqual(run.call_count, 2)
            first, second = run.call_args_list
            env = first.kwargs["env"]
            self.assertEqual(env["F1_ASOF_ROUND"], "2026:11")
            self.assertEqual(env["F1_BACKFILL"], "1")
            self.assertEqual(env, second.kwargs["env"])
            self.assertFalse(Path(env["F1_FEATURES_DIR"]).exists())
            self.assertNotIn("F1_ASOF_ROUND", os.environ)


if __name__ == "__main__":
    unittest.main()
