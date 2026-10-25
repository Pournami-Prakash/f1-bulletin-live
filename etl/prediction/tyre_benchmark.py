"""Paired chronological exploratory replay of the frozen tyre-feature challenger.

No source data is fetched and no database or published forecast is changed.
Local research archives are retrospective, not proof of as-issued availability.
"""
import argparse
import json
from pathlib import Path

import pandas as pd

from tyre_shadow import historical_rows
from tyre_challenger import practice_features, forecast_pair, metrics, paired_summary, KEYS
from tyre_analysis import dumps, PROTOCOL_VERSION, protocol_manifest


def replay(data, practice, season, start=1, through=None):
    evidence = practice_features(practice)
    data = data.merge(evidence,on=KEYS,how='left',validate='one_to_one')
    results, forecasts, range_history = [], [], []
    for number in sorted(data[data.season.eq(season)]['round'].unique()):
        if number < start or (through is not None and number > through): continue
        target = data[(data.season==season)&(data['round']==number)].sort_values('driver_code')
        actual = dict(zip(target.driver_code,target.finish.astype(int)))
        prediction = forecast_pair(data,target,range_history)
        row = dict(season=season,round=int(number),kind='exploratory_historical_reconstruction',
                   target_practice_drivers=int(target.practice_relative_pace.notna().sum()),
                   training_practice_races=prediction['training_practice_races'],
                   challenger_status=prediction['challenger_status'],
                   **{name:metrics(prediction[name],actual) for name in ['baseline','challenger']})
        results.append(row);forecasts.append(dict(season=season,round=int(number),**prediction))
        range_history.append(dict(season=season,round=int(number),actual=actual,
                                  **{name:prediction[name] for name in ['baseline','challenger']}))
    return dict(protocol_version=PROTOCOL_VERSION, protocol=protocol_manifest(), selection='fixed before this replay; no tuning in this command',
                limitations=['Retrospective normalized archive; availability is reconstructed.',
                             '2026 has been inspected previously; this is not an untouched holdout.',
                             'Compares refitted robust-family models, not the full calibrated published stack.',
                             'Event probabilities are uncalibrated. Finish ranges require ten earlier out-of-sample race forecasts; empirical coverage is evaluated without a distribution-free guarantee.'],
                summary=paired_summary(results), races=results, forecasts=forecasts)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data',required=True);parser.add_argument('--season',type=int,default=2026)
    parser.add_argument('--from-round',type=int,default=1);parser.add_argument('--through-round',type=int)
    parser.add_argument('--output',required=True)
    parser.add_argument('--observations',help='Versioned normalized observations exported by tyre_history.py')
    args=parser.parse_args();directory=Path(args.data)
    data=pd.read_parquet(directory/'features.parquet')
    observed=json.loads(Path(args.observations).read_text())['observations'] if args.observations else historical_rows(directory)
    result=replay(data,observed,args.season,args.from_round,args.through_round)
    path=Path(args.output);path.parent.mkdir(parents=True,exist_ok=True);path.write_text(dumps(result)+'\n')
    print(dumps(result['summary']))


if __name__=='__main__':main()
