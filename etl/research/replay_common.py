"""Shared offline data preparation and paired uncertainty for chronological audits."""
from pathlib import Path
import sys
import numpy as np
import pandas as pd

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'prediction'))
import robust_model


def make_features(directory):
    race,qualifying,sprint,weather,laps=[pd.read_parquet(directory/(name+'.parquet'))
        for name in ('race','qualifying','sprint','weather','laps')]
    if ((race.season>2026)|((race.season==2026)&race['round'].ge(19))).any():
        raise ValueError('Audit snapshot contains Mexico or later outcomes')
    frame=race.merge(qualifying,on=['season','round','driver_code'],how='left',validate='one_to_one')
    frame=frame.merge(sprint,on=['season','round','driver_code'],how='left',validate='one_to_one')
    frame=frame.merge(weather,on=['season','round'],how='left',validate='many_to_one')
    return robust_model.build(frame,robust_model.race_pace(laps)),race,qualifying


def positions(codes,scores):
    order=np.lexsort((np.asarray(codes),np.asarray(scores)))
    result=np.empty(len(order),int);result[order]=np.arange(1,len(order)+1)
    return result


def block_interval(delta):
    delta=np.asarray(delta,float)
    if not len(delta):raise ValueError('Paired race errors required')
    rng=np.random.default_rng(42);samples=[]
    for _ in range(5000):
        starts=rng.integers(0,len(delta),int(np.ceil(len(delta)/3)))
        index=np.concatenate([(start+np.arange(3))%len(delta) for start in starts])[:len(delta)]
        samples.append(float(delta[index].mean()))
    return list(map(float,np.quantile(samples,[.025,.975])))
