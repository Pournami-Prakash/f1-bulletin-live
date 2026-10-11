import unittest
from datetime import datetime, timezone

import pandas as pd

from neon_calendar_sync import calendar_rows


class CalendarTests(unittest.TestCase):
    def test_metadata_follows_race_identity_after_renumbering(self):
        event = {"EventName": "Singapore Grand Prix", "RoundNumber": 17}
        for i, session in enumerate(["Practice 1", "Sprint Qualifying", "Sprint", "Qualifying", "Race"], 1):
            event[f"Session{i}"] = session
            event[f"Session{i}Date"] = pd.Timestamp("2026-10-11 20:00:00+08:00")
            event[f"Session{i}DateUtc"] = pd.Timestamp("2026-10-11 12:00:00")
        old = [{"race_name": "Singapore Grand Prix", "round": 16, "season": 2026,
                "circuit_name": "Marina Bay", "race_laps": 62}]
        row = calendar_rows(pd.DataFrame([event]), old, datetime(2026, 10, 11, 15, tzinfo=timezone.utc))[0]
        self.assertEqual(row["round"], 17)
        self.assertEqual(row["race_laps"], 62)
        self.assertTrue(row["is_sprint_weekend"])
        self.assertFalse(row["is_completed"])
        self.assertIsNone(row["fp2_date"])

    def test_unknown_race_fails_without_guessing_metadata(self):
        schedule = pd.DataFrame([{"EventName": "New Grand Prix", "RoundNumber": 1}])
        with self.assertRaisesRegex(ValueError, "events differ"):
            calendar_rows(schedule, [], datetime.now(timezone.utc))


if __name__ == "__main__":
    unittest.main()
