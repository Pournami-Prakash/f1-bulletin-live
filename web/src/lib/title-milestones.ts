// What the 2026 title meant beyond the record list: firsts and comparisons reported after Mexico City.
export const titleSources = {
  abc: { name: 'ABC News', url: 'https://www.abc.net.au/news/2026-11-02/f1-records-broken-by-kimi-antonelli-in-2026/107154478' },
  grandprix: { name: 'GrandPrix.com', url: 'https://www.grandprix.com/races/mexican-gp-2026-race-notes.html' },
  motorbiscuit: { name: 'MotorBiscuit', url: 'https://www.motorbiscuit.com/kimi-antonelli-beats-vettel-to-become-f1s-youngest-champion-facts-and-records/' },
  mercedes: { name: 'Mercedes-AMG F1', url: 'https://www.mercedesamgf1.com/reports/race-report-kimi-antonelli-becomes-youngest-ever-world-champion-with-mexico-podium' },
} as const
export type TitleSource = keyof typeof titleSources

// Italian waits that ended in 2026, measured in years from the last Italian to do it.
export const italianDroughts = [
  { id: 'champion', label: 'World champion', last: 'Ascari', from: 1953, source: 'grandprix' },
  { id: 'monza', label: 'Italian GP winner', last: 'Scarfiotti', from: 1966, source: 'motorbiscuit' },
  { id: 'winner', label: 'Any GP winner', last: 'Fisichella', from: 2006, source: 'motorbiscuit' },
] as const satisfies readonly { id: string; label: string; last: string; from: number; source: TitleSource }[]

// Title clinched with this many Grands Prix still to run; Antonelli ties for fourth.
export const earliestTitles = [
  { driver: 'Schumacher', year: 2002, left: 6 },
  { driver: 'Mansell', year: 1992, left: 5 },
  { driver: 'Verstappen', year: 2023, left: 5 },
  { driver: 'Schumacher', year: 2001, left: 4 },
  { driver: 'Schumacher', year: 2004, left: 4 },
  { driver: 'Vettel', year: 2011, left: 4 },
  { driver: 'Verstappen', year: 2022, left: 4 },
  { driver: 'Antonelli', year: 2026, left: 4, kimi: true },
] as const

export const titleFirsts = [
  { id: 'century', value: '1st', label: 'champion born this century', note: 'Born 25 Aug 2006; Norris, the 2025 champion, was born in 1999', source: 'abc' },
  { id: 'number', value: '36th', label: 'different world champion', note: 'Third Italian, after Farina and Ascari', source: 'motorbiscuit' },
  { id: 'second', value: '2nd', label: 'season, already champion', note: 'Like Fangio 1951, Villeneuve 1997 and Hamilton 2008', source: 'motorbiscuit' },
  { id: 'junior', value: '10th', label: 'Mercedes drivers’ title', note: 'The first won by a graduate of its junior programme', source: 'mercedes' },
] as const satisfies readonly { id: string; value: string; label: string; note: string; source: TitleSource }[]
