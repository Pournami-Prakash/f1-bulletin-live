import test from 'node:test'
import assert from 'node:assert/strict'
import { load } from './load.mjs'
const { seasonResults, cumulativeResults, matchesMetric, decimalAge } = load('../src/lib/kimi-chart-data.ts')

test('race series reconcile with official season snapshots without Sprint contamination', () => {
  assert.equal(seasonResults[2025].length, 24)
  assert.equal(seasonResults[2026].length, 19)
  for (const [year, wins, podiums] of [[2025,0,3],[2026,9,16]]) {
    assert.equal(cumulativeResults(year,'wins').at(-1).total,wins)
    assert.equal(cumulativeResults(year,'podiums').at(-1).total,podiums)
  }
  assert.equal(matchesMetric(null,'wins'),false)
  assert.equal(cumulativeResults(2026,'wins')[6].total,5)
})
test('2026 ends at Mexico without extrapolating the remaining season', () => {
  const result=cumulativeResults(2026,'podiums')
  assert.equal(result.at(-1).race,'Mexico')
  assert.equal(result.at(-1).round,19)
  assert.equal(result.find(point=>point.round===24),undefined)
  for (let i=1;i<result.length;i++) assert.ok([0,1].includes(result[i].total-result[i-1].total))
  assert.ok(decimalAge([20,68])<decimalAge([23,134]))
})
