import unittest

import numpy as np
import pandas as pd

from robust_features import build


def races(finish_shift=0):
    rows = []
    for rnd in (1, 2, 3):
        for position, (driver, team) in enumerate([("AAA", "T1"), ("BBB", "T1"), ("CCC", "T2"), ("DDD", "T2")], 1):
            finish = position if rnd < 3 else (5 - position + finish_shift)
            rows.append(dict(season=2024, round=rnd, gp_name="x", circuit="C", date=pd.NaT, driver_code=driver, team=team,
                             finish_position=float(finish), points=0.0, status="Finished", quali_pos=float(position),
                             gap_to_pole_ms=100.0 * position, best_ms=90000.0, sprint_pos=np.nan,
                             q_track_temp=30.0, q_air_temp=20.0, q_rain=0))
    return pd.DataFrame(rows)


class RobustFeatureTests(unittest.TestCase):
    def test_features_ignore_the_race_being_predicted_and_later_races(self):
        before = build(races(0))
        after = build(races(finish_shift=2))  # only round 3's results change
        pick = lambda frame, rnd: frame[frame["round"] == rnd].sort_values("driver_code").drop(columns=["finish", "dnf"])
        for rnd in (1, 2, 3):
            pd.testing.assert_frame_equal(pick(before, rnd).reset_index(drop=True), pick(after, rnd).reset_index(drop=True))

    def test_form_features_use_only_earlier_races(self):
        frame = build(races())
        first = frame[frame["round"] == 1].set_index("driver_code")
        second = frame[frame["round"] == 2].set_index("driver_code")
        self.assertEqual(first.loc["AAA", "d_fin"], 11.0)   # no history yet: neutral prior
        self.assertEqual(second.loc["AAA", "d_fin"], 1.0)   # exactly round 1's finish


if __name__ == "__main__":
    unittest.main()
