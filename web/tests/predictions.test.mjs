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
