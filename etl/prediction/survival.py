"""Conditional Weibull retirement risk and right-censored lifetime estimation."""
import numpy as np
from scipy.optimize import minimize


def fraction_survival_parameters(rate, shape=.8):
    """Preserve an observed per-race failure rate at race fraction 1.

    Shape remains an explicit assumption, not a fitted lifetime claim.
    """
    if not np.isfinite(rate) or not 0 <= rate <= 1 or not np.isfinite(shape) or shape <= 0:
        raise ValueError('Invalid whole-race failure probability or Weibull shape')
    scale = float('inf') if rate == 0 else (-np.log1p(-min(rate, 1-1e-12)))**(-1/shape)
    return dict(shape=float(shape), scale=float(scale), time_unit='race_fraction',
                dnf_rate=float(rate), method='empirical_race_rate_assumed_shape')


def empirical_fraction_survival(statuses):
    observed=[];excluded=0
    for status in statuses:
        text=str(status).strip() if status is not None else ''
        cause=retirement_cause(text)
        if text.lower() in {'','nan','none','unknown'} or cause=='excluded':
            excluded+=1
        else:
            observed.append(cause!='finish')
    failures=sum(observed)
    return dict(**fraction_survival_parameters(failures/len(observed) if observed else .10),
                n_races=len(observed),n_dnf=failures,n_excluded=excluded)


def race_retirement_probability(entry, previous_lap, current_lap, total_laps):
    if total_laps <= 0 or current_lap > total_laps:
        raise ValueError('Invalid planned race distance')
    shape = entry.get('dnf_shape', .8)
    scale = entry.get('dnf_scale', float('inf'))
    unit = entry.get('dnf_time_unit', 'legacy_58_laps')
    if unit == 'legacy_58_laps':
        # Read old artifacts at their documented 58-lap reference; normalize
        # before applying the target distance. New artifacts never use laps.
        scale /= 58.
    elif unit != 'race_fraction':
        raise ValueError(f'Unknown survival time unit: {unit}')
    return retirement_probability(previous_lap/total_laps, current_lap/total_laps, shape, scale)


def retirement_probability(previous_time, current_time, shape, scale):
    """P(failure in (previous, current] | survived previous); time units must match."""
    if shape <= 0 or scale <= 0 or not np.isfinite([previous_time,current_time,shape]).all() or np.isnan(scale):
        raise ValueError('Survival parameters must be finite with positive shape and scale')
    if previous_time < 0 or current_time < previous_time:
        raise ValueError('Invalid survival time interval')
    if np.isposinf(scale):
        return 0.0  # compatible with legacy artifacts for drivers with zero observed DNFs
    integrated_hazard = (current_time/scale)**shape - (previous_time/scale)**shape
    return float(-np.expm1(-integrated_hazard))


def fit_weibull(times, events):
    """MAP with weak log-parameter regularization; finishers are right-censored.

    Inputs use fraction of scheduled race distance, not raw laps across circuits.
    Returns None if there are too few failures to identify a shape.
    """
    times, events = np.asarray(times,dtype=float), np.asarray(events,dtype=bool)
    valid = np.isfinite(times) & (times > 0)
    times, events = times[valid], events[valid]
    if len(times)<30 or events.sum()<5:
        return None
    log_t = np.log(times)
    def objective(theta):
        shape, scale = np.exp(theta)
        log_h = np.log(shape)-np.log(scale)+(shape-1)*(log_t-np.log(scale))
        hazard = np.exp(np.clip(shape*(log_t-np.log(scale)),-100,100))
        return float(np.sum(hazard-events*log_h)+.05*np.sum(theta**2))
    result = minimize(objective,np.log([1.,5.]),method='L-BFGS-B',bounds=[(-2.3,2.3),(-2.3,8.)])
    if not result.success:
        return None
    shape, scale = np.exp(result.x)
    return dict(shape=float(shape),scale=float(scale),n_observations=len(times),n_failures=int(events.sum()))


def retirement_cause(status):
    """Conservative labels: ambiguous 'Retired' classifications remain unknown."""
    text=str(status).lower()
    if text.strip() in {'dns','dsq','dq','dnq'}:return 'excluded'
    if any(value in text for value in ['disqualified','did not start','withdrawn','did not qualify','excluded']):return 'excluded'
    if 'finished' in text or 'lap' in text:return 'finish'
    if any(value in text for value in ['collision','accident','spun','crash']):return 'incident'
    if any(value in text for value in ['engine','gearbox','transmission','brake','suspension','electrical','power','hydraulic',
                                      'water','oil','fuel','turbo','exhaust','clutch','battery','ers','overheat','wheel','driveshaft','steering']):return 'mechanical'
    return 'unknown'
