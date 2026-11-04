import submitted from './kimi-record-claims.json'
import { kimiRecords } from './driver-records'

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
  return { id: `claim-${index + 1}`, text, source: sourceRecord?.source ?? null }
})
export type RecordClaim = (typeof recordClaims)[number]
