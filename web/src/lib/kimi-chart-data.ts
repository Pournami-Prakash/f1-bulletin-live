// Official F1 result snapshots, reviewed 2026-11-03. null denotes DNF, not P0.
export const resultSources = {
  2025: 'https://www.formula1.com/en/results/2025/drivers/ANDANT01/kimi-antonelli',
  2026: 'https://www.formula1.com/en/results/2026/drivers/ANDANT01/kimi-antonelli',
}
export const seasonResults = {
  2025: [
    ['Australia',4],['China',6],['Japan',6],['Bahrain',11],['Saudi Arabia',6],['Miami',6],['Emilia-Romagna',null],['Monaco',18],['Spain',null],['Canada',3],['Austria',null],['Great Britain',null],['Belgium',16],['Hungary',10],['Netherlands',16],['Italy',9],['Azerbaijan',4],['Singapore',5],['United States',13],['Mexico',6],['Brazil',2],['Las Vegas',3],['Qatar',5],['Abu Dhabi',15],
  ],
  2026: [
    ['Australia',2],['China',1],['Japan',1],['Miami',1],['Canada',1],['Monaco',1],['Barcelona-Catalunya',null],['Austria',3],['Great Britain',15],['Belgium',1],['Hungary',3],['Netherlands',2],['Italy',1],['Spain',1],['Azerbaijan',5],['Bahrain',2],['Singapore',3],['United States',1],['Mexico',3],
  ],
} satisfies Record<number, [string, number | null][]>
export type RaceMetric = 'podiums' | 'wins' | 'top10'
export function matchesMetric(position: number | null, metric: RaceMetric) {
  return position !== null && position <= (metric === 'wins' ? 1 : metric === 'podiums' ? 3 : 10)
}
export function cumulativeResults(year: 2025 | 2026, metric: RaceMetric) {
  let total = 0
  return seasonResults[year].map(([race, position], index) => ({ round: index + 1, race, position, total: total += Number(matchesMetric(position, metric)) }))
}
export const ageRecords = [
  { record: 'World champion', kimi: [20,68], previous: [23,134], former: 'Vettel', event: 'Mexico 2026',
    sources: ['https://www.guinnessworldrecords.com/world-records/youngest-formula-one-world-champion', 'https://www.formula1.com/en/latest/article/the-four-time-world-champions-verstappen-joins-in-the-all-time-list-and.DIIOvqAthyjnqsyOrzMon'] },
  { record: 'Grand Prix pole', kimi: [19,201], previous: [21,73], former: 'Vettel', event: 'China qualifying 2026',
    sources: ['https://www.guinnessworldrecords.com/world-records/103121-youngest-formula-one-driver-to-qualify-in-pole-position', 'https://www.formula1.com/en/latest/article/antonelli-feeling-great-after-becoming-youngest-ever-grand-prix-polesitter.3zm5sUgdoEFO25K4LBkFi0'] },
]
export const decimalAge = ([years, days]: number[]) => years + days / 365.25
