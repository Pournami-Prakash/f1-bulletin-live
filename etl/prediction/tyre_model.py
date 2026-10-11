"""Conservative tyre-age slopes with within-stint pace and fuel correction."""
import numpy as np
import pandas as pd

# Explicit modelling assumption; validate sensitivity in chronological backtests.
FUEL_MS_PER_LAP = 28.0
DEFAULT_DEG = {'SOFT': 80.0, 'MEDIUM': 55.0, 'HARD': 35.0}


def fit_tyre_curve(laps, compound):
    frame = laps.sort_values(['season', 'round', 'driver_code', 'lap_number']).copy()
    groups = ['season', 'round', 'driver_code']
    previous = frame.groupby(groups)['tyre_life'].shift()
    changed = frame.groupby(groups)['compound'].shift() != frame['compound']
    frame['_stint'] = (previous.isna() | (frame['tyre_life'] <= previous) | changed).cumsum()
    clean = frame[(frame['compound'] == compound) & (frame['tyre_life'] > 1)
                  & frame['pit_in_time_ms'].isna() & frame['pit_out_time_ms'].isna()].copy()
    clean['_adjusted'] = clean['lap_time_ms'] + FUEL_MS_PER_LAP * clean['lap_number']
    slopes = []
    for _, stint in clean.groupby('_stint'):
        stint = stint.dropna(subset=['tyre_life', '_adjusted'])
        if len(stint) < 6 or stint['tyre_life'].max() - stint['tyre_life'].min() < 5:
            continue
        # Subtract each stint's pace, keeping different cars/races from defining wear.
        x = stint['tyre_life'].to_numpy(dtype=float)
        y = stint['_adjusted'].to_numpy(dtype=float)
        x -= x.mean()
        y -= np.median(y)
        slope = float(np.dot(x, y) / np.dot(x, x))
        if np.isfinite(slope):
            slopes.append(slope)
    estimate = float(np.median(slopes)) if len(slopes) >= 3 else float('nan')
    supported = np.isfinite(estimate) and 0 <= estimate <= 300
    return {'quad': 0.0, 'linear': round(estimate if supported else DEFAULT_DEG[compound], 3),
            'n_laps': len(clean), 'n_stints': len(slopes),
            'method': 'within_stint_fuel_adjusted' if supported else 'conservative_fallback'}
