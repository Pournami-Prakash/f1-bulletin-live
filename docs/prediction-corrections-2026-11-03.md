# Prediction correctness v9 and learned-ensemble evaluation

The v9 changes correct state/event semantics independently of model selection.
They do not claim that a more realistic simulator necessarily scores better on
an inspected retrospective dataset. Saved pre-race forecasts and Mexico's
existing historical reconstruction are preserved.

## Corrections

- Team form, qualifying, pace, and nonfinish states update once from the team
  race mean. Which teammate qualified first no longer changes the team's next
  state. Driver states still update separately after that race's features emit.
- Safety-car occurrence is sampled once with the configured race-event
  probability. Its first lap follows the configured phase distribution.
  Repeat events are conditional on a first event, so they cannot inflate the
  probability of any event. Chaos no longer rescales that first-event probability.
- Live SC conditioning distinguishes an already-observed safety car from no
  earlier event. Live race identity and planned distance are resolved from the
  calendar rather than selecting the latest session or assuming Miami's distance.
- The post-race recovery cap is removed. Classification follows the simulated
  running order and retirement distance; no finishing positions are imposed
  after the simulation to limit recovery.
- Retirement curves use race-fraction time units. The same observed whole-race
  rate therefore gives the same whole-race probability at 44, 58, 71, or 78 laps.
  Live remaining risk is conditional on distance already survived. The old
  58-lap reference is used only to read legacy artifacts, never to inflate risk
  at a new circuit. New empirical estimates exclude DNS/disqualification and
  missing-status observations. Weibull shape remains an explicit assumption.
- Default Monte Carlo draws increase from 500 to 5,000. `--simulations` exposes
  the budget for controlled experiments; more draws reduce sampling noise, not
  uncertainty about the model's assumptions.
- New forecasts use a distinct `v9` namespace and `race_fraction_events_v2`
  simulation identifier, keeping old calibration history separate.

The qualifying fixes also handle missing OpenF1 positions without sorting nulls
against integers, use the official classification when complete, and preserve
disqualified entrants. Debutant team metadata can fall back to the official
pre-race starting-grid page when the qualifying table omits no-time entrants.
No race-result position is substituted for missing qualifying evidence.

## Model routing is explicit

The default remains the corrected robust ranking, with separate event
probability estimates. XGBoost/Ridge and Random Forest fits are skipped when
their positions would be discarded. They run for explicit `blend` ranking,
when the robust model is unavailable, or with `--collect-components` for
diagnostics. Forecast details record actual component scores and ranking weights.

The site's method description follows the selected route, including explicit
simulation, blend, coherent-distribution, and experimental learned routes.
It no longer treats every future robust-family model version as an unknown
method or labels a blend as pure robust order.

## Learned ensemble: implemented, not promoted

The experimental rank stack combines corrected robust, season-pattern Huber,
nonlinear pattern, Random Forest, and XGBoost members. These RF/XGBoost members
share the ranking-feature contract; they are not interchangeable with the
legacy large-feature simulation/ML blend.

Base models refit before each target race. Combining weights are nonnegative,
sum to one, and are trained only on complete earlier out-of-sample component
forecasts. There is a 15-race meta-training warmup and shrinkage toward robust
ranking. Feature/member source hashes must match the supplied history. Target,
future, partial-field, nonfinite, and in-sample histories are rejected.

The comparison used 79 complete races from 2023 through 2026 round 18. The 2026
cohort contains 17 races and 374 driver entries. Mexico outcomes are excluded.
All components are compared on the same corrected feature states and fields.

| Ranking policy | 2026 position error | ANT podium hits / 14 |
| --- | ---: | ---: |
| Corrected robust | 3.358 | 9 |
| Equal-weight stack | 3.353 | 12 |
| Learned stack | **3.342** | 11 |
| Standalone pattern Huber | 3.380 | 12 |
| Standalone nonlinear patterns | 3.401 | 12 |
| Standalone Random Forest | 3.369 | 11 |
| Standalone XGBoost | 3.439 | 11 |

The learned stack's error change is -0.016 positions, with a paired three-race
block 95% interval of [-0.064, +0.043]. Across all 79 races, error changes from
3.138 to 3.131, also with an interval spanning zero. These are small,
exploratory improvements, not a supported production promotion. This experiment
optimizes ranking only and makes no probability-calibration claim.

For example, the weights learned before round 18 are approximately 62.3%
robust, 23.4% Random Forest, and 14.3% nonlinear patterns. Pattern Huber and
XGBoost receive effectively zero. Their presence in the candidate pool does
not require giving them weight when earlier forecasts do not support it.

The `learned` CLI route requires `--dry-run` and a compatible
`--ensemble-history` CSV. It cannot publish experimental predictions.

## Corrected simulator checks

Matched-input checks reuse the exact pre-v9 source/input snapshot for 16 earlier
2026 races, at 500 draws per event to isolate correctness changes. Default v9
end-to-end forecasting was separately exercised at 5,000 draws.

- Mean configured safety-car occurrence is 50.6%; corrected simulated occurrence
  is 50.5%, versus 36.9% before the event-probability fix.
- A deterministic fast-car counterexample now recovers from P22 to P1 without
  a post-hoc classification adjustment. Every draw still has unique ranks.
- Whole-race survival and conditional remaining survival are invariant to the
  target's lap count when expressed as race fractions.
- Raw simulation ranking error worsens from 3.545 to 3.631 in this sample.
  It therefore does not replace robust order. Corrected robust/MC-prior podium
  Brier changes from 0.06787 to 0.06761; its paired interval includes no gain.

The model still uses heuristic pace, traffic, pit, and retirement assumptions.
These changes are not a claim of a calibrated elapsed-time race simulator or
reliable mechanical-cause prediction.

## Future evidence and validation

The original prospective registration is preserved as
`prospective_policy_v1.json`. The current v2 registration starts a separate
future cohort with the corrected source hashes; v1 observations cannot be
pooled into it. The gate still requires ten eligible new races and never
automatically promotes a model. New survival, event, feature-engineering,
probability, and range sources are covered by the protocol manifest.

Checks include team-order invariance, literal safety-car event probabilities,
live conditioning and identity, lap-count-invariant survival, exclusion labels,
unrestricted physical recovery, chronology/field validation for stacking,
learned-route influence and publication guards, and UI method descriptions.
Both default v9 and experimental learned Mexico dry runs completed under
database read-only enforcement; no saved forecast was regenerated.

```sh
python -m unittest discover -s etl/prediction -p 'test*.py'
cd web
node --test tests/predictions.test.mjs
```

To reproduce the rank comparison, supply the archived input directory containing
`race.parquet`, `qualifying.parquet`, `sprint.parquet`, `weather.parquet`, and
`laps.parquet`. Inputs are local research artifacts, not committed data:

```sh
python etl/research/check_learned_ensemble.py --input /path/to/pre-mexico-snapshot --output /path/to/new-report
```

The output contains the protocol/input hashes, per-driver and per-race metrics,
chronological component history, and per-race learned weights. An independent
earlier-audit ranking check runs when that optional companion snapshot is
available. The current archive does not establish as-issued source availability
or certify penalty-adjusted starting grids. Previously inspected 2026 results
are not an untouched confirmation holdout.
