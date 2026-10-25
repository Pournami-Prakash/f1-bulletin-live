"""Audited chronological replay with simple baselines, single-feature ablations and shuffled controls.

No database or production forecasts are changed. Historical availability is
reconstructed; 2026 has already been inspected and is not an untouched holdout.
"""
import argparse
import hashlib
import json
from pathlib import Path

import pandas as pd

from event_identity import audit
from evaluation_foundations import simple_orders,position_error,error_breakdown,shuffle_practice,paired_positions
from tyre_shadow import historical_rows
from tyre_challenger import practice_features,forecast_pair,metrics,paired_summary,KEYS
from tyre_analysis import dumps,PROTOCOL_VERSION,protocol_manifest

ABLATIONS={'practice_pace_only':['practice_relative_pace'],
           'practice_wear_only':['practice_relative_wear'],
           'practice_coverage_only':['practice_evidence_laps']}
SHUFFLE_SEEDS=(11,29,47)


def replay(data,practice,season,start=1,through=None,controls=True):
    evidence=practice_features(practice)
    data=data.merge(evidence,on=KEYS,how='left',validate='one_to_one')
    shuffled={seed:shuffle_practice(data,seed) for seed in SHUFFLE_SEEDS} if controls else {}
    results,forecasts,range_history=[],[],[]
    for number in sorted(data[data.season.eq(season)]['round'].unique()):
        if number<start or (through is not None and number>through):continue
        mask=(data.season==season)&(data['round']==number)
        target=data[mask].sort_values('driver_code')
        actual=dict(zip(target.driver_code,target.finish.astype(int)))
        prediction=forecast_pair(data,target,range_history)
        comparisons={name:dict(position_mae=position_error(order,actual)) for name,order in simple_orders(target).items()}
        model_forecasts={}
        if controls:
            for name,features in ABLATIONS.items():
                pair=forecast_pair(data,target,tyre_features=features)
                model_forecasts[name]=pair['challenger'];comparisons[name]=metrics(pair['challenger'],actual)
            for seed,perturbed in shuffled.items():
                pair=forecast_pair(perturbed,perturbed[mask].sort_values('driver_code'))
                model_forecasts[f'shuffled_{seed}']=pair['challenger']
                comparisons[f'shuffled_{seed}']=metrics(pair['challenger'],actual)
        row=dict(season=season,round=int(number),kind='exploratory_historical_reconstruction',
                 target_practice_drivers=int(target.practice_relative_pace.notna().sum()),
                 training_practice_races=prediction['training_practice_races'],
                 challenger_status=prediction['challenger_status'],comparisons=comparisons,
                 error_breakdown={name:error_breakdown(prediction[name],target) for name in ['baseline','challenger']},
                 **{name:metrics(prediction[name],actual) for name in ['baseline','challenger']})
        results.append(row);forecasts.append(dict(season=season,round=int(number),controls=model_forecasts,**prediction))
        range_history.append(dict(season=season,round=int(number),actual=actual,
                                  **{name:prediction[name] for name in ['baseline','challenger']}))
    return dict(protocol_version=PROTOCOL_VERSION,protocol=protocol_manifest(),
                controls=dict(ablations=ABLATIONS,shuffle_seeds=list(SHUFFLE_SEEDS),shuffle_unit='joint practice features within each event'),
                selection='fixed before replay; no model promoted automatically',
                limitations=['Retrospective normalized archive; as-issued availability is unproven.',
                             '2026 has been inspected previously; this is not an untouched holdout.',
                             'Refitted robust-family comparison, not the full calibrated published stack.',
                             'Finisher-only evaluation is a post-race diagnostic, not an achievable forecast.',
                             'Event probabilities are uncalibrated. Empirical finish ranges require ten earlier out-of-sample races.'],
                summary=paired_summary(results),
                comparison_summary={name:paired_positions(results,name) for name in results[0]['comparisons']} if results else {},
                races=results,forecasts=forecasts)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data',required=True);parser.add_argument('--season',type=int,default=2026)
    parser.add_argument('--from-round',type=int,default=1);parser.add_argument('--through-round',type=int)
    parser.add_argument('--output',required=True);parser.add_argument('--observations')
    parser.add_argument('--no-controls',action='store_true',help='Quick paired check; omits ablations and negative controls')
    args=parser.parse_args();directory=Path(args.data)
    data=pd.read_parquet(directory/'features.parquet')
    metadata=pd.read_parquet(directory/'races.parquet')[['season','round','gp_name','circuit','date']].drop_duplicates()
    identity=audit(metadata,directory/'openf1_cache')
    if not any(r['season']==args.season for r in identity['verified_events']):
        raise ValueError('Evaluation season has no verified provider event identities')
    observed=json.loads(Path(args.observations).read_text())['observations'] if args.observations else historical_rows(directory)
    result=replay(data,observed,args.season,args.from_round,args.through_round,not args.no_controls)
    result['identity_audit']=identity
    result['input_sha256']={name:hashlib.sha256((directory/name).read_bytes()).hexdigest()
                            for name in ['features.parquet','races.parquet']}
    if args.observations:result['input_sha256']['observations']=hashlib.sha256(Path(args.observations).read_bytes()).hexdigest()
    path=Path(args.output);path.parent.mkdir(parents=True,exist_ok=True);path.write_text(dumps(result)+'\n')
    print(dumps(dict(summary=result['summary'],comparisons=result['comparison_summary'])))


if __name__=='__main__':main()
