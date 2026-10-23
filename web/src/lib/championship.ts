/** Season-scenario model. Separate from the qualifying-aware race predictor.
 * Shared driver/team form is sampled once per season path, then weekends have
 * their own qualifying, race and retirement noise. Ranges are uncalibrated
 * scenario percentiles, not guaranteed limits or simultaneous best cases.
 */
export const RACE_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1]
export const SPRINT_POINTS = [8, 7, 6, 5, 4, 3, 2, 1]
export const CHAMPIONSHIP_VERSION = 'season_scenarios_v3'

export type CalendarEvent = {
  round: number; race_name: string; circuit_name: string; race_start_utc: string
  is_sprint_weekend: boolean; sprint_date: string | null
}
export type SeasonResult = {
  season: number; round: number; session_type: 'R' | 'S'; circuit: string
  driver_code: string; team: string; finish_position: number; grid_position: number | null
  points: number; status: string; qualifying_position: number | null; expected_drivers?: number
}
export type PublishedRace = { round: number; driver_code: string; predicted_position: number }
export type Band = { low: number; median: number; high: number; mean: number }
export type RaceScenario = {
  round: number; driver_code: string; position: Band; points: Band; cumulative_points: Band
  championship_position: Band; win_probability: number
  position_probabilities: number[]; championship_position_probabilities: number[]
}
export type ChampionshipDriver = {
  driver_code: string; team: string; active: boolean; current_position: number; current_points: number
  projected_position: number; position: Band; points: Band; title_probability: number
  podium_probability: number; position_probabilities: number[]; maximum_points: number
  points_eliminated: boolean
}
export type ClinchDriver = { driver_code: string; active: boolean; current_points: number; race_finishes: number[] }
export type ClinchContext = {
  round: number; future_points: number; future_races: number; sprint_pending: boolean
  drivers: ClinchDriver[]
  conditional: { driver_code: string; position: number; samples: number; clinches: number }[]
}
export function feasibleClassification(field: number, known: number[]): boolean {
  const classified = known.filter(p=>p>0)
  const available = field-known.filter(p=>p===0).length
  return available>0 && new Set(classified).size===classified.length
    && classified.every(p=>Number.isInteger(p)&&p<=available)
}
export type ClinchStatus = 'safe' | 'alive' | 'tie' | 'occupied'
/** Worst-case rival wins every remaining GP and sprint; candidate scores nothing.
 * Equal race countback is left unresolved here because next qualifying is unknown.
 */
export function clinchAgainst(candidate: ClinchDriver, rival: ClinchDriver, candidatePosition: number,
  rivalPosition: number, context: Pick<ClinchContext,'future_points'|'future_races'>,
  candidateSprintPoints = 0, rivalSprintPoints = 0): ClinchStatus {
  if (candidatePosition > 0 && candidatePosition === rivalPosition && rival.active) return 'occupied'
  const candidatePoints = candidate.current_points + (RACE_POINTS[candidatePosition-1] ?? 0) + candidateSprintPoints
  const rivalPoints = rival.current_points + (rival.active ? (RACE_POINTS[rivalPosition-1] ?? 0) + rivalSprintPoints + context.future_points : 0)
  if (candidatePoints > rivalPoints) return 'safe'
  if (candidatePoints < rivalPoints) return 'alive'
  const a = [...candidate.race_finishes], b = [...rival.race_finishes]
  if (candidatePosition) a[candidatePosition-1] = (a[candidatePosition-1] ?? 0)+1
  if (rival.active && rivalPosition) b[rivalPosition-1] = (b[rivalPosition-1] ?? 0)+1
  if (rival.active) b[0] = (b[0] ?? 0)+context.future_races
  for (let i=0;i<Math.max(a.length,b.length);i++) {
    if ((a[i]??0) !== (b[i]??0)) return (a[i]??0) > (b[i]??0) ? 'safe' : 'alive'
  }
  return 'tie'
}

export type ChampionshipForecast = {
  season: number; model_version: string; generated_at: string; as_of_round: number
  next_race_clinch: ClinchContext | null
  simulations: number; range_level: number; completed_races: number; completed_sprints: number
  remaining: (CalendarEvent & { race_pending: boolean; sprint_pending: boolean; awaiting_results: boolean })[]
  drivers: ChampionshipDriver[]; races: RaceScenario[]; warnings: string[]; unresolved_tie_probability: number
}

