import test from 'node:test'
import assert from 'node:assert/strict'
import { load } from './load.mjs'
const { storyFeedPolicy, loadStoryFeed } = load('../src/lib/story-feed.ts')
const busy = { last72h: 80, last7d: 200 }
const race = { race_name: 'Desert Grand Prix', city: 'Desert City', country: 'Example', fp1_date: '2026-10-22T12:00:00Z', race_start_utc: '2026-10-24T16:00:00Z', race_date: '2026-10-24' }
const at = value => Date.parse(value)

test('race mode follows session times, including a Thursday to Saturday weekend', () => {
  const policy = storyFeedPolicy([race], busy, at('2026-10-22T14:00:00Z'))
  assert.equal(policy.mode, 'race-weekend')
  assert.equal(policy.windowHours, 72)
  assert.equal(policy.halfLifeHours, 12)
  assert.equal(policy.raceName, race.race_name)
  assert.ok(policy.raceTerms.includes('Desert'))
  assert.equal(storyFeedPolicy([race], busy, at('2026-10-25T12:00:00Z')).mode, 'between-races')
})
test('pre-race, between-race, and long-break windows retain useful context', () => {
  assert.equal(storyFeedPolicy([race], busy, at('2026-10-20T12:00:00Z')).mode, 'race-build-up')
  const between = storyFeedPolicy([race], busy, at('2026-10-28T12:00:00Z'))
  assert.equal(between.mode, 'between-races')
  assert.equal(between.windowHours, 168)
  const winter = storyFeedPolicy([], busy, at('2026-12-20T12:00:00Z'))
  assert.equal(winter.mode, 'long-break')
  assert.equal(winter.windowHours, 336)
})
test('sparse coverage expands even a race-weekend window while keeping current news separate', () => {
  const now = at('2026-10-22T14:00:00Z')
  const quiet = storyFeedPolicy([race], { last72h: 4, last7d: 20 }, now)
  assert.equal(quiet.windowHours, 168)
  assert.equal(quiet.currentHours, 24)
  assert.equal(storyFeedPolicy([race], { last72h: 0, last7d: 3 }, now).windowHours, 336)
})
test('missing session timestamps use the race date and invalid dates do not create a live weekend', () => {
  assert.equal(storyFeedPolicy([{ race_name: 'Race', race_date: '2026-10-24' }], busy, at('2026-10-23')).mode, 'race-weekend')
  assert.equal(storyFeedPolicy([{ race_name: 'Race', race_date: 'invalid' }], busy, at('2026-10-23')).mode, 'long-break')
})
test('adaptive response shares the calendar policy and preserves filter values as SQL parameters', async () => {
  const calls = []
  const sql = async (strings, ...values) => {
    calls.push({ text: strings.join('?'), values })
    if (strings.join('').includes('FROM race_calendar')) return [race]
    if (strings.join('').includes('COUNT(*)')) return [busy]
    return [{ story_id: 'new', feed_section: 'current' }]
  }
  const result = await loadStoryFeed(sql, { now: at('2026-10-22T14:00:00Z'), limit: 80, q: "news' OR 1=1 --", cluster: 'TECHNICAL' })
  assert.equal(result.policy.mode, 'race-weekend')
  assert.equal(result.items[0].story_id, 'new')
  assert.equal(calls.length, 3)
  for (const call of calls) assert.ok(!call.text.includes("news' OR"))
  assert.ok(calls[2].values.includes("%news' OR 1=1 --%"))
})
