import claims from './kimi-record-claims.json'
import { seasons, sprints } from './kimi-season-data'

const BIRTH = Date.UTC(2006, 7, 25)
const DAY = 86_400_000
const ageOf = (time: number) => (time - BIRTH) / DAY / 365.2425

// Most specific comparison group first: a Mercedes-only record is not an all-time record.
export const recordScopes = [
  { id: 'youngest', label: 'Youngest ever', note: 'Compared with every F1 driver, by age' },
  { id: 'alltime', label: 'Most or best ever', note: 'All-time totals, seasons and margins' },
  { id: 'sprint', label: 'Sprint', note: 'Sprint races and sprint qualifying' },
  { id: 'circuit', label: 'One race or circuit', note: 'A single Grand Prix, circuit or circuit type' },
  { id: 'young', label: 'Teen and under-21', note: 'Compared only with drivers of the same age' },
  { id: 'mercedes', label: 'Mercedes only', note: 'Compared only with Mercedes drivers' },
  { id: 'italian', label: 'Italians only', note: 'Compared only with Italian drivers' },
] as const
export type RecordScope = (typeof recordScopes)[number]['id']

// Four colour groups answer the fan's question: who was he compared against?
export const recordGroups = [
  { id: 'everyone', label: 'All-time F1 records', note: 'Every driver in history', scopes: ['youngest', 'alltime'] },
  { id: 'event', label: 'One race or format', note: 'A single Grand Prix, circuit or the sprint format', scopes: ['circuit', 'sprint'] },
  { id: 'age', label: 'Age-group records', note: 'Only teenagers or under-21 drivers', scopes: ['young'] },
  { id: 'team', label: 'Team and nation', note: 'Only Mercedes drivers or Italians', scopes: ['mercedes', 'italian'] },
] as const satisfies readonly { id: string; label: string; note: string; scopes: readonly RecordScope[] }[]
export type RecordGroup = (typeof recordGroups)[number]['id']
export const groupOf = (scope: RecordScope): RecordGroup => recordGroups.find(g => (g.scopes as readonly RecordScope[]).includes(scope))!.id

export function recordScope(text: string): RecordScope {
  if (/\bItalian\b/.test(text.replace(/Italian GP/g, ''))) return 'italian'
  if (/Mercedes/.test(text)) return 'mercedes'
  if (/teen|under-21|before turning 21/i.test(text)) return 'young'
  if (/ GP (?:winner|pole|podium|fastest)|Silverstone sprint|at \d+ circuits|Suzuka race lap|at Monza|home GP|street circuit|circuit’s first|race at a circuit/.test(text)) return 'circuit'
  if (/sprint/i.test(text)) return 'sprint'
  if (/^Youngest|^Only pole sitter before/.test(text)) return 'youngest'
  return 'alltime'
}

const places: Record<string, string> = {
  Australia: 'Australian', China: 'Chinese', Japan: 'Japanese', Miami: 'Miami', Canada: 'Canadian', Monaco: 'Monaco',
  Barcelona: 'Barcelona', Spain: 'Spanish', 'Great Britain': 'British', Belgium: 'Belgian', Netherlands: 'Dutch',
  Italy: 'Italian', 'São Paulo': 'São Paulo', 'Las Vegas': 'Las Vegas', Mexico: 'Mexico City',
}

export const weekends = ([2025, 2026] as const).flatMap(year => seasons[year].map(race => ({
  id: `${year}-${race.round}`, year, round: race.round, race: race.race, circuit: race.circuit, date: race.date,
  time: Date.parse(`${race.date}T00:00:00Z`), age: ageOf(Date.parse(`${race.date}T00:00:00Z`)),
})))
export type Weekend = (typeof weekends)[number]
// Runs of consecutive weekends at the same age, for the age strip under both charts.
export const ageBands = weekends.reduce<{ years: number; from: number; to: number }[]>((bands, weekend, index) => {
  const years = Math.floor(weekend.age)
  const last = bands.at(-1)
  if (last?.years === years) last.to = index
  else bands.push({ years, from: index, to: index })
  return bands
}, [])

function weekendFor(time: number | null, text: string): Weekend | undefined {
  // An age dates the record exactly; qualifying, sprints and practice fall up to three days before the race.
  if (time !== null) return weekends.find(w => w.time - time >= 0 && w.time - time <= 3 * DAY)
  // Without an age, accept a single named weekend. A span (“Belgium–Mexico”) has no single record date.
  const named = text.match(/\(([^()–\d]+?) (202[56])\)/)
  const race = named && places[named[1]]
  return race ? weekends.find(w => w.race === race && w.year === Number(named[2])) : undefined
}

export const recordInsights = (claims as string[]).map((text, index) => {
  const age = text.match(/(\d+)y (\d+)m (\d+)d/)
  const time = age ? Date.UTC(2006 + Number(age[1]), 7 + Number(age[2]), 25 + Number(age[3])) : null
  const weekend = weekendFor(time, text)
  const scope = recordScope(text)
  return {
    id: `claim-${index + 1}`, text, scope, group: groupOf(scope),
    title: text.split(':')[0], age: time === null ? null : ageOf(time), ageText: age?.[0] ?? null,
    weekendId: weekend?.id ?? null,
  }
})
export type RecordInsight = (typeof recordInsights)[number]

export const weekendTally = weekends
  .map(weekend => ({ weekend, records: recordInsights.filter(r => r.weekendId === weekend.id) }))
  .filter(entry => entry.records.length)
  .sort((a, b) => b.records.length - a.records.length || a.weekend.time - b.weekend.time)

// Each ladder marks the counts the list names as “youngest to N”, and Grand Prix results reproduce the dates.
const gpRaces = ([2025, 2026] as const).flatMap(year => seasons[year].map(race => ({ ...race, year })))
const sprintPoints = (year: 2025 | 2026, race: string) => sprints[year].find(s => s.race === race)?.points ?? 0
export const ladders = [
  { id: 'wins', label: 'Wins', hit: (r: (typeof gpRaces)[number]) => !r.dnf && r.finish === 1 ? 1 : 0, record: [2, 9] },
  { id: 'poles', label: 'Poles', hit: (r: (typeof gpRaces)[number]) => r.quali === 1 ? 1 : 0, record: [1, 7] },
  { id: 'podiums', label: 'Podiums', hit: (r: (typeof gpRaces)[number]) => !r.dnf && r.finish <= 3 ? 1 : 0, record: [9, 19] },
  { id: 'fastest', label: 'Fastest laps', hit: (r: (typeof gpRaces)[number]) => r.fastestLapRank === 1 ? 1 : 0, record: [1, 10] },
  { id: 'points', label: 'Points', hit: (r: (typeof gpRaces)[number]) => r.points + sprintPoints(r.year, r.race), record: [300, 500], step: 50 },
].map(ladder => {
  let total = 0
  const path = gpRaces.map(race => {
    const before = total
    total += ladder.hit(race)
    return { race: race.race, year: race.year, date: race.date, age: ageOf(Date.parse(`${race.date}T00:00:00Z`)), before, total }
  })
  const step = ladder.step ?? 1
  const rungs = path.flatMap(point => {
    const reached = []
    for (let n = Math.floor(point.before / step) * step + step; n <= point.total; n += step) {
      reached.push({ count: n, race: point.race, year: point.year, age: point.age, youngest: n >= ladder.record[0] && n <= ladder.record[1] })
    }
    return reached
  })
  return { id: ladder.id, label: ladder.label, total, path, rungs }
})
