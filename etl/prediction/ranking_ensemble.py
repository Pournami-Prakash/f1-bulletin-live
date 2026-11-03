"""Experimental chronological rank stacking, separate from production selection.

Members use a common feature contract. Combining weights see only complete,
earlier out-of-sample race predictions, never in-sample training predictions.
"""
import hashlib
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.optimize import minimize
from sklearn.ensemble import HistGradientBoostingRegressor, RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import HuberRegressor
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

MEMBERS=('robust','season_patterns','pattern_trees','random_forest','xgboost')
PATTERNS=['season_podium_rate','season_win_rate','season_finisher_podium_rate','season_races_log']
MIN_META_RACES=15
SHRINKAGE=.0005


def protocol():
    return dict(version='chronological-rank-stack-v1',members=list(MEMBERS),minimum_meta_races=MIN_META_RACES,
        shrinkage=SHRINKAGE,score_units='within-field rank fraction',
        source_sha256={p.name:hashlib.sha256(p.read_bytes()).hexdigest()
                       for p in [Path(__file__),Path(__file__).with_name('robust_features.py'),
                                 Path(__file__).with_name('robust_model.py')]})


def pattern_features(data):
    stores={};rows=[]
    for _,race in data.groupby(['season','round'],sort=True):
        for r in race.itertuples():
            n,p,w,f,fp=stores.get((r.season,r.driver_code),(0,0,0,0,0))
            rows.append(dict(season=r.season,round=r.round,driver_code=r.driver_code,
                season_podium_rate=(p+1)/(n+7),season_win_rate=(w+.5)/(n+10),
                season_finisher_podium_rate=(fp+1)/(f+7),season_races_log=float(np.log1p(n))))
        for r in race.itertuples():
            if pd.isna(r.finish):continue
            n,p,w,f,fp=stores.get((r.season,r.driver_code),(0,0,0,0,0))
            stores[(r.season,r.driver_code)]=(n+1,p+(r.finish<=3),w+(r.finish==1),
                f+(not r.dnf),fp+((not r.dnf) and r.finish<=3))
    return data.merge(pd.DataFrame(rows),on=['season','round','driver_code'],validate='one_to_one')


def rank_fractions(codes,scores):
    values=np.asarray(scores,float);codes=np.asarray(codes)
    if len(codes)<2 or len(set(codes))!=len(codes) or not np.isfinite(values).all():
        raise ValueError('Complete unique entrants and finite scores required')
    order=np.lexsort((codes,values));rank=np.empty(len(order),float)
    rank[order]=np.arange(len(order))/(len(order)-1)
    return rank


def member_predictions(train,test,features):
    from xgboost import XGBRegressor
    augmented=features+PATTERNS
    def pipe(estimator):
        return make_pipeline(SimpleImputer(strategy='median'),StandardScaler(),estimator)
    models={
        'robust':(features,HuberRegressor(alpha=1.,epsilon=1.35,max_iter=300)),
        'season_patterns':(augmented,HuberRegressor(alpha=1.,epsilon=1.35,max_iter=300)),
        'pattern_trees':(augmented,HistGradientBoostingRegressor(loss='absolute_error',max_iter=100,
            learning_rate=.05,max_leaf_nodes=7,min_samples_leaf=30,l2_regularization=10,
            early_stopping=False,random_state=42)),
        'random_forest':(augmented,RandomForestRegressor(n_estimators=160,max_depth=6,
            min_samples_leaf=15,max_features=.8,n_jobs=1,random_state=42)),
        'xgboost':(augmented,XGBRegressor(n_estimators=120,max_depth=3,learning_rate=.04,
            subsample=.9,colsample_bytree=.9,reg_lambda=15,n_jobs=1,random_state=42)),
    }
    result=pd.DataFrame({'driver_code':test.driver_code.to_numpy()})
    for name,(columns,estimator) in models.items():
        fitted=pipe(estimator).fit(train[columns],train.finish)
        result[name]=rank_fractions(test.driver_code,fitted.predict(test[columns]))
    return result


def validate_history(history,target):
    needed={'season','round','driver_code','actual_position','field_size','out_of_sample',*MEMBERS}
    if not needed.issubset(history.columns):raise ValueError('Missing chronological component history')
    if not history.out_of_sample.eq(True).all():raise ValueError('Only out-of-sample component predictions are allowed')
    if any(key>=target for key in zip(history.season.astype(int),history['round'].astype(int))):
        raise ValueError('Ensemble training history includes target or future outcomes')
    if not np.isfinite(history[list(MEMBERS)].to_numpy(float)).all():raise ValueError('Nonfinite component scores')
    if not history[list(MEMBERS)].ge(0).all().all() or not history[list(MEMBERS)].le(1).all().all():
        raise ValueError('Component scores must be rank fractions')
    for _,race in history.groupby(['season','round']):
        n=len(race)
        if (n<3 or race.driver_code.nunique()!=n or not race.field_size.eq(n).all()
                or set(race.actual_position)!=set(range(1,n+1))):
            raise ValueError('Complete matched component history required')


def fit_weights(history,target):
    prior=np.array([1.,0.,0.,0.,0.])
    if history.empty:
        return dict(weights=dict(zip(MEMBERS,prior)),meta_races=0,status='warmup_robust_only',trained_through=None)
    validate_history(history,target)
    races=history.groupby(['season','round']).ngroups
    through=list(max(zip(history.season.astype(int),history['round'].astype(int))))
    if races<MIN_META_RACES:
        return dict(weights=dict(zip(MEMBERS,prior)),meta_races=races,status='warmup_robust_only',trained_through=through)
    x=history[list(MEMBERS)].to_numpy(float)
    y=(history.actual_position.to_numpy(float)-1)/(history.field_size.to_numpy(float)-1)
    observation_weight=1/history.field_size.to_numpy(float)
    def objective(weights):
        return float(np.average((x@weights-y)**2,weights=observation_weight)+SHRINKAGE*np.square(weights-prior).sum())
    fitted=minimize(objective,prior,method='SLSQP',bounds=[(0.,1.)]*len(MEMBERS),
        constraints=[dict(type='eq',fun=lambda w:w.sum()-1)],options={'maxiter':300,'ftol':1e-12})
    if not fitted.success:raise RuntimeError('Rank ensemble optimizer failed: '+fitted.message)
    weights=np.maximum(fitted.x,0);weights/=weights.sum()
    return dict(weights=dict(zip(MEMBERS,map(float,weights))),meta_races=races,status='experimental_fitted',trained_through=through)


def combine(components,weights):
    if set(weights)!=set(MEMBERS) or set(MEMBERS)-set(components.columns):raise ValueError('Ensemble members differ')
    w=np.array([weights[m] for m in MEMBERS],float)
    if not np.isfinite(w).all() or (w<0).any() or not np.isclose(w.sum(),1):raise ValueError('Invalid ensemble weights')
    x=components[list(MEMBERS)].to_numpy(float)
    if components.driver_code.duplicated().any() or not np.isfinite(x).all():raise ValueError('Invalid current component field')
    return dict(zip(components.driver_code,map(float,x@w)))
