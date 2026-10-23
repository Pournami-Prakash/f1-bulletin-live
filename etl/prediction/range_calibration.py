"""Chronological empirical correction of simulated finish intervals.

Inspired by conformal interval nonconformity scores, but driver outcomes within
a race are dependent and seasons drift. Race-balanced empirical coverage is a
target, not an exchangeability-based finite-sample coverage guarantee.
"""
import math
import numpy as np
import pandas as pd

MIN_RACES = 10
MAX_RACES = 40
TARGET = .8
RAW_METHOD = 'simulation_quantiles_v1'
SCHEMA = 1


def fit_range_calibration(history, season, round_, model_version):
    required = ['season','round','model_version','driver_code','actual_position',
                'predicted_at','race_start_utc','expected_drivers',
                'raw_finish_p10','raw_finish_p90','raw_range_method']
    if 'backfill' in model_version or history.empty or not set(required).issubset(history.columns):
        return None
    frame = history.copy()
    earlier = (frame.season < season) | ((frame.season == season) & (frame['round'] < round_))
    frame = frame[earlier & frame.model_version.eq(model_version)
                  & frame.raw_range_method.eq(RAW_METHOD)]
    frame = frame.dropna(subset=required)
    frame = frame[pd.to_datetime(frame.predicted_at,utc=True,errors='coerce')
                  < pd.to_datetime(frame.race_start_utc,utc=True,errors='coerce')]
    complete = []
    for key,race in frame.groupby(['season','round'],sort=True):
        numeric = race[['expected_drivers','actual_position','raw_finish_p10','raw_finish_p90']].to_numpy(float)
        if not np.isfinite(numeric).all():
            continue
        n = int(race.expected_drivers.iloc[0])
        if (n<3 or not race.expected_drivers.eq(n).all() or len(race)!=n
                or race.driver_code.nunique()!=n or set(race.actual_position)!=set(range(1,n+1))
                or not race.raw_finish_p10.between(1,n).all()
                or not race.raw_finish_p90.between(1,n).all()
                or not (numeric[:,2:]==np.floor(numeric[:,2:])).all()
                or not (race.raw_finish_p10<=race.raw_finish_p90).all()):
            continue
        score = np.maximum.reduce([race.raw_finish_p10.to_numpy()-race.actual_position.to_numpy(),
                                   race.actual_position.to_numpy()-race.raw_finish_p90.to_numpy(),
                                   np.zeros(n)]) / (n-1)
        complete.append((key,score))
    complete = complete[-MAX_RACES:]
    races = len(complete)
    if races < MIN_RACES:
        return None
    # Equal race weight prevents a 22-driver field outweighing a 20-driver field.
    values = np.concatenate([score for _,score in complete])
    weights = np.concatenate([np.full(len(score),1/(races*len(score))) for _,score in complete])
    order = np.argsort(values,kind='stable')
    # Conservative order-statistic adjustment uses races, not driver-row count.
    level = min(1.,math.ceil((races+1)*TARGET)/races)
    index = min(np.searchsorted(np.cumsum(weights[order]),level,side='left'),len(values)-1)
    return dict(schema=SCHEMA,model_version=model_version,raw_range_method=RAW_METHOD,
                n_races=races,trained_through=list(map(int,complete[-1][0])),target_coverage=TARGET,
                padding_fraction=float(values[order[index]]))


def apply_range_calibration(predictions, calibrator=None):
    if not predictions:
        return predictions
    first=predictions[0]
    keys=['season','round','model_version']
    if (len({p['driver_code'] for p in predictions})!=len(predictions)
            or any(any(p[k]!=first[k] for k in keys) for p in predictions)):
        raise ValueError('Mixed or duplicate range forecast')
    valid=False
    try:
        valid=(calibrator['schema']==SCHEMA and calibrator['model_version']==first['model_version']
               and calibrator['raw_range_method']==RAW_METHOD
               and MIN_RACES<=calibrator['n_races']<=MAX_RACES
               and tuple(calibrator['trained_through'])<(first['season'],first['round'])
               and calibrator['target_coverage']==TARGET
               and np.isfinite(calibrator['padding_fraction'])
               and 0<=calibrator['padding_fraction']<=1)
    except (KeyError,TypeError,ValueError):
        pass
    n=len(predictions)
    padding=int(np.ceil(calibrator['padding_fraction']*(n-1)-1e-12)) if valid else 0
    for p in predictions:
        # Reapplying must not calibrate an already expanded interval again.
        low=p.get('raw_finish_p10',p['finish_p10'])
        high=p.get('raw_finish_p90',p['finish_p90'])
        if (not np.isfinite([low,high]).all() or not 1<=low<=high<=n
                or low!=int(low) or high!=int(high)):
            raise ValueError('Invalid raw finish range')
        p.update(raw_finish_p10=int(low),raw_finish_p90=int(high),raw_range_method=RAW_METHOD,
                 finish_p10=max(1,int(low)-padding),finish_p90=min(n,int(high)+padding),
                 range_basis='simulation_calibrated' if valid else 'simulation',
                 range_target_coverage=TARGET,range_calibration_method='historical_expansion' if valid else 'unadjusted',
                 range_calibration_races=calibrator['n_races'] if valid else 0,range_padding=padding)
    return predictions
