"""Race-event probabilities with explicit conditioning on elapsed race distance."""
import numpy as np


def first_safety_car_lap(distance, probability, phase_weights, rng=None, after_lap=0):
    """Sample P(any SC)=probability, then its phase and lap.

    after_lap conditions on no safety car having happened through that lap;
    it is not appropriate when an earlier safety car is known to have occurred.
    """
    if distance < 1 or not 0 <= after_lap <= distance:
        raise ValueError('Invalid race distance or elapsed lap')
    if not np.isfinite(probability) or not 0 <= probability <= 1:
        raise ValueError('Safety-car race probability must be in [0, 1]')
    weights = np.asarray(phase_weights, dtype=float)
    if weights.shape != (3,) or not np.isfinite(weights).all() or (weights < 0).any():
        raise ValueError('Safety-car phase weights must be three finite nonnegative values')
    laps = np.arange(1, distance + 1)
    phases = np.where(laps <= distance*.33, 0, np.where(laps <= distance*.67, 1, 2))
    count = np.bincount(phases, minlength=3)
    mass = weights[phases] / count[phases]
    if mass.sum() == 0:
        mass = np.ones(distance)
    mass /= mass.sum()
    remaining = laps > after_lap
    if not remaining.any() or probability == 0:
        return None
    remaining_mass = mass[remaining].sum()
    unobserved = 1-probability*mass[~remaining].sum()
    if unobserved <= 0 or remaining_mass <= 0:
        return None
    conditional_probability = min(1., probability*remaining_mass/unobserved)
    rng = rng or np.random
    if rng.random() >= conditional_probability:
        return None
    return int(rng.choice(laps[remaining], p=mass[remaining]/remaining_mass))