export class ChampionshipDataError extends Error {}
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))
function randomGenerator(seed: number) {
  let state = seed >>> 0
  return () => {
    state += 0x6D2B79F5
    let t = Math.imul(state ^ state >>> 15, 1 | state)
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t)
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}
function summarize(values: number[]): Band {
  const sorted = [...values].sort((a, b) => a - b)
  const q = (p: number) => sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)]
  return { low: q(.1), median: q(.5), high: q(.9), mean: values.reduce((a, b) => a + b, 0) / values.length }
}
function summarizeCounts(counts: number[]): Band {
  const total = counts.reduce((a, b) => a + b, 0)
  const quantile = (p: number) => {
    let cumulative = 0
    for (let i = 0; i < counts.length; i++) {
      cumulative += counts[i]
      if (cumulative >= total * p - 1e-9) return i + 1
    }
    return counts.length
  }
  return { low: quantile(.1), median: quantile(.5), high: quantile(.9),
    mean: counts.reduce((sum, value, i) => sum + value * (i + 1), 0) / total }
}
function complete(rows: SeasonResult[]) {
  return rows.length >= 2 && new Set(rows.map(r => r.driver_code)).size === rows.length
    && rows.every(r => !r.expected_drivers || r.expected_drivers === rows.length)
    && new Set(rows.map(r => r.finish_position)).size === rows.length
    && rows.every(r => Number.isInteger(r.finish_position) && r.finish_position >= 1 && r.finish_position <= rows.length
      && Number.isFinite(r.points) && r.points >= 0)
}
function compareCountback(a: number, b: number, points: number[], raceCounts: number[][], qualiCounts: number[][]) {
  if (points[b] !== points[a]) return points[b] - points[a]
  for (const counts of [raceCounts, qualiCounts]) {
    for (let place = 0; place < counts[a].length; place++) {
      if (counts[b][place] !== counts[a][place]) return counts[b][place] - counts[a][place]
    }
  }
  return 0 // Identical countback remains tied; never invent a driver-code tiebreak.
}

