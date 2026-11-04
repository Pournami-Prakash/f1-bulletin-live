import { kimiStanding, seasons, titleRace2026, titleRaceDrivers, type Race } from './kimi-season-data'

export type Season = 2025 | 2026

const isWin = (race: Race) => !race.dnf && race.finish === 1
const isPodium = (race: Race) => !race.dnf && race.finish <= 3

export function seasonSummary(year: Season) {
  const races = seasons[year]
  const finished = races.filter(race => !race.dnf)
  const qualified = races.filter(race => race.quali !== null)
  const points = kimiStanding[year].at(-1)![0]
  return {
    races: races.length,
    wins: races.filter(isWin).length,
    podiums: races.filter(isPodium).length,
    poles: races.filter(race => race.quali === 1).length,
    fastestLaps: races.filter(race => race.fastestLapRank === 1).length,
    dnfs: races.length - finished.length,
    points,
    pointsPerRace: points / races.length,
    averageFinish: finished.reduce((sum, race) => sum + race.finish, 0) / finished.length,
    averageQuali: qualified.reduce((sum, race) => sum + race.quali!, 0) / qualified.length,
    positionsGained: finished.reduce((sum, race) => sum + race.grid - race.finish, 0),
    championshipPosition: kimiStanding[year].at(-1)![1],
  }
}

export function headToHead(year: Season) {
  const races = seasons[year]
  const quali = races.filter(race => race.quali !== null && race.teammateQuali !== null)
  const finishes = races.filter(race => race.teammateFinish !== null)
  return {
    quali: { kimi: quali.filter(race => race.quali! < race.teammateQuali!).length, teammate: quali.filter(race => race.quali! > race.teammateQuali!).length },
    race: { kimi: finishes.filter(race => race.finish < race.teammateFinish!).length, teammate: finishes.filter(race => race.finish > race.teammateFinish!).length },
  }
}

export function leaderboardAt(round: number) {
  return titleRaceDrivers
    .map(code => ({ code, points: titleRace2026[code][round - 1] }))
    .sort((a, b) => b.points - a.points)
}

// Age in whole years plus days since the last birthday, as F1 record books publish it.
export function ageAt(birth: string, date: string) {
  const [by, bm, bd] = birth.split('-').map(Number)
  const [ey, em, ed] = date.split('-').map(Number)
  const end = Date.UTC(ey, em - 1, ed)
  let years = new Date(end).getUTCFullYear() - by
  let birthday = Date.UTC(by + years, bm - 1, bd)
  if (birthday > end) birthday = Date.UTC(by + --years, bm - 1, bd)
  const days = Math.round((end - birthday) / 86_400_000)
  return { years, days, decimal: years + days / 365.25 }
}

export const youngestChampions = [
  { name: 'Kimi Antonelli', short: 'ANT', season: 2026, birth: '2006-08-25', clinched: '2026-11-01' },
  { name: 'Sebastian Vettel', short: 'VET', season: 2010, birth: '1987-07-03', clinched: '2010-11-14' },
  { name: 'Lewis Hamilton', short: 'HAM', season: 2008, birth: '1985-01-07', clinched: '2008-11-02' },
  { name: 'Max Verstappen', short: 'VER', season: 2021, birth: '1997-09-30', clinched: '2021-12-12' },
  { name: 'Fernando Alonso', short: 'ALO', season: 2005, birth: '1981-07-29', clinched: '2005-09-25' },
  { name: 'Emerson Fittipaldi', short: 'FIT', season: 1972, birth: '1946-12-12', clinched: '1972-09-10' },
].map(champion => ({ ...champion, age: ageAt(champion.birth, champion.clinched) })).sort((a, b) => a.age.decimal - b.age.decimal)

const circuitCodes: Record<string, string> = {
  Melbourne: 'AUS', Shanghai: 'CHN', Suzuka: 'JPN', Sakhir: 'BHR', Jeddah: 'KSA', Miami: 'MIA', Imola: 'IMO', 'Monte Carlo': 'MON',
  Barcelona: 'BAR', Montreal: 'CAN', Spielberg: 'AUT', Silverstone: 'GBR', Spa: 'BEL', Budapest: 'HUN', Zandvoort: 'NED', Monza: 'ITA',
  Baku: 'AZE', 'Marina Bay': 'SIN', Austin: 'USA', 'Mexico City': 'MEX', 'São Paulo': 'BRA', 'Las Vegas': 'LVG', Lusail: 'QAT',
  'Abu Dhabi': 'ABU', Madrid: 'MAD', 'Kuala Lumpur': 'KUL',
}
export const circuitCode = (circuit: string) => circuitCodes[circuit] ?? circuit.slice(0, 3).toUpperCase()
