// Curated editorial snapshot. Review source claims before advancing this date.
export const RECORDS_REVIEWED = '2026-11-03'
export const RECORDS_THROUGH = '2026 Mexico City Grand Prix'
const f1Records = 'https://www.formula1.com/en/latest/article/in-numbers-the-records-antonelli-has-broken-on-his-way-to-his-maiden-f1-title.2FB9yQ5qD7XzQ418HNlrfN'
const mercedesBio = 'https://www.mercedesamgf1.com/drivers/driver/andrea-kimi-antonelli'
const suzuka2025 = 'https://www.formula1.com/en/latest/article/facts-and-stats-mercedes-rookie-antonelli-becomes-youngest-ever-race-leader.5qekjCZ1GhXAlQDjBnpRnv'

export type DriverRecord = {
  id: string
  date: string
  year: number
  event: string
  title: string
  detail: string
  mark: string
  category: 'Formula 1' | 'Sprint' | 'Formula 2'
  source: { name: string; url: string }
}

export const kimiRecords: DriverRecord[] = [
  { id: 'f2-multiple', date: '2024-07-21', year: 2024, event: 'Budapest · Formula 2',
    title: 'Youngest multiple F2 race winner', mark: 'F2', category: 'Formula 2',
    detail: 'Silverstone and Budapest made him the youngest repeat winner in the modern FIA Formula 2 series.',
    source: { name: 'Mercedes driver profile', url: mercedesBio } },
  { id: 'race-leader', date: '2025-04-06', year: 2025, event: 'Japanese Grand Prix',
    title: 'Youngest Grand Prix race leader', mark: 'P1', category: 'Formula 1',
    detail: 'Led at Suzuka in just his third Grand Prix. Leading a race and leading the championship are separate records.',
    source: { name: 'F1 · Japan facts & stats', url: suzuka2025 } },
  { id: 'fastest-lap', date: '2025-04-06', year: 2025, event: 'Japanese Grand Prix',
    title: 'Youngest to set a Grand Prix fastest lap', mark: 'FL', category: 'Formula 1',
    detail: 'Another age record on the same afternoon, taking the fastest-lap distinction from Max Verstappen.',
    source: { name: 'F1 · Japan facts & stats', url: suzuka2025 } },
  { id: 'sprint-pole', date: '2025-05-02', year: 2025, event: 'Miami · Sprint Qualifying',
    title: 'Youngest Sprint polesitter', mark: 'SQ', category: 'Sprint',
    detail: 'Fastest in Sprint Qualifying at 18. This put him first on the Sprint grid, not the Grand Prix grid.',
    source: { name: 'Mercedes driver profile', url: mercedesBio } },
  { id: 'gp-pole', date: '2026-03-14', year: 2026, event: 'Chinese Grand Prix · Qualifying',
    title: 'Youngest Grand Prix polesitter', mark: 'POLE', category: 'Formula 1',
    detail: 'Qualified fastest at 19 years, 201 days, breaking Sebastian Vettel’s record. Age is measured on qualifying day.',
    source: { name: 'Guinness World Records', url: 'https://www.guinnessworldrecords.com/world-records/103121-youngest-formula-one-driver-to-qualify-in-pole-position' } },
  { id: 'win-from-pole', date: '2026-03-15', year: 2026, event: 'Chinese Grand Prix',
    title: 'Youngest Grand Prix winner from pole', mark: '1→1', category: 'Formula 1',
    detail: 'Converted his first Grand Prix pole into his first win.',
    source: { name: 'F1 · Antonelli’s record year', url: f1Records } },
  { id: 'championship-leader', date: '2026-03-29', year: 2026, event: 'Japanese Grand Prix',
    title: 'Youngest World Championship leader', mark: 'LEAD', category: 'Formula 1',
    detail: 'Victory at Suzuka took him to the top of the drivers’ standings, aged 19.',
    source: { name: 'FIA · Japan race report', url: 'https://www.fia.com/news/f1-antonelli-wins-japan-become-youngest-championship-leader-f1-history' } },
  { id: 'first-three-poles', date: '2026-05-03', year: 2026, event: 'Miami Grand Prix',
    title: 'First three poles, three consecutive wins', mark: '3/3', category: 'Formula 1',
    detail: 'First driver to turn his first three Grand Prix poles into wins in consecutive races.',
    source: { name: 'F1 · Antonelli’s record year', url: f1Records } },
  { id: 'monaco-winner', date: '2026-06-07', year: 2026, event: 'Monaco Grand Prix',
    title: 'Youngest Monaco Grand Prix winner', mark: 'MON', category: 'Formula 1',
    detail: 'Won in the Principality at 19 years, nine months and 13 days.',
    source: { name: 'Mercedes · Monaco race report', url: 'https://www.mercedesamgf1.com/reports/race-report-kimi-makes-history-with-victory-in-monaco' } },
  { id: 'grand-slam', date: '2026-06-07', year: 2026, event: 'Monaco Grand Prix',
    title: 'Youngest Grand Slam winner', mark: 'SLAM', category: 'Formula 1',
    detail: 'Pole, victory, fastest lap and every lap led: the complete set in Monaco.',
    source: { name: 'F1 · Antonelli’s record year', url: f1Records } },
  { id: 'first-five-wins', date: '2026-06-07', year: 2026, event: 'China → Monaco',
    title: 'First five Grand Prix wins, all in a row', mark: '5×', category: 'Formula 1',
    detail: 'No driver before him had taken their first five Grand Prix victories consecutively.',
    source: { name: 'Mercedes driver profile', url: mercedesBio } },
  { id: 'world-champion', date: '2026-11-01', year: 2026, event: 'Mexico City Grand Prix',
    title: 'Youngest Formula 1 World Champion', mark: 'WDC', category: 'Formula 1',
    detail: 'Clinched the title at 20 years, 68 days with third place in Mexico.',
    source: { name: 'Guinness World Records', url: 'https://www.guinnessworldrecords.com/world-records/youngest-formula-one-world-champion' } },
]
