// Generated snapshot from the Jolpica F1 API (Ergast-compatible), reviewed 2026-11-03.
// Grand Prix rows only; sprint points appear in the standings totals. dnf marks a retirement, even one still classified (finish keeps that position).
export const SEASON_SOURCE = 'https://api.jolpi.ca/ergast/f1/'
export type Race = { round: number; race: string; circuit: string; date: string; grid: number; finish: number; dnf: boolean; points: number; fastestLapRank: number | null; quali: number | null; teammateQuali: number | null; teammateFinish: number | null }
export const seasons: Record<2025 | 2026, Race[]> = {
  2025: [
    {round: 1, race: 'Australian', circuit: 'Melbourne', date: '2025-03-16', grid: 16, finish: 4, dnf: false, points: 12, fastestLapRank: 9, quali: 16, teammateQuali: 4, teammateFinish: 3},
    {round: 2, race: 'Chinese', circuit: 'Shanghai', date: '2025-03-23', grid: 8, finish: 6, dnf: false, points: 8, fastestLapRank: 11, quali: 8, teammateQuali: 2, teammateFinish: 3},
    {round: 3, race: 'Japanese', circuit: 'Suzuka', date: '2025-04-06', grid: 6, finish: 6, dnf: false, points: 8, fastestLapRank: 1, quali: 6, teammateQuali: 5, teammateFinish: 5},
    {round: 4, race: 'Bahrain', circuit: 'Sakhir', date: '2025-04-13', grid: 5, finish: 11, dnf: false, points: 0, fastestLapRank: 9, quali: 4, teammateQuali: 2, teammateFinish: 2},
    {round: 5, race: 'Saudi Arabian', circuit: 'Jeddah', date: '2025-04-20', grid: 5, finish: 6, dnf: false, points: 8, fastestLapRank: 5, quali: 5, teammateQuali: 3, teammateFinish: 5},
    {round: 6, race: 'Miami', circuit: 'Miami', date: '2025-05-04', grid: 3, finish: 6, dnf: false, points: 8, fastestLapRank: 9, quali: 3, teammateQuali: 5, teammateFinish: 3},
    {round: 7, race: 'Emilia Romagna', circuit: 'Imola', date: '2025-05-18', grid: 13, finish: 19, dnf: true, points: 0, fastestLapRank: 18, quali: 13, teammateQuali: 3, teammateFinish: 7},
    {round: 8, race: 'Monaco', circuit: 'Monte Carlo', date: '2025-05-25', grid: 15, finish: 18, dnf: false, points: 0, fastestLapRank: 3, quali: 15, teammateQuali: 14, teammateFinish: 11},
    {round: 9, race: 'Spanish', circuit: 'Barcelona', date: '2025-06-01', grid: 6, finish: 18, dnf: true, points: 0, fastestLapRank: 12, quali: 6, teammateQuali: 4, teammateFinish: 4},
    {round: 10, race: 'Canadian', circuit: 'Montreal', date: '2025-06-15', grid: 4, finish: 3, dnf: false, points: 15, fastestLapRank: 7, quali: 4, teammateQuali: 1, teammateFinish: 1},
    {round: 11, race: 'Austrian', circuit: 'Spielberg', date: '2025-06-29', grid: 9, finish: 19, dnf: true, points: 0, fastestLapRank: null, quali: 9, teammateQuali: 5, teammateFinish: 5},
    {round: 12, race: 'British', circuit: 'Silverstone', date: '2025-07-06', grid: 10, finish: 16, dnf: true, points: 0, fastestLapRank: 17, quali: 7, teammateQuali: 4, teammateFinish: 10},
    {round: 13, race: 'Belgian', circuit: 'Spa', date: '2025-07-27', grid: 19, finish: 16, dnf: false, points: 0, fastestLapRank: 1, quali: 18, teammateQuali: 6, teammateFinish: 5},
    {round: 14, race: 'Hungarian', circuit: 'Budapest', date: '2025-08-03', grid: 15, finish: 10, dnf: false, points: 1, fastestLapRank: 13, quali: 15, teammateQuali: 4, teammateFinish: 3},
    {round: 15, race: 'Dutch', circuit: 'Zandvoort', date: '2025-08-31', grid: 11, finish: 16, dnf: false, points: 0, fastestLapRank: 6, quali: 11, teammateQuali: 5, teammateFinish: 4},
    {round: 16, race: 'Italian', circuit: 'Monza', date: '2025-09-07', grid: 6, finish: 9, dnf: false, points: 2, fastestLapRank: 10, quali: 7, teammateQuali: 6, teammateFinish: 5},
    {round: 17, race: 'Azerbaijan', circuit: 'Baku', date: '2025-09-21', grid: 4, finish: 4, dnf: false, points: 12, fastestLapRank: 6, quali: 4, teammateQuali: 5, teammateFinish: 2},
    {round: 18, race: 'Singapore', circuit: 'Marina Bay', date: '2025-10-05', grid: 4, finish: 5, dnf: false, points: 10, fastestLapRank: 4, quali: 4, teammateQuali: 1, teammateFinish: 1},
    {round: 19, race: 'United States', circuit: 'Austin', date: '2025-10-19', grid: 7, finish: 13, dnf: false, points: 0, fastestLapRank: 1, quali: 7, teammateQuali: 4, teammateFinish: 6},
    {round: 20, race: 'Mexico City', circuit: 'Mexico City', date: '2025-10-26', grid: 6, finish: 6, dnf: false, points: 8, fastestLapRank: 9, quali: 6, teammateQuali: 4, teammateFinish: 7},
    {round: 21, race: 'São Paulo', circuit: 'São Paulo', date: '2025-11-09', grid: 2, finish: 2, dnf: false, points: 18, fastestLapRank: 9, quali: 2, teammateQuali: 6, teammateFinish: 4},
    {round: 22, race: 'Las Vegas', circuit: 'Las Vegas', date: '2025-11-23', grid: 17, finish: 3, dnf: false, points: 15, fastestLapRank: 2, quali: 17, teammateQuali: 4, teammateFinish: 2},
    {round: 23, race: 'Qatar', circuit: 'Lusail', date: '2025-11-30', grid: 5, finish: 5, dnf: false, points: 10, fastestLapRank: 8, quali: 5, teammateQuali: 4, teammateFinish: 6},
    {round: 24, race: 'Abu Dhabi', circuit: 'Abu Dhabi', date: '2025-12-07', grid: 14, finish: 15, dnf: false, points: 0, fastestLapRank: 9, quali: 14, teammateQuali: 4, teammateFinish: 5},
  ],
  2026: [
    {round: 1, race: 'Australian', circuit: 'Melbourne', date: '2026-03-08', grid: 2, finish: 2, dnf: false, points: 18, fastestLapRank: 3, quali: 2, teammateQuali: 1, teammateFinish: 1},
    {round: 2, race: 'Chinese', circuit: 'Shanghai', date: '2026-03-15', grid: 1, finish: 1, dnf: false, points: 25, fastestLapRank: 1, quali: 1, teammateQuali: 2, teammateFinish: 2},
    {round: 3, race: 'Japanese', circuit: 'Suzuka', date: '2026-03-29', grid: 1, finish: 1, dnf: false, points: 25, fastestLapRank: 1, quali: 1, teammateQuali: 2, teammateFinish: 4},
    {round: 4, race: 'Miami', circuit: 'Miami', date: '2026-05-03', grid: 1, finish: 1, dnf: false, points: 25, fastestLapRank: 3, quali: 1, teammateQuali: 5, teammateFinish: 4},
    {round: 5, race: 'Canadian', circuit: 'Montreal', date: '2026-05-24', grid: 2, finish: 1, dnf: false, points: 25, fastestLapRank: 1, quali: 2, teammateQuali: 1, teammateFinish: 19},
    {round: 6, race: 'Monaco', circuit: 'Monte Carlo', date: '2026-06-07', grid: 1, finish: 1, dnf: false, points: 25, fastestLapRank: 1, quali: 1, teammateQuali: 6, teammateFinish: 12},
    {round: 7, race: 'Barcelona', circuit: 'Barcelona', date: '2026-06-14', grid: 3, finish: 16, dnf: true, points: 0, fastestLapRank: 7, quali: 3, teammateQuali: 1, teammateFinish: 2},
    {round: 8, race: 'Austrian', circuit: 'Spielberg', date: '2026-06-28', grid: 4, finish: 3, dnf: false, points: 15, fastestLapRank: 1, quali: 4, teammateQuali: 1, teammateFinish: 1},
    {round: 9, race: 'British', circuit: 'Silverstone', date: '2026-07-05', grid: 1, finish: 15, dnf: false, points: 0, fastestLapRank: 1, quali: 1, teammateQuali: 4, teammateFinish: 2},
    {round: 10, race: 'Belgian', circuit: 'Spa', date: '2026-07-19', grid: 1, finish: 1, dnf: false, points: 25, fastestLapRank: 2, quali: 1, teammateQuali: 4, teammateFinish: 22},
    {round: 11, race: 'Hungarian', circuit: 'Budapest', date: '2026-07-26', grid: 7, finish: 3, dnf: false, points: 15, fastestLapRank: 3, quali: 4, teammateQuali: 7, teammateFinish: 7},
    {round: 12, race: 'Dutch', circuit: 'Zandvoort', date: '2026-08-23', grid: 3, finish: 2, dnf: false, points: 18, fastestLapRank: 5, quali: 3, teammateQuali: 2, teammateFinish: 3},
    {round: 13, race: 'Italian', circuit: 'Monza', date: '2026-09-06', grid: 19, finish: 1, dnf: false, points: 25, fastestLapRank: 1, quali: 7, teammateQuali: 2, teammateFinish: 2},
    {round: 14, race: 'Spanish', circuit: 'Madrid', date: '2026-09-13', grid: 2, finish: 1, dnf: false, points: 25, fastestLapRank: 2, quali: 2, teammateQuali: 6, teammateFinish: 5},
    {round: 15, race: 'Azerbaijan', circuit: 'Baku', date: '2026-09-26', grid: 16, finish: 5, dnf: false, points: 10, fastestLapRank: 3, quali: 16, teammateQuali: 1, teammateFinish: 1},
    {round: 16, race: 'Bahrain in Malaysia', circuit: 'Kuala Lumpur', date: '2026-10-04', grid: 3, finish: 2, dnf: false, points: 18, fastestLapRank: 2, quali: 4, teammateQuali: 8, teammateFinish: 20},
    {round: 17, race: 'Singapore', circuit: 'Marina Bay', date: '2026-10-11', grid: 4, finish: 3, dnf: false, points: 15, fastestLapRank: 2, quali: 4, teammateQuali: 6, teammateFinish: 9},
    {round: 18, race: 'United States', circuit: 'Austin', date: '2026-10-25', grid: 1, finish: 1, dnf: false, points: 25, fastestLapRank: 4, quali: 1, teammateQuali: 6, teammateFinish: 8},
    {round: 19, race: 'Mexico City', circuit: 'Mexico City', date: '2026-11-01', grid: 4, finish: 3, dnf: false, points: 15, fastestLapRank: 3, quali: 5, teammateQuali: 2, teammateFinish: 6},
  ],
}
// Championship points after each 2026 round, including sprints.
export const titleRaceDrivers = ['ANT', 'VER', 'HAM', 'RUS', 'LEC', 'NOR'] as const
export const titleRace2026: Record<(typeof titleRaceDrivers)[number], number[]> = {
  ANT: [18, 47, 72, 100, 131, 156, 156, 171, 179, 204, 219, 242, 267, 292, 302, 320, 340, 365, 380],
  VER: [8, 8, 12, 26, 43, 43, 55, 73, 76, 91, 109, 112, 127, 145, 163, 188, 221, 236, 261],
  HAM: [12, 33, 41, 51, 72, 90, 115, 125, 147, 159, 169, 183, 191, 191, 199, 214, 229, 241, 259],
  RUS: [25, 51, 63, 80, 88, 88, 106, 131, 154, 154, 160, 183, 201, 211, 236, 236, 238, 242, 250],
  LEC: [15, 34, 49, 59, 75, 75, 75, 79, 108, 126, 138, 155, 155, 167, 179, 191, 215, 233, 245],
  NOR: [10, 15, 25, 51, 58, 58, 73, 79, 97, 103, 128, 159, 171, 186, 186, 188, 201, 211, 221],
}
export const kimiStanding = {
  2025: [[12, 4], [22, 5], [30, 5], [30, 6], [38, 6], [48, 6], [48, 7], [48, 7], [48, 7], [63, 7], [63, 7], [63, 7], [63, 7], [64, 7], [64, 7], [66, 8], [78, 7], [88, 7], [89, 7], [97, 7], [122, 7], [137, 7], [150, 7], [150, 7]],
  2026: [[18, 2], [47, 2], [72, 1], [100, 1], [131, 1], [156, 1], [156, 1], [171, 1], [179, 1], [204, 1], [219, 1], [242, 1], [267, 1], [292, 1], [302, 1], [320, 1], [340, 1], [365, 1], [380, 1]],
}
export const sprints = {
  2025: [{race: 'Chinese', grid: 7, finish: 7, points: 2}, {race: 'Miami', grid: 1, finish: 7, points: 2}, {race: 'Belgian', grid: 19, finish: 17, points: 0}, {race: 'United States', grid: 11, finish: 8, points: 1}, {race: 'S\u00e3o Paulo', grid: 2, finish: 2, points: 7}, {race: 'Qatar', grid: 7, finish: 6, points: 3}],
  2026: [{race: 'Chinese', grid: 2, finish: 5, points: 4}, {race: 'Miami', grid: 2, finish: 6, points: 3}, {race: 'Canadian', grid: 2, finish: 3, points: 6}, {race: 'British', grid: 2, finish: 1, points: 8}, {race: 'Dutch', grid: 5, finish: 4, points: 5}, {race: 'Singapore', grid: 7, finish: 4, points: 5}],
}
