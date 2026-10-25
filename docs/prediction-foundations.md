# Prediction correctness and evaluation foundations

## Corrected simulation invariants

The v8 simulator uses one shared lap snapshot and one pace formula for both cars in an overtaking comparison. Common fuel weight cancels; both cars use fitted circuit/compound degradation, their current traffic-adjusted tyre age, and one noise draw per lap. Ages advance for the entire field before pit decisions. All pit updates finish before pace comparisons, so a stopped car uses its new compound and reset age immediately.

Cars can attempt a pass only on the adjacent car, at most once per lap. On-track passing is disabled under a simulated safety car. Slot assignments remain unique. Retirees are classified by completed distance, with a deterministic position/code tie-break, rather than Python set order. Input permutation cannot change a seeded result.

This remains a position-based heuristic simulator. The fixes do not turn it into a validated elapsed-time or race-strategy model.

## Explicit finishing-order policy

`predict.py --ranking-source auto` retains the existing default: complete robust-model scores determine order when available; otherwise the simulation/ML blend does. `--ranking-source simulation`, `blend` and `robust` allow explicit controlled evaluation. An incomplete robust field is rejected. Probability ensembles are separate from this ranking-only choice.

Each prediction's stored `forecast_details` now includes `ranking_source`, `simulation_version`, `simulation_expected_finish` and `robust_score`. Simulation improvements therefore have a visible, testable route to output without silently promoting an unvalidated ranking policy. Default robust order is deliberately retained.

The model namespace is now `prod_v8_calibrated_robust_*` (or the corresponding explicit-route/coherent family). Earlier v7 forecasts and calibration data remain distinct. The new version uses the explicit shrinkage fallback until compatible calibration history is sufficient. No historical forecasts are rewritten merely to create calibration evidence.

## Event identity repair

The 2026 Bahrain provider archive includes a cancelled April Sakhir meeting (1282) and an active October Kuala Lumpur meeting (1308), both named Bahrain Grand Prix. The cancelled duplicate caused the original name-only importer to reject the active race; the underlying race name was not wrong.

`event_identity.py` resolves active status, normalized event name, race date and venue together and returns the provider meeting/session IDs. Relocation does not require renaming results. API requests no longer prefilter by country names, which upstream may retain from the original event identity. The historical import now includes all 41 verified 2025/2026 practice sessions and 21,999 observed laps. Earlier years without provider identity caches are explicitly reported as unaudited, not silently certified.

## Frozen comparative evaluation

The benchmark now compares, on identical complete driver fields:

- Qualifying order, previous driver form, and a fixed equal-weight grid/form baseline.
- Existing robust model versus the complete practice-feature challenger.
- Practice pace alone, practice wear alone, and observation-count evidence alone.
- Three joint within-weekend shuffles of practice features (seeds 11, 29, 47), preserving covariance and missingness while breaking driver identity.

All training, imputation and scaling use strictly earlier races. Outcomes never determine features or shuffle assignments. Event identities are audited before the CLI starts evaluating; verified event IDs and input hashes are exported. Protocol hashes include the evaluation, feature and ranking code.

The exported error breakdown includes per-driver errors, finishing/retirement/disqualification/status groups and finisher-relative ordering. The latter is an oracle post-race diagnostic, not an achievable forecast. Strategy, traffic and penalty causes remain unattributed when there is no independent evidence; a large residual is not automatically assigned a cause. Qualifying order is not mislabeled as a verified post-penalty starting grid.

Run the audited benchmark:

```sh
python etl/prediction/tyre_benchmark.py --data etl/research/suite_data \
  --observations artifacts/tyre-analysis/history_observations.json \
  --season 2026 --through-round 17 \
  --output artifacts/tyre-analysis/foundations-2026.json
```

`--no-controls` is an explicit faster paired check. The default runs all ablations and shuffled controls. Data files and forecasts remain untouched by the evaluator. Results are exploratory because the retrospective archive and 2026 outcomes have already been examined; controls are diagnostic, not a fresh model-selection holdout.

## Current evidence

Across 17 races in 2026, mean position error was 3.3690 for the robust model and 3.3743 for qualifying order. Practice pace alone gave 3.3636, wear alone 3.4064, and observation-count evidence alone 3.3690. All three single-feature paired intervals include zero improvement. The full challenger remains worse by 0.0321 positions on average. Three shuffled controls give errors of 3.4011, 3.3904 and 3.4332. These findings do not establish a reliable accuracy gain or justify promoting tyre features.

The 303 finishing entries have mean position error 2.779; the 71 nonfinishing entries have mean error 5.887 and account for 33.2% of total absolute error. That identifies where error is concentrated, not how much is predictable before the race.

Unit tests cover common-fuel cancellation, symmetric fitted curves, post-stop state, complete/deterministic fields, safety-car passing, explicit ranking routes, cancelled/relocated identities, matched baseline cohorts, and outcome-preserving reproducible negative controls. Additional paired historical simulator checks use identical bounded inputs and seeds; correctness fixes are not presented as proof of improved forecast accuracy.

## Prospective freeze and review gate

Feature additions are frozen under `etl/prediction/prospective_policy.json`, which records registration time and source hashes. The scheduled prediction workflow continues collecting practice and freezing pre-race forecasts. Each new shadow forecast also stores qualifying order and the as-issued production snapshot. Results are scored only after publication; old retrospective results do not count toward this review.

`prospective_gate.py` exports `artifacts/tyre-analysis/prospective-review.json` on each workflow run. It selects the earliest eligible forecast per race with the exact registered protocol, complete matched classifications, and a production snapshot issued before the race. Refreshes never add observations or replace the first eligible forecast. Changes to hashed code start a different protocol and are excluded from this frozen review.

The predeclared assessment uses the first **10 eligible new races**, across seasons if necessary. The tyre challenger must reduce mean finishing-position error by at least **0.10 positions** against each of qualifying order, the frozen production snapshots, and its refitted no-tyre baseline. Each paired 95% interval must also exclude zero improvement, using contiguous three-race circular bootstrap blocks (10,000 draws, seed 42). These are practical review thresholds, not guarantees of future performance. There is one assessment on that cohort; the gate does not keep checking larger samples until significance appears.

Passing makes the challenger eligible for review only. It never changes production routing, approves promotion, or establishes probability calibration. Until there is sufficient evidence, the existing robust ranking remains in production. Optional shadow-data failures remain visible in workflow logs; an incomplete evidence stream cannot pass the gate.
