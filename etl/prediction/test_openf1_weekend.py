import unittest
from unittest.mock import patch, MagicMock

import pandas as pd
import openf1_weekend as source
import weekly


class OpenF1WeekendTests(unittest.TestCase):
    def setUp(self):
        self.drivers = [{'driver_number': i, 'name_acronym': f'A{chr(65+i//26)}{chr(65+i%26)}'}
                        for i in range(1, 23)]
        self.results = [{'driver_number': i, 'position': i,
                         'duration': [95 + i / 10, 94 + i / 10, 93 + i / 10]}
                        for i in range(1, 23)]

    def test_preserves_segment_times_and_converts_seconds_to_ms(self):
        rows = source.qualifying_rows(self.results, self.drivers, 2026)
        self.assertEqual(len(rows), 22)
        self.assertEqual(rows[0][1:7], (95100, 94100, 93100, 93100, 0, 1))
        self.assertEqual(rows[1][5], 100)

    def test_retains_driver_without_time(self):
        self.results[-1]['duration'] = [None, None, None]
        rows = source.qualifying_rows(self.results, self.drivers, 2026)
        self.assertEqual(len(rows), 22)
        self.assertIsNone(rows[-1][4])
        self.assertEqual(rows[-1][6], 22)

    def test_refuses_partial_or_duplicate_classification(self):
        for results in (self.results[:-1], self.results[:-1] + [self.results[0]]):
            with self.assertRaises(RuntimeError):
                source.qualifying_rows(results, self.drivers, 2026)

    def test_refuses_duplicate_roster_codes(self):
        self.drivers[-1]['name_acronym'] = self.drivers[0]['name_acronym']
        with self.assertRaises(RuntimeError):
            source.qualifying_rows(self.results, self.drivers, 2026)

    def test_fastf1_failure_uses_validated_openf1_roster(self):
        rows = source.qualifying_rows(self.results, self.drivers, 2026)
        with patch.object(weekly.fastf1, 'get_session', side_effect=ValueError('no live timing')), \
             patch.object(weekly, 'qualifying_bundle', return_value=(None, None, rows, [])):
            self.assertEqual(weekly.expected_roster(2026, 18), {row[0] for row in rows})

    def test_refuses_matching_future_qualifying(self):
        source.qualifying_bundle.cache_clear()
        connection = MagicMock()
        connection.__enter__.return_value.cursor.return_value.__enter__.return_value.fetchone.return_value = (
            'United States Grand Prix', 'Austin', 'United States', pd.Timestamp('2099-10-25T20:00:00Z'))
        sessions = [dict(session_name='Race', location='Austin', date_start='2099-10-25T20:00:00Z', meeting_key=1),
                    dict(session_name='Qualifying', date_end='2099-10-24T22:00:00Z', meeting_key=1)]
        with patch.dict(source.os.environ, {'NEON_DATABASE_URL': 'mock'}), \
             patch.object(source.psycopg2, 'connect', return_value=connection), \
             patch.object(source, 'get', return_value=sessions):
            with self.assertRaisesRegex(RuntimeError, 'has not finished'):
                source.qualifying_bundle(2099, 18)
        source.qualifying_bundle.cache_clear()


if __name__ == '__main__':
    unittest.main()
