import test from 'node:test'
import assert from 'node:assert/strict'
import { load } from './load.mjs'
const data = load('../src/lib/kimi-season-data.ts')
const { seasonSummary, headToHead, leaderboardAt, ageAt, youngestChampions } = load('../src/lib/kimi-stats.ts', { './kimi-season-data': data })

test('season summaries reconcile with the official Grand Prix snapshot', () => {
  const champion = seasonSummary(2026)
  assert.deepEqual([champion.races, champion.wins, champion.podiums, champion.poles, champion.points, champion.dnfs], [19, 9, 16, 7, 380, 1])
  const rookie = seasonSummary(2025)
  assert.deepEqual([rookie.races, rookie.wins, rookie.podiums, rookie.points, rookie.championshipPosition], [24, 0, 3, 150, 7])
  for (const year of [2025, 2026]) assert.equal(data.kimiStanding[year].length, data.seasons[year].length)
})

test('title race tracks every round and Kimi leads from Suzuka onward', () => {
  for (const points of Object.values(data.titleRace2026)) assert.equal(points.length, 19)
  assert.equal(leaderboardAt(2)[0].code, 'RUS')
  for (let round = 3; round <= 19; round++) assert.equal(leaderboardAt(round)[0].code, 'ANT')
  const final = leaderboardAt(19)
  assert.equal(final[0].points - final[1].points, 119)
})

test('ages use calendar days since the last birthday', () => {
  assert.deepEqual([ageAt('2006-08-25', '2026-11-01').years, ageAt('2006-08-25', '2026-11-01').days], [20, 68])
  assert.deepEqual([ageAt('1987-07-03', '2010-11-14').years, ageAt('1987-07-03', '2010-11-14').days], [23, 134])
  assert.equal(ageAt('2000-03-10', '2020-03-09').years, 19)
  assert.equal(youngestChampions[0].short, 'ANT')
  for (let i = 1; i < youngestChampions.length; i++) assert.ok(youngestChampions[i - 1].age.decimal < youngestChampions[i].age.decimal)
})

test('teammate head-to-head ignores ties and missing sessions', () => {
  const duel = headToHead(2026)
  assert.deepEqual([duel.quali.kimi, duel.quali.teammate, duel.race.kimi, duel.race.teammate], [11, 8, 14, 5])
})
