import submitted from './kimi-record-claims.json'
import { kimiRecords } from './driver-records'

export const recordLenses = [
  { id: 'firsts', label: 'Age firsts', color: '#27f4d2' },
  { id: 'thresholds', label: 'Milestone ladders', color: '#7fd8cc' },
  { id: 'streaks', label: 'Streaks', color: '#5fb3d9' },
  { id: 'season', label: 'Season & career totals', color: '#c0c7cc' },
  { id: 'circuits', label: 'Circuit records', color: '#8fa8ff' },
  { id: 'sprint', label: 'Sprint records', color: '#a7e3f0' },
  { id: 'italy', label: 'Italian records', color: '#ff7b7b' },
  { id: 'mercedes', label: 'Mercedes records', color: '#00a19c' },
  { id: 'other', label: 'Other distinctions', color: '#8a959d' },
] as const
export type Lens = (typeof recordLenses)[number]['id']
const f1Source = 'https://www.formula1.com/en/latest/article/in-numbers-the-records-antonelli-has-broken-on-his-way-to-his-maiden-f1-title.2FB9yQ5qD7XzQ418HNlrfN'

export const recordMoments = [
  { id: 'suzuka25', label: 'SUZUKA', year: 2025, date: '06 APR', title: 'Two firsts. One afternoon.', recordIds: ['race-leader', 'fastest-lap'], match: /Japan 2025|Suzuka race lap/, glyph: 'FL', note: 'Youngest race leader and fastest-lap setter.', source: kimiRecords.find(r => r.id === 'race-leader')!.source.url },
  { id: 'miami25', label: 'MIAMI', year: 2025, date: '02 MAY', title: 'The Sprint breakthrough.', recordIds: ['sprint-pole'], match: /Miami 2025/, glyph: 'SQ', note: 'Youngest Sprint polesitter. A different record from Grand Prix pole.', source: kimiRecords.find(r => r.id === 'sprint-pole')!.source.url },
  { id: 'china26', label: 'SHANGHAI', year: 2026, date: '14–15 MAR', title: 'Pole. Then the win.', recordIds: ['gp-pole', 'win-from-pole'], match: /China 2026|Chinese GP.*\(2026\)/, glyph: '1→1', note: 'Youngest Grand Prix polesitter and youngest winner from pole.', source: f1Source },
  { id: 'japan26', label: 'SUZUKA', year: 2026, date: '29 MAR', title: 'To the top of the standings.', recordIds: ['championship-leader'], match: /Japan 2026|Japanese GP.*\(2026\)/, glyph: 'P1', note: 'The youngest driver to lead the World Championship.', source: kimiRecords.find(r => r.id === 'championship-leader')!.source.url },
  { id: 'miami26', label: 'MIAMI', year: 2026, date: '03 MAY', title: 'Three poles. Three wins.', recordIds: ['first-three-poles'], match: /Miami 2026|China–Miami 2026|Miami GP.*\(2026\)|first 3 poles/, glyph: '3/3', note: 'His first three Grand Prix poles became three consecutive victories.', source: f1Source },
  { id: 'monaco26', label: 'MONACO', year: 2026, date: '07 JUN', title: 'The complete set.', recordIds: ['monaco-winner', 'grand-slam', 'first-five-wins'], match: /Monaco 2026|Monaco GP.*\(2026\)|first win.*5|first 4 poles/, glyph: '5×', note: 'Youngest Monaco winner, youngest Grand Slam winner, and five consecutive maiden victories.', source: f1Source },
  { id: 'monza26', label: 'MONZA', year: 2026, date: '06 SEP', title: 'From P19 to the home win.', recordIds: [], match: /Italy 2026|Italian GP.*\(2026\)|Monza.*P19/, glyph: '19→1', note: 'A home victory from P19, ending Italy’s 60-year wait for an Italian GP winner.', source: f1Source },
  { id: 'mexico26', label: 'MEXICO CITY', year: 2026, date: '01 NOV', title: 'The youngest champion.', recordIds: ['world-champion'], match: /Mexico 2026|world champion/i, glyph: 'WDC', note: 'Third in Mexico sealed the crown at 20 years, 68 days.', source: kimiRecords.find(r => r.id === 'world-champion')!.source.url },
] as const

function lensFor(text: string): Lens {
  if (/Italian|Italy|Italiano/i.test(text) && !/Italy 2026/.test(text)) return 'italy'
  if (/Mercedes/.test(text)) return 'mercedes'
  if (/Monaco GP|Italian GP|Belgian GP|Japanese GP|Canadian GP|Chinese GP|Miami GP|United States GP|British GP|at \d+ circuits|at \d+ circuit|Suzuka race lap/.test(text)) return 'circuits'
  if (/sprint/i.test(text)) return 'sprint'
  if (/consecutive|streak|back-to-back|first [345] (?:poles|wins)|first two wins/.test(text)) return 'streaks'
  if (/Youngest to (?:every|\d|lead 1 GP)|Fewest races/.test(text)) return 'thresholds'
  if (/Most |Best |Largest |season|as a teenager|before turning 21/.test(text) && !/^Youngest/.test(text)) return 'season'
  if (/Youngest|Only teenage|Only pole sitter|Only teenager|First teenager/.test(text)) return 'firsts'
  return 'other'
}
// Exact primary-source matches only. Similar team/circuit/age variants stay unverified.
const linked: Record<string, string> = {
  'Youngest world champion:': 'world-champion',
  'Youngest pole sitter:': 'gp-pole',
  'Youngest sprint pole sitter:': 'sprint-pole',
  'Youngest winner from pole:': 'win-from-pole',
  'Youngest to lead a lap:': 'race-leader',
  'Youngest fastest lap:': 'fastest-lap',
  'Youngest grand slam:': 'grand-slam',
  'Youngest championship leader:': 'championship-leader',
  'Most consecutive wins from a driver’s first win:': 'first-five-wins',
  'Only driver to convert his first 3 poles': 'first-three-poles',
  'Youngest Monaco GP winner:': 'monaco-winner',
}
export const recordClaims = submitted.map((text, index) => {
  const link = Object.entries(linked).find(([prefix]) => text.startsWith(prefix))
  const sourceRecord = link ? kimiRecords.find(r => r.id === link[1]) : undefined
  const statedYears = [...new Set(text.match(/202[56]/g) ?? [])]
  return {
    id: `claim-${index + 1}`, text, lens: lensFor(text),
    year: statedYears.length === 1 ? Number(statedYears[0]) : null,
    momentIds: recordMoments.filter(moment => moment.match.test(text)).map(moment => moment.id),
    // Normalize the displayed claim to the sourced value when an age differs in the paste.
    source: sourceRecord?.source ?? null,
    sourceTitle: sourceRecord?.title ?? null,
    sourceDetail: sourceRecord?.detail ?? null,
  }
})
export type RecordClaim = (typeof recordClaims)[number]
