import unittest

from neon_intelligence_v2 import lexical_sentiment, matching_entities, sentiment_label, session_for


class NeonIntelligenceV2Tests(unittest.TestCase):
    def test_negation_reverses_positive_term(self):
        self.assertLess(lexical_sentiment("not confident after the failure"), 0)

    def test_sentiment_thresholds(self):
        self.assertEqual(sentiment_label(0.3), "positive")
        self.assertEqual(sentiment_label(-0.3), "negative")
        self.assertEqual(sentiment_label(0.1), "neutral")

    def test_session_classification(self):
        self.assertEqual(session_for("Norris takes pole in qualifying"), "QUALIFYING")
        self.assertEqual(session_for("FP2 pace analysis"), "FP2")
        self.assertEqual(session_for("Team announces sponsor"), "GENERAL")

    def test_entity_matching_avoids_short_ambiguous_terms(self):
        entities = matching_entities("Hamilton and Ferrari face a penalty review")
        self.assertIn(("Lewis Hamilton", "driver"), entities)
        self.assertIn(("Ferrari", "team"), entities)


if __name__ == "__main__":
    unittest.main()
