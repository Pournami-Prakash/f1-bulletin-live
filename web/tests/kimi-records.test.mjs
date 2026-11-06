import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { load } from './load.mjs'
const require = createRequire(import.meta.url)
const claims = require('../src/lib/kimi-record-claims.json')
const data = load('../src/lib/kimi-season-data.ts')
const titles = load('../src/lib/title-milestones.ts')
const { recordInsights, recordScope, weekendTally, ladders, ageBands, weekends } = load('../src/lib/kimi-record-insights.ts', { './kimi-record-claims.json': claims, './kimi-season-data': data, './title-milestones': titles })
const find = text => recordInsights.find(record => record.text.startsWith(text))

test('every list line is kept once and dated weekends come from the stated age', () => {
  assert.equal(recordInsights.length, 229 + titles.titleRecords.length)
  assert.equal(find('First Italian world champion since Ascari:').weekendId, '2026-19')
  assert.equal(find('Youngest world champion:').weekendId, '2026-19')
  // “(2026)” alone names no place: the age dates Monaco's pole on the Saturday.
  assert.equal(find('Youngest Monaco GP pole sitter:').weekendId, '2026-6')
  assert.equal(find('Suzuka race lap record:').weekendId, '2025-3')
  assert.equal(find('Longest points streak by an under-21 driver:').weekendId, null)
  assert.equal(find('Youngest Italian in an F1 session:').weekendId, null)
  assert.deepEqual(weekendTally.slice(0, 4).map(entry => [entry.weekend.race, entry.weekend.year, entry.records.length]),
    [['Chinese', 2026, 16], ['Italian', 2026, 14], ['Japanese', 2026, 11], ['Monaco', 2026, 10]])
})

test('scopes use the narrowest comparison group', () => {
  assert.equal(recordScope('Youngest Italian GP winner: 20y 0m 12d (2026)'), 'circuit')
  assert.equal(recordScope('Youngest Italian winner: 19y 6m 18d (China 2026)'), 'italian')
  assert.equal(recordScope('Youngest Mercedes sprint winner: 19y 10m 9d (Great Britain 2026)'), 'mercedes')
  assert.equal(recordScope('Most wins as a teenager: 6'), 'young')
  assert.equal(recordScope('Youngest sprint winner: 19y 10m 9d (Great Britain 2026)'), 'sprint')
  assert.equal(recordScope('Youngest grand slam: 19y 9m 13d (Monaco 2026)'), 'youngest')
  assert.equal(recordScope('Most points in a debut season: 150 (2025)'), 'alltime')
  const counts = Object.groupBy(recordInsights, record => record.group)
  assert.deepEqual(['everyone', 'event', 'age', 'team'].map(id => counts[id].length), [75, 54, 47, 61])
})

test('milestone ladders reproduce the youngest-to-N rungs from race results', () => {
  const rungs = id => ladders.find(ladder => ladder.id === id).rungs.filter(rung => rung.youngest).map(rung => `${rung.count} ${rung.race} ${rung.year}`)
  assert.deepEqual(rungs('wins'), ['2 Japanese 2026', '3 Miami 2026', '4 Canadian 2026', '5 Monaco 2026', '6 Belgian 2026', '7 Italian 2026', '8 Spanish 2026', '9 United States 2026'])
  assert.equal(rungs('poles')[0], '1 Chinese 2026')
  assert.deepEqual([rungs('podiums')[0], rungs('podiums').at(-1)], ['9 Monaco 2026', '19 Mexico City 2026'])
  assert.deepEqual([rungs('fastest')[0], rungs('fastest').length], ['1 Japanese 2025', 10])
  assert.deepEqual(rungs('points'), ['300 Monaco 2026', '350 Belgian 2026', '400 Italian 2026', '450 Azerbaijan 2026', '500 United States 2026'])
  assert.equal(ladders.find(ladder => ladder.id === 'points').total, 530)
})

test('age bands cover every weekend and turn 19 and 20 on the right races', () => {
  assert.deepEqual(ageBands.map(band => band.years), [18, 19, 20])
  assert.equal(ageBands.at(-1).to, weekends.length - 1)
  assert.equal(weekends[ageBands[1].from].race, 'Dutch')
  assert.equal(weekends[ageBands[2].from].race, 'Italian')
})
