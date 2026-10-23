import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
const require = createRequire(import.meta.url)
function load(source, imports = {}) {
  const code = ts.transpileModule(readFileSync(new URL(source, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const loaded = { exports: {} }
  new Function('require', 'module', 'exports', code)(name => imports[name] ?? require(name), loaded, loaded.exports)
  return loaded.exports
}
const neon = load('../src/lib/neon.ts')
const { shapeRacePrediction } = load('../src/lib/predictions.ts', { '@/lib/neon': neon })
for (const value of [0, '0', null]) {
  test(`prediction response preserves ${JSON.stringify(value)} metrics`, () => {
    const response = shapeRacePrediction({ season: 2026, round: 1,
      predictions: [{ actual_points: value, upset_score: value }], championship: [],
      accuracy: [{ mae_position: value, brier_score: value }] })
    assert.equal(response.drivers[0].actual_points, value === null ? null : 0)
    assert.equal(response.accuracy.mae_position, value === null ? null : 0)
    assert.equal(response.accuracy.brier_score, value === null ? null : 0)
  })
}

test('forecast details survive API shaping and older forecasts remain readable', () => {
  const details = { expected_finish: 4.2, finish_p10: 2, finish_p90: 10,
    position_probabilities: [.1, .2], mc_win_standard_error: .01,
    model_rank_spread: 3, calibration_method: 'shrinkage', calibration_races: 0,
    raw_finish_p10: 3, raw_finish_p90: 9, raw_range_method: 'simulation_quantiles_v1',
    range_basis: 'simulation_calibrated', range_calibration_races: 12 }
  const response = shapeRacePrediction({ season: 2026, round: 1,
    predictions: [{ forecast_details: details }, {}], championship: [], accuracy: [] })
  assert.deepEqual(response.drivers[0].forecast_details, details)
  assert.equal(response.drivers[1].forecast_details, null)
})
