import unittest
import sys
import numpy as np
import pandas as pd
from ranking_ensemble import MEMBERS,fit_weights,combine,rank_fractions,pattern_features
from test_robust_features import races
from robust_features import build
import predict
from unittest.mock import patch


def history(races_count=20):
    records=[]
    for number in range(1,races_count+1):
        for position in range(1,5):
            records.append(dict(season=2025,round=number,driver_code=str(position),actual_position=position,
                field_size=4,out_of_sample=True,**{m:(position-1)/3 if m=='season_patterns' else (4-position)/3 for m in MEMBERS}))
    return pd.DataFrame(records)


class RankingEnsembleTests(unittest.TestCase):
    def test_weights_are_nonnegative_normalized_and_learn_only_from_prior_predictions(self):
        fit=fit_weights(history(),(2026,1))
        self.assertAlmostEqual(sum(fit['weights'].values()),1.)
        self.assertTrue(all(w>=0 for w in fit['weights'].values()))
        self.assertGreater(fit['weights']['season_patterns'],.9)
        self.assertEqual(fit['trained_through'],[2025,20])

    def test_warmup_is_explicit_robust_fallback(self):
        fit=fit_weights(history(2),(2026,1))
        self.assertEqual(fit['status'],'warmup_robust_only')
        self.assertEqual(fit['weights']['robust'],1.)

    def test_future_in_sample_or_partial_fields_cannot_train_stack(self):
        with self.assertRaisesRegex(ValueError,'target or future'):fit_weights(history(),(2025,20))
        with self.assertRaisesRegex(ValueError,'out-of-sample'):fit_weights(history().assign(out_of_sample=False),(2026,1))
        with self.assertRaisesRegex(ValueError,'Complete matched'):fit_weights(history().iloc[:-1],(2026,1))
        with self.assertRaisesRegex(ValueError,'Nonfinite'):fit_weights(history().assign(xgboost=np.nan),(2026,1))

    def test_members_can_change_final_score_and_invalid_weights_are_rejected(self):
        current=pd.DataFrame({'driver_code':['AAA','BBB','CCC'],**{m:[0,.5,1] for m in MEMBERS}})
        current['season_patterns']=[1,.5,0]
        weights=dict.fromkeys(MEMBERS,0.);weights['season_patterns']=1.
        combined=combine(current,weights)
        self.assertEqual(min(combined,key=combined.get),'CCC')
        weights['robust']=-1
        with self.assertRaisesRegex(ValueError,'Invalid ensemble'):combine(current,weights)

    def test_patterns_cannot_see_target_outcomes(self):
        before=pattern_features(build(races()));after=pattern_features(build(races(finish_shift=2)))
        columns=['season_podium_rate','season_win_rate','season_finisher_podium_rate','season_races_log']
        pd.testing.assert_frame_equal(before[columns],after[columns])
        np.testing.assert_allclose(rank_fractions(['CCC','AAA','BBB'],[1,1,3]),[.5,0,1])

    def test_explicit_learned_route_changes_order_and_records_actual_weights(self):
        codes=['AAA','BBB','CCC']
        entries=[dict(driver_code=c,circuit='Test',team='Test',grid_position=i+1,
            confidence=.5,elo_rating=1500,gap_to_pole_sec=0.,rolling_avg_finish=2.) for i,c in enumerate(codes)]
        sims={c:[i+1]*10 for i,c in enumerate(codes)}
        robust={c:dict(score=i+1,win=1/3,podium=1.,
            ensemble_scores={m:(2-i)/2 if m=='season_patterns' else i/2 for m in MEMBERS}) for i,c in enumerate(codes)}
        weights=dict.fromkeys(MEMBERS,0.);weights['season_patterns']=1.
        output=predict.compute_predictions(entries,sims,dict.fromkeys(codes,1/3),2026,18,'Test',
            robust=robust,ranking_source='learned',ensemble_weights=weights)
        self.assertEqual(output[0]['driver_code'],'CCC')
        self.assertEqual(output[0]['ranking_weights'],weights)
        self.assertEqual(output[0]['ranking_source'],'learned')

    def test_learned_cli_cannot_publish_experimental_forecasts(self):
        with patch.object(sys,'argv',
                          ['predict.py','--ranking-source','learned','--production','--ensemble-history','history.csv']), \
             patch.object(predict,'load_artifacts') as load:
            with self.assertRaises(SystemExit) as error:predict.main()
        self.assertEqual(error.exception.code,2)
        load.assert_not_called()


if __name__=='__main__':unittest.main()
