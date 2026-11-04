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

    def test_missing_or_invalid_positions_raise_actionable_error(self):
        for position in (None, '22', True, 1, 23):
            with self.subTest(position=position):
                self.results[-1]['position'] = position
                with self.assertRaisesRegex(RuntimeError, 'positions are incomplete'):
                    source.qualifying_rows(self.results, self.drivers, 2026)

    def official_rows(self):
        return [[str(i), str(i), 'Driver' + self.drivers[i-1]['name_acronym'], 'Team',
                 '1:35.100', '1:34.100', '1:33.100', '10'] for i in range(1, 23)]

    def official(self, rows):
        with patch.object(source, 'result_urls', return_value={'mexico': 'https://example.com/mexico/race-result'}), \
             patch.object(source, 'fetch', return_value=MagicMock(rows=rows)) as fetch:
            result = source.official_qualifying_rows(2026, ('Mexico City Grand Prix',), self.drivers)
        fetch.assert_called_once_with('https://example.com/mexico/qualifying')
        return result

    def test_official_qualifying_retains_disqualified_driver_at_end(self):
        rows = self.official_rows()
        rows[-1][0] = 'DQ'
        rows[-1][4:7] = ['', '1:17.207', '1:17.029']
        result = self.official(rows)
        self.assertEqual(len(result), 22)
        self.assertEqual(result[-1][0], self.drivers[-1]['name_acronym'])
        self.assertEqual(result[-1][1:5], (None, 77207, 77029, 77029))
        self.assertEqual(result[-1][6], 22)

    def test_official_qualifying_supplies_debutant_team_without_race_results(self):
        rows = self.official_rows()
        rows[-1][2:4] = ['Ryo HirakawaHIR', 'Haas F1 Team']
        expected = [d['name_acronym'] for d in self.drivers[:-1]] + ['HIR']
        with patch.object(source, 'official_qualifying_url', return_value='qualifying'), \
             patch.object(source, 'fetch', return_value=MagicMock(rows=rows)):
            self.assertEqual(source.official_qualifying_teams(2026, 'Mexico City Grand Prix', expected)['HIR'],
                             'Haas F1 Team')
            with self.assertRaisesRegex(RuntimeError, 'differs from entrants'):
                source.official_qualifying_teams(2026, 'Mexico City Grand Prix', expected[:-1])

    def test_missing_no_time_entrant_team_uses_pre_race_grid_metadata(self):
        rows = self.official_rows()
        expected = [d['name_acronym'] for d in self.drivers]
        grid = [r[:4]+[''] for r in rows]
        with patch.object(source, 'official_qualifying_url', return_value='https://example.com/qualifying'), \
             patch.object(source, 'fetch', side_effect=[MagicMock(rows=rows[:-1]),MagicMock(rows=grid)]) as fetch:
            teams = source.official_qualifying_teams(2026, 'Australian Grand Prix', expected)
        self.assertEqual(set(teams),set(expected))
        self.assertEqual(fetch.call_args_list[-1].args[0],'https://example.com/starting-grid')

    def test_official_qualifying_rejects_partial_duplicate_or_mismatched_field(self):
        for kind in ('partial', 'duplicate', 'mismatched', 'excluded_middle', 'invalid_time'):
            rows = self.official_rows()
            if kind == 'partial':
                rows.pop()
            elif kind == 'duplicate':
                rows[-1] = rows[0]
            elif kind == 'mismatched':
                rows[-1][2] = 'WrongXYZ'
            elif kind == 'excluded_middle':
                rows[0][0] = 'DQ'
            else:
                rows[0][4] = 'unpublished'
            with self.subTest(kind=kind), self.assertRaises(RuntimeError):
                self.official(rows)

    def test_incomplete_openf1_classification_uses_official_qualifying(self):
        source.qualifying_bundle.cache_clear()
        self.addCleanup(source.qualifying_bundle.cache_clear)
        connection = MagicMock()
        calendar = ('Mexico City Grand Prix', 'Mexico City', 'Mexico', pd.Timestamp('2020-11-01T20:00:00Z'))
        connection.__enter__.return_value.cursor.return_value.__enter__.return_value.fetchone.return_value = calendar
        sessions = [dict(session_name='Race', location='Mexico City', date_start='2020-11-01T20:00:00Z', meeting_key=1),
                    dict(session_name='Qualifying', date_end='2020-10-31T22:00:00Z', meeting_key=1, session_key=2)]
        self.results[-1]['position'] = None
        official = self.official(self.official_rows())
        with patch.dict(source.os.environ, {'NEON_DATABASE_URL': 'mock'}), \
             patch.object(source.psycopg2, 'connect', return_value=connection), \
             patch.object(source, 'get', side_effect=[sessions, self.drivers, self.results]), \
             patch.object(source, 'official_qualifying_rows', return_value=official) as fallback:
            self.assertEqual(source.qualifying_bundle(2026, 19)[2], official)
        fallback.assert_called_once_with(2026, calendar, self.drivers)

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
