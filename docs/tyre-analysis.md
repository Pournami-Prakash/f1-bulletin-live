# Practice tyre evidence and shadow forecasts

This pipeline stores observed OpenF1 practice laps and produces conditional pace-loss diagnostics. It does not change published race forecasts. A tyre-feature challenger is fitted and frozen separately, then scored after a complete race classification is available. There is no automatic promotion.

## Data and modelling boundaries

- Original `sessions`, `laps`, `stints`, `drivers`, `race_control` and `weather` payloads are retained in immutable, content-addressed batches. Normalized laps carry source session keys, start/completed tyre ages, units, weather, eligibility, and explicit exclusion reasons. Re-fetching identical payloads is idempotent; revised payloads append another version. Batch and lap inserts are transactional.
- Pit out laps, inferred pit in laps, inconsistent sectors, missing timing, deleted laps, reported caution intervals and unknown stint identities are excluded from fitting, not deleted from storage. Caution attribution is conservative and can discard otherwise usable laps. Mini-sector colours are not interpreted as race-control flags. Practice traffic and physical tyre-set identity remain unknown.
- Same-event tyre fits use median pairwise slopes within individual stints, rather than allowing between-car pace to define degradation. The diagnostic fit requires six accepted laps with five laps of age span. A configurable-assumption study evaluates 0, 14, 28, 42 and 56 ms/lap fuel gain. Actual fuel and engine modes are not measured.
- Raw negative and extreme estimates are retained. A separate selected scenario rate has a fallback reason. The existing production tyre fitter also records its raw estimate and fallback reason without changing its selected rate.
- Allocation metadata has a source and a conservative usable-after cutoff. COTA 2025 HARD=C1 and 2026 HARD=C2 are distinct. Specification keys include the season; unknown identities remain unknown. There is no cross-season or cross-event pooling of physical tyre rates. Extending allocation coverage requires adding sourced entries to `tyre_allocations.json`.
- Diagnostics include residuals, residual/time/temperature relationships, observation-lag correlation, early/late slope differences, chronological tail MAE, and sensitivity to the lap screen. Circular residual-block bootstrap intervals are conditional on assumed fuel and selected observations; sparse stints and missing traffic weaken their interpretation.
- One-stop pit windows are isolated dry scenarios with explicit compound pace offsets and pit-loss assumptions. They omit opponents, safety cars and nonlinear tyre cliffs. Extrapolation beyond observed ages is flagged. These outputs are sensitivity illustrations, not strategy recommendations.

## Prediction comparison

The baseline and challenger use the same robust regression family, target roster and earlier-race boundary. The challenger adds practice pace, wear and evidence-count features, expressed relative to same-weekend/session/compound/time-window observations. It requires ten earlier races with practice evidence before departing from the baseline. Training imputation and scaling fit only on earlier races.

This paired comparison does not reproduce the entire calibrated production stack. The as-issued published forecast is retained separately for reference. Probability scores are from experimental uncalibrated event models. Empirical 80% finish ranges require ten earlier out-of-sample shadow races; coverage and width are reported only when available. Driver dependence and temporal drift mean those ranges do not carry a distribution-free coverage guarantee.

Saved run identity includes the frozen forecast, cutoff and observation batches. The protocol records code hashes. Later outcomes may populate scores, not rewrite forecasts. Only compatible earlier prospective runs can calibrate prospective ranges. Scoring checks a complete matching classification and refuses pre-race scoring.

## Operation

Apply the additive migration with the existing runner:

```sh
node scripts/db-migrate.mjs --plan
node scripts/db-migrate.mjs
```

Ingest completed practice, create diagnostics and store a separate shadow forecast:

```sh
python etl/prediction/tyre_shadow.py --season 2026 --round 18 --persist
```

Outputs are written to `artifacts/tyre-analysis/2026-18/`: Markdown report, observed/normalized lap JSON, per-stint CSV, fuel and strategy CSVs, diagnostic JSON and shadow forecasts. If Matplotlib is installed, residual and sensitivity PNGs are also rendered. Graphs are optional; numerical diagnostics are always generated. This directory is ignored by Git; the prediction workflow uploads it as a 90-day Actions artifact.

`weekly.py` runs this optional shadow step even when the published forecast already exists. Provider or shadow failures are logged and do not block production. Once the race is complete, the weekly job scores frozen prospective runs. To score manually:

```sh
python etl/prediction/tyre_shadow.py --season 2026 --round 18 --score
```

To replay original downloaded provider payloads, pass `--input-dir` containing `sessions_SESSION.json`, `laps_SESSION.json`, `stints_SESSION.json`, `drivers_SESSION.json`, `race_control_SESSION.json` and `weather_SESSION.json`. Session identity and time boundaries are checked exactly as for network data.

## Historical reconstruction

Original provider caches can be imported separately:

```sh
python etl/prediction/tyre_history.py --data etl/research/suite_data --persist \
  --output artifacts/tyre-analysis/history_observations.json
python etl/prediction/tyre_benchmark.py --data etl/research/suite_data \
  --observations artifacts/tyre-analysis/history_observations.json \
  --season 2026 --through-round 17 \
  --output artifacts/tyre-analysis/benchmark-2026.json
```

These commands require local research inputs; they are not needed for the deployed weekly path. Import verifies meeting names and IDs; unmatched events are reported and skipped. Missing original payloads are not invented from summary statistics. Import timestamps reflect the current import, because the cache's original retrieval date is unknown. Historical replays remain exploratory reconstructions, not as-issued forecasts or an untouched 2026 holdout.

## Initial verification

The initial archive import validated 40 historical practice sessions containing 21,385 observed laps. A 2026 Bahrain event-name mismatch was explicitly excluded. Austin's three practice sessions contain 1,519 observed lap records and support 37 fitted stint diagnostics under the current screen.

The 17-race 2026 paired reconstruction gave the challenger an average position-error change of **+0.0321 positions** (worse), with a paired race-block interval of **[-0.0321, +0.0963]**. Win Brier score improved by 0.00115, podium Brier worsened by 0.00037, and winner log loss improved by 0.0612. Seven races had sufficient earlier residual history for finish-range scoring; both variants covered 84.4% of observed finishes with a mean width of 8.64 positions. These exploratory results do not support promotion.

Validation uses analytic and labelled synthetic fixtures, plus observed API and database checks. Synthetic fixtures are never stored as observed laps.

## Sources

- [OpenF1 endpoint and age definitions](https://openf1.org/docs/)
- [Pirelli 2026 Austin allocation](https://press.pirelli.com/the-compound-selection-for-austin-mexico-city-and-so-paulo/)
- [Pirelli 2025 Austin allocation](https://press.pirelli.com/changes-and-status-quo-when-it-comes-to-compound-choices-for-the-rest-of-the-season0/)
