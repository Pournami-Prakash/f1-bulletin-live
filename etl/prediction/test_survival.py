import unittest
import numpy as np
from survival import retirement_probability, fit_weibull

class SurvivalTests(unittest.TestCase):
    def test_lap_risks_reproduce_whole_race_survival(self):
        for shape,scale,distance in [(1.,100.,58),(.8,200.,78),(2.,90.,44)]:
            survival=np.prod([1-retirement_probability(lap-1,lap,shape,scale) for lap in range(1,distance+1)])
            self.assertAlmostEqual(survival,np.exp(-(distance/scale)**shape),places=12)
    def test_live_remaining_survival_is_conditional_on_current_lap(self):
        result=np.prod([1-retirement_probability(lap-1,lap,.8,100.) for lap in range(31,59)])
        self.assertAlmostEqual(result,np.exp(-((58/100)**.8-(30/100)**.8)))
    def test_censored_fit_recovers_synthetic_lifetimes(self):
        rng=np.random.default_rng(42)
        lifetime=2.5*rng.weibull(1.4,10000)
        fitted=fit_weibull(np.minimum(lifetime,1.),lifetime<=1.)
        self.assertAlmostEqual(fitted['shape'],1.4,delta=.12)
        self.assertAlmostEqual(fitted['scale'],2.5,delta=.25)
    def test_zero_failure_legacy_artifact_has_zero_hazard(self):
        self.assertEqual(retirement_probability(57,58,.8,float('inf')),0)

    def test_invalid_intervals_and_empty_fit(self):
        with self.assertRaises(ValueError): retirement_probability(2,1,1,10)
        with self.assertRaises(ValueError): retirement_probability(0,1,0,10)
        self.assertIsNone(fit_weibull([1,1],[False,False]))

class CauseTests(unittest.TestCase):
    def test_unknown_retirements_are_not_assumed_mechanical(self):
        from survival import retirement_cause
        self.assertEqual(retirement_cause('Retired'),'unknown')
        self.assertEqual(retirement_cause('Collision damage'),'incident')
        self.assertEqual(retirement_cause('Engine'),'mechanical')
        self.assertEqual(retirement_cause('+1 Lap'),'finish')
        self.assertEqual(retirement_cause('Disqualified'),'excluded')