export function simulateChampionship(input: {
  season: number; calendar: CalendarEvent[]; results: SeasonResult[]; predictions?: PublishedRace[]
  simulations?: number; now?: string
}): ChampionshipForecast {
  const { season } = input
  const simulations = input.simulations ?? 5000
  if (!Number.isInteger(simulations) || simulations < 100 || simulations > 10000) throw new ChampionshipDataError('Invalid simulation count')
  const now = new Date(input.now ?? new Date().toISOString())
  if (!Number.isFinite(now.getTime())) throw new ChampionshipDataError('Invalid snapshot time')
  const calendar = [...input.calendar].sort((a, b) => a.round - b.round)
  if (!calendar.length || calendar.length > 40 || new Set(calendar.map(r => r.round)).size !== calendar.length
      || calendar.some(r => !Number.isInteger(r.round) || !Number.isFinite(Date.parse(r.race_start_utc)))) {
    throw new ChampionshipDataError('A complete, unambiguous season calendar is required')
  }
  const groups = new Map<string, SeasonResult[]>()
  for (const row of input.results) {
    const key = `${row.season}:${row.round}:${row.session_type}`
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  const currentRaces = calendar.filter(event => complete(groups.get(`${season}:${event.round}:R`) ?? []))
  if (!currentRaces.length) throw new ChampionshipDataError('Season scenarios start after the first complete race classification')
  const last = currentRaces.at(-1)!
  const activeRows = groups.get(`${season}:${last.round}:R`)!
  const active = new Set(activeRows.map(r => r.driver_code))
  const current = input.results.filter(r => r.season === season)
  // A partial classification must never be silently added to points or simulated
  // again as a full race. Surface the ingestion gap and let the caller retry.
  for (const event of calendar) {
    for (const kind of ['R', 'S']) {
      const rows = groups.get(`${season}:${event.round}:${kind}`) ?? []
      if (rows.length && !complete(rows)) throw new ChampionshipDataError(`Incomplete ${kind === 'R' ? 'race' : 'sprint'} classification at round ${event.round}`)
    }
  }
  const drivers = [...new Set(current.map(r => r.driver_code))].sort()
  if (drivers.length < 2 || drivers.length > 40) throw new ChampionshipDataError('Driver roster is unavailable')
  const n = drivers.length
  const team = drivers.map(code => [...current].reverse().find(r => r.driver_code === code)!.team)
  const points = drivers.map(code => current.filter(r => r.driver_code === code).reduce((sum, r) => sum + r.points, 0))
  const countSize = 40
  const raceCounts = drivers.map(() => Array<number>(countSize).fill(0))
  const qualiCounts = drivers.map(() => Array<number>(countSize).fill(0))
  for (const r of current.filter(r => r.session_type === 'R')) {
    const i = drivers.indexOf(r.driver_code)
    raceCounts[i][r.finish_position - 1]++
    if (r.qualifying_position && r.qualifying_position <= countSize) qualiCounts[i][r.qualifying_position - 1]++
  }
  const currentOrder = drivers.map((_, i) => i).sort((a, b) => compareCountback(a, b, points, raceCounts, qualiCounts))
  const remaining = calendar.flatMap(event => {
    const racePending = !complete(groups.get(`${season}:${event.round}:R`) ?? [])
    const sprintPending = event.is_sprint_weekend && !complete(groups.get(`${season}:${event.round}:S`) ?? [])
    return racePending || sprintPending ? [{ ...event, race_pending: racePending, sprint_pending: sprintPending,
      awaiting_results: new Date(event.race_start_utc) < now }] : []
  })
  const publishedByRound = new Map(remaining.flatMap(event => {
    const rows = input.predictions?.filter(p => p.round === event.round) ?? []
    return rows.length === active.size && new Set(rows.map(r => r.driver_code)).size === active.size
      && rows.every(r => active.has(r.driver_code) && Number.isInteger(r.predicted_position)
        && r.predicted_position >= 1 && r.predicted_position <= active.size)
      && new Set(rows.map(r => r.predicted_position)).size === active.size ? [[event.round, rows] as const] : []
  }))
  const history = input.results.filter(r => r.session_type === 'R' && r.season <= season && complete(groups.get(`${r.season}:${r.round}:R`) ?? []))
  const form = drivers.map(code => {
    const races = history.filter(r => r.driver_code === code && r.season === season).slice(-8)
    let total = 0, mass = 0
    for (let k = 0; k < races.length; k++) {
      const row = races[k], field = groups.get(`${row.season}:${row.round}:R`)!.length
      const normalize = (p: number) => 1 + (p - 1) * (activeRows.length - 1) / Math.max(1, field - 1)
      const grid = row.qualifying_position ?? row.grid_position ?? row.finish_position
      const finished = /finished|lap/i.test(row.status)
      const pace = finished ? .55 * normalize(row.finish_position) + .45 * normalize(grid) : normalize(grid)
      const weight = Math.exp(-.22 * (races.length - 1 - k))
      total += pace * weight; mass += weight
    }
    const failures = races.filter(r => !/finished|lap/i.test(r.status)).length
    return { pace: mass ? total / mass : (activeRows.length + 1) / 2,
      risk: clamp((failures + 1) / (races.length + 10), .025, .3), observations: races.length }
  })
  const expected = remaining.map(event => drivers.map((code, i) => {
    const circuitRaces = history.filter(r => r.driver_code === code && r.circuit.toLowerCase().trim() === event.circuit_name.toLowerCase().trim()
      && /finished|lap/i.test(r.status))
    const residuals = circuitRaces.map(r => r.finish_position - (r.qualifying_position ?? r.grid_position ?? r.finish_position))
    const circuitAdjustment = residuals.reduce((sum, value) => sum + value, 0) / (residuals.length + 5)
    const published = publishedByRound.get(event.round)?.find(r => r.driver_code === code)
    return clamp(published ? .6 * published.predicted_position + .4 * form[i].pace : form[i].pace + .35 * circuitAdjustment, 1, activeRows.length)
  }))
  const random = randomGenerator(season * 101 + last.round * 13 + simulations)
  const normal = () => Math.sqrt(-2 * Math.log(Math.max(random(), 1e-12))) * Math.cos(2 * Math.PI * random())
  const activeIndices = drivers.map((code, i) => active.has(code) ? i : -1).filter(i => i >= 0)
  const finalPoints = drivers.map(() => [] as number[])
  const positionCounts = drivers.map(() => Array<number>(n).fill(0))
  const raceSamples = remaining.map(() => drivers.map(() => ({ position: [] as number[], points: [] as number[], cumulative: [] as number[], championship: Array<number>(n).fill(0), wins: 0 })))
  const nextClinch = remaining[0]?.race_pending ? {
    round: remaining[0].round, sprint_pending: remaining[0].sprint_pending,
    future_points: remaining.slice(1).reduce((sum,e)=>sum+(e.race_pending?25:0)+(e.sprint_pending?8:0),0),
    future_races: remaining.slice(1).filter(e=>e.race_pending).length,
    drivers: drivers.map((driver_code,i)=>({ driver_code, active: active.has(driver_code), current_points: points[i], race_finishes: raceCounts[i] })),
    conditional: [] as ClinchContext['conditional'],
  } : null
  const clinchCounts = drivers.map(()=>Array.from({length:active.size},()=>({samples:0,clinches:0})))
  let unresolvedTies = 0
  const distributePositions = (totals: number[], rc: number[][], qc: number[][], emit: (i: number, rank: number, share: number) => void) => {
    const order = drivers.map((_, i) => i).sort((a, b) => compareCountback(a, b, totals, rc, qc))
    let tiedForFirst = false
    for (let start = 0; start < order.length;) {
      let end = start + 1
      while (end < order.length && compareCountback(order[start], order[end], totals, rc, qc) === 0) end++
      if (start === 0 && end > 1) tiedForFirst = true
      for (let k = start; k < end; k++) for (let rank = start + 1; rank <= end; rank++) emit(order[k], rank, 1 / (end - start))
      start = end
    }
    return tiedForFirst
  }
  for (let draw = 0; draw < simulations; draw++) {
    const totals = [...points], rc = raceCounts.map(row => [...row]), qc = qualiCounts.map(row => [...row])
    const teamForm = new Map([...new Set(team)].map(t => [t, normal() * .8]))
    const persistent = drivers.map((_, i) => normal() * (form[i].observations < 4 ? 1.7 : 1.) + teamForm.get(team[i])!)
    for (let e = 0; e < remaining.length; e++) {
      const event = remaining[e], before = [...totals]
      const weekend = drivers.map(() => normal() * .75)
      const pace = (i: number) => expected[e][i] + persistent[i] + weekend[i]
      const quali = [...activeIndices].sort((a, b) => a - b).map(i => ({ i, score: pace(i) + 2.2 * normal() })).sort((a, b) => a.score - b.score)
      const grid = Array<number>(n).fill(n)
      quali.forEach(({ i }, rank) => { grid[i] = rank + 1; if (event.race_pending) qc[i][rank]++ })
      const gpPoints = Array<number>(n).fill(0)
      const run = (sprint: boolean) => {
        // A shared reliability shock correlates disruption across the field.
        const chaos = random() < .12 ? 1.5 : 1
        const order = activeIndices.map(i => {
          const retired = random() < form[i].risk * (sprint ? .4 : 1) * chaos
          return { i, retired, score: retired ? activeIndices.length + 8 * random()
            : .45 * grid[i] + .55 * pace(i) + (sprint ? 2.2 : 3.2) * normal() }
        }).sort((a, b) => Number(a.retired) - Number(b.retired) || a.score - b.score)
        const scoring = sprint ? SPRINT_POINTS : RACE_POINTS
        order.forEach(({ i, retired }, rank) => {
          // Retirements can retain classified positions but cannot earn points
          // in this simplified outlook. Existing actual points are never altered.
          if (!retired) totals[i] += scoring[rank] ?? 0
          if (!sprint) {
            gpPoints[i] = retired ? 0 : scoring[rank] ?? 0
            rc[i][rank]++
            raceSamples[e][i].position.push(rank + 1)
            if (rank === 0) raceSamples[e][i].wins++
          }
        })
      }
      if (event.sprint_pending) run(true)
      if (event.race_pending) run(false)
      for (let i = 0; i < n; i++) {
        raceSamples[e][i].points.push(totals[i] - before[i])
        raceSamples[e][i].cumulative.push(totals[i])
      }
      distributePositions(totals, rc, qc, (i, rank, share) => { raceSamples[e][i].championship[rank - 1] += share })
      if (e === 0 && nextClinch) {
        for (const i of activeIndices) {
          const rank = raceSamples[e][i].position.at(-1)!
          // Condition on the stated points-paying finish, not a retirement with
          // the same classification number but no points in this model.
          if (gpPoints[i] !== (RACE_POINTS[rank-1] ?? 0)) continue
          const counter = clinchCounts[i][rank-1]
          counter.samples++
          const locked = drivers.every((_,j)=> {
            if (i===j) return true
            const maxPoints = totals[j] + (active.has(drivers[j]) ? nextClinch.future_points : 0)
            if (totals[i] !== maxPoints) return totals[i] > maxPoints
            const worstRace = [...rc[j]], worstQuali = [...qc[j]]
            if (active.has(drivers[j])) {
              worstRace[0] += nextClinch.future_races
              worstQuali[0] += nextClinch.future_races
            }
            for (const [a,b] of [[rc[i],worstRace],[qc[i],worstQuali]]) {
              for(let place=0;place<a.length;place++) if(a[place]!==b[place]) return a[place]>b[place]
            }
            return false
          })
          if (locked) counter.clinches++
        }
      }
    }
    if (distributePositions(totals, rc, qc, (i, rank, share) => {
      positionCounts[i][rank - 1] += share
    })) unresolvedTies++
    for (let i = 0; i < n; i++) finalPoints[i].push(totals[i])
  }
  if (nextClinch) nextClinch.conditional = drivers.flatMap((driver_code,i)=>clinchCounts[i].map((counter,rank)=>({driver_code,position:rank+1,...counter})))
  const available = remaining.reduce((sum, e) => sum + (e.race_pending ? 25 : 0) + (e.sprint_pending ? 8 : 0), 0)
  const maximumCurrent = Math.max(...points)
  const output = drivers.map((code, i): ChampionshipDriver => ({
    driver_code: code, team: team[i], active: active.has(code), current_position: currentOrder.indexOf(i) + 1,
    current_points: points[i], projected_position: 0, position: summarizeCounts(positionCounts[i]), points: summarize(finalPoints[i]),
    title_probability: positionCounts[i][0] / simulations,
    podium_probability: positionCounts[i].slice(0, 3).reduce((a, b) => a + b, 0) / simulations,
    position_probabilities: positionCounts[i].map(count => count / simulations),
    maximum_points: points[i] + (active.has(code) ? available : 0),
    points_eliminated: points[i] + (active.has(code) ? available : 0) < maximumCurrent,
  })).sort((a, b) => a.position.mean - b.position.mean || b.points.mean - a.points.mean)
  output.forEach((driver, rank) => { driver.projected_position = rank + 1 })
  const races = remaining.flatMap((event, e) => drivers.flatMap((code, i): RaceScenario[] => {
    const samples = raceSamples[e][i]
    return [{ round: event.round, driver_code: code,
      position: samples.position.length ? summarize(samples.position) : { low: 0, median: 0, high: 0, mean: 0 },
      points: summarize(samples.points), cumulative_points: summarize(samples.cumulative),
      championship_position: summarizeCounts(samples.championship), win_probability: samples.wins / simulations,
      position_probabilities: Array.from({ length: active.size }, (_, rank) => samples.position.filter(p => p === rank + 1).length / simulations),
      championship_position_probabilities: samples.championship.map(count => count / simulations) }]
  }))
  const warnings = [
    'Experimental season scenarios, not calibrated championship probabilities. Best/worst ranges are the central 80% of simulated outcomes, not absolute limits.',
    'Uses recent qualifying and finishing form, available pre-race forecasts, and shrunk circuit history. Unknown qualifying, future driver/team form and retirements are simulated.',
    'Assumes the latest complete race roster continues, scheduled events run for full points, and no future penalties or points adjustments. It does not forecast weather or car upgrades.',
  ]
  if (remaining.some(r => r.awaiting_results)) warnings.push('A scheduled race has started without a complete result in the database; its outcome remains uncertain here.')
  if (unresolvedTies) warnings.push('Identical race and qualifying countback ties share title probability; display order is not an official tie ruling.')
  return { season, model_version: CHAMPIONSHIP_VERSION, generated_at: now.toISOString(), as_of_round: last.round,
    next_race_clinch: nextClinch, simulations, range_level: .8, completed_races: currentRaces.length,
    completed_sprints: calendar.filter(e => complete(groups.get(`${season}:${e.round}:S`) ?? [])).length,
    remaining, drivers: output, races, warnings, unresolved_tie_probability: unresolvedTies / simulations }
}
