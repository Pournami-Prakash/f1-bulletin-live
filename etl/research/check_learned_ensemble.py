"""Fixed chronological comparison of corrected robust ranking and rank stacks.

Offline only. Mexico is excluded; retrospective results cannot automatically
promote the experimental --ranking-source learned route to production.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sys

for name in ('OPENBLAS_NUM_THREADS','OMP_NUM_THREADS','MKL_NUM_THREADS'):
    os.environ.setdefault(name,'1')
import numpy as np
import pandas as pd
from replay_common import make_features,positions,block_interval
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'prediction'))
import robust_model as model
from ranking_ensemble import pattern_features,member_predictions,fit_weights,combine,protocol,MEMBERS


def run(source,output):
    output.mkdir(parents=True,exist_ok=True)
    manifest=dict(member_protocol=protocol(),
        audit_source_sha256={p.name:hashlib.sha256(p.read_bytes()).hexdigest()
                             for p in [Path(__file__),Path(__file__).with_name('replay_common.py')]},
        input_sha256={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(source.glob('*.parquet'))},
        evaluation=dict(seasons=[2023,2024,2025,2026],last_2026_round=18,
        source='Corrected feature-state pipeline; matched complete fields only',
        methods=list(MEMBERS)+['equal_weight','learned_stack'],
        meta_training='Only earlier complete out-of-sample component forecasts; minimum 15 races',
        selection='Exploratory only; no automatic promotion or probability-model claim'))
    policy=output/'protocol.json'
    if policy.exists() and json.loads(policy.read_text())!=manifest:raise ValueError('Changed protocol: use fresh output')
    policy.write_text(json.dumps(manifest,indent=2)+'\n')
    data,race,q=make_features(source);data=pattern_features(data)
    history=[];rows=[];metrics=[];weights=[];excluded=[]
    for (season,number),test in data[data.season.ge(2023)].groupby(['season','round'],sort=True):
        target=(int(season),int(number));n=22 if season==2026 else 20
        actual=race[race.season.eq(season)&race['round'].eq(number)]
        quali=q[q.season.eq(season)&q['round'].eq(number)]
        if (len(test)!=n or len(actual)!=n or len(quali)!=n or actual.driver_code.nunique()!=n
                or quali.driver_code.nunique()!=n or set(quali.driver_code)!=set(test.driver_code)
                or set(actual.finish_position.dropna())!=set(range(1,n+1))
                or set(quali.quali_pos.dropna())!=set(range(1,n+1))):
            excluded.append(list(target));continue
        train=data[(data.season<season)|((data.season==season)&data['round'].lt(number))]
        components=member_predictions(train,test,model.FEATURES)
        learned=fit_weights(pd.DataFrame(history),target)
        weights.append(dict(season=target[0],round=target[1],**learned))
        score=combine(components,learned['weights'])
        alternatives={m:components[m].to_numpy() for m in MEMBERS}
        alternatives['equal_weight']=components[list(MEMBERS)].mean(axis=1).to_numpy()
        alternatives['learned_stack']=np.array([score[c] for c in test.driver_code])
        for name,values in alternatives.items():
            ranking=positions(test.driver_code,values);observed=test.finish.to_numpy(int)
            errors=abs(ranking-observed)
            metrics.append(dict(season=target[0],round=target[1],method=name,position_mae=float(errors.mean()),
                podium_hits=int(((ranking<=3)&(observed<=3)).sum())))
            for i,r in enumerate(test.itertuples()):
                rows.append(dict(season=target[0],round=target[1],method=name,driver_code=r.driver_code,
                    predicted=int(ranking[i]),actual=int(observed[i]),position_error=int(errors[i])))
        # Outcomes become available to the meta model only after this prediction.
        for i,r in enumerate(test.itertuples()):
            history.append(dict(season=target[0],round=target[1],driver_code=r.driver_code,actual_position=int(r.finish),
                field_size=n,out_of_sample=True,**{m:float(components.iloc[i][m]) for m in MEMBERS}))
        print(f'Ensemble replay {season} R{number}: {learned["meta_races"]} earlier meta races',flush=True)
    frame=pd.DataFrame(rows);metric=pd.DataFrame(metrics)
    frame.to_csv(output/'driver_replays.csv',index=False);metric.to_csv(output/'race_metrics.csv',index=False)
    pd.DataFrame(history).to_csv(output/'component_history.csv',index=False)
    (output/'weights.json').write_text(json.dumps(weights,indent=2)+'\n')
    def summary(season=None):
        select=metric if season is None else metric[metric.season.eq(season)]
        baseline=select[select.method.eq('robust')].set_index(['season','round'])
        out={}
        for method,g in select.groupby('method',sort=False):
            delta=g.set_index(['season','round']).position_mae-baseline.position_mae
            drivers=frame[frame.method.eq(method)]
            if season is not None:drivers=drivers[drivers.season.eq(season)]
            ant=drivers[drivers.driver_code.eq('ANT')]
            out[method]=dict(races=len(g),position_mae=float(g.position_mae.mean()),delta_vs_robust=float(delta.mean()),
                paired_block_interval=block_interval(delta),podium_hits_per_race=float(g.podium_hits.mean()),
                antonelli=dict(races=len(ant),position_mae=float(ant.position_error.mean()) if len(ant) else None,
                    podium_hits=int((ant.predicted.le(3)&ant.actual.le(3)).sum()),actual_podiums=int(ant.actual.le(3).sum())))
        return out
    verification='Independent earlier-audit snapshot not supplied; chronology/complete-field checks still enforced'
    previous_path=source.parent/'adaptation-mechanisms-2026-11-02-verified-fields'/'driver_replays.csv'
    if previous_path.exists():
        previous=pd.read_csv(previous_path)
        previous=previous[previous.season.eq(2026)&previous.method.eq('team_race_mean')]
        current=frame[frame.season.eq(2026)&frame.method.eq('robust')]
        matched=current.merge(previous[['round','driver_code','predicted']],on=['round','driver_code'],validate='one_to_one',suffixes=('_now','_before'))
        assert len(matched)==374 and matched.predicted_now.eq(matched.predicted_before).all()
        verification='374 corrected team-mean rankings match independent prior audit'
    results=dict(manifest=manifest,baseline_reproduction=verification,
        overall=summary(),by_season={str(s):summary(s) for s in [2023,2024,2025,2026]},excluded=excluded,
        final_weights=weights[-1],production_promotion=False,
        limitations=['2026 was previously inspected; no untouched holdout.',
            'Rank-only ensemble: no claim about improved probability calibration.',
            'New common-feature RF/XGBoost members differ from legacy feature-engineering ML models.',
            'No Mexico outcomes, database access, or saved forecast changes.'])
    (output/'report.json').write_text(json.dumps(results,indent=2,allow_nan=False)+'\n')
    print(json.dumps(results['by_season']['2026'],indent=2))


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input',type=Path,default=Path('artifacts/tyre-analysis/ranking-behavior-2026-11-02'))
    parser.add_argument('--output',type=Path,default=Path('artifacts/tyre-analysis/learned-ensemble-2026-11-03-final'))
    args=parser.parse_args();run(args.input,args.output)
