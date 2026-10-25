"""Simple baselines, post-race error attribution and within-event negative controls."""
import hashlib
import numpy as np
import pandas as pd

from tyre_challenger import TYRE_FEATURES


def simple_orders(target):
    scores={'qualifying':target.grid.to_numpy(float),
            'driver_form':target.d_fin.to_numpy(float),
            'grid_plus_form':(target.grid.to_numpy(float)+target.d_fin.to_numpy(float))/2}
    output={}
    for name,score in scores.items():
        order=np.lexsort((target.driver_code.to_numpy(),score))
        rank=np.empty(len(target),int);rank[order]=np.arange(1,len(target)+1)
        output[name]=[dict(driver_code=code,predicted_position=int(r)) for code,r in zip(target.driver_code,rank)]
    return output


def position_error(predictions,actual):
    if {p['driver_code'] for p in predictions}!=set(actual) or set(actual.values())!=set(range(1,len(actual)+1)):
        raise ValueError('Baseline requires the same complete classified field')
    return float(np.mean([abs(p['predicted_position']-actual[p['driver_code']]) for p in predictions]))


def error_breakdown(predictions,target):
    indexed=target.set_index('driver_code');groups={};finishers=[];per_driver=[]
    for p in predictions:
        row=indexed.loc[p['driver_code']];status=str(row.get('status','')).lower()
        group=('unknown_status' if status in {'','nan','none'} else 'disqualified' if 'disqual' in status or status in {'dq','dsq'}
               else 'not_started' if 'did not start' in status or status=='dns'
               else 'finished' if 'finished' in status or 'lap' in status else 'retired_or_other_nonfinish')
        error=abs(p['predicted_position']-float(row.finish))
        groups.setdefault(group,[]).append(error)
        if group=='finished':finishers.append((p['driver_code'],p['predicted_position'],float(row.finish)))
        per_driver.append(dict(driver_code=p['driver_code'],predicted_position=p['predicted_position'],
                               actual_position=int(row.finish),qualifying_position=float(row.grid),
                               absolute_error=error,status=str(row.get('status','')),error_group=group))
    result={name:dict(drivers=len(values),position_mae=float(np.mean(values)),absolute_error=float(sum(values)))
            for name,values in groups.items()}
    if finishers:
        actual_order={code:i+1 for i,(code,_,_) in enumerate(sorted(finishers,key=lambda x:(x[2],x[0])))}
        predicted=sorted(finishers,key=lambda x:(x[1],x[0]))
        conditional=float(np.mean([abs(i+1-actual_order[code]) for i,(code,_,_) in enumerate(predicted)]))
    else:conditional=None
    return dict(groups=result,finisher_relative_order_mae=conditional,per_driver=per_driver,
                scope='post-race diagnostic only; survivor selection must never enter forecast features',
                unassigned_causes=['strategy','traffic','penalty mistakes','mechanical versus incident retirement'],
                grid_basis='qualifying classification; not a verified post-penalty starting-grid record')


def shuffle_practice(frame,seed):
    result=frame.copy()
    for key,group in frame.groupby(['season','round'],sort=True):
        digest=hashlib.sha256(f'{seed}:{key}'.encode()).digest()
        rng=np.random.default_rng(int.from_bytes(digest[:8],'big'))
        # Joint permutation preserves feature covariance and missingness counts,
        # but breaks which driver owns the observation within that weekend.
        result.loc[group.index,TYRE_FEATURES]=group[TYRE_FEATURES].to_numpy()[rng.permutation(len(group))]
    return result


def paired_positions(rows,name,seed=42):
    differences=np.array([r['comparisons'][name]['position_mae']-r['baseline']['position_mae'] for r in rows],float)
    if not len(differences):return dict(races=0)
    rng=np.random.default_rng(seed);block=min(3,len(differences));samples=[]
    for _ in range(2000):
        starts=rng.integers(0,len(differences),int(np.ceil(len(differences)/block)))
        ix=np.concatenate([(s+np.arange(block))%len(differences) for s in starts])[:len(differences)]
        samples.append(float(differences[ix].mean()))
    return dict(races=len(rows),position_mae=float(np.mean([r['comparisons'][name]['position_mae'] for r in rows])),
                delta_vs_robust=float(differences.mean()),paired_race_block_interval=np.quantile(samples,[.025,.975]).tolist())
