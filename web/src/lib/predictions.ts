import { toNumber, type DbNumber } from '@/lib/neon'

export type DriverPrediction = {
  driver_code:        string
  team:               string
  predicted_position: number
  win_probability:    number
  podium_probability: number
  points_expected:    number
  confidence:         number
  elo_rating:         number
  grid_position:      number | null
  gap_to_pole_ms:     number | null
  rolling_avg_finish: number
  is_upset_pick:      boolean
  upset_score:        number | null
  actual_position:    number | null
  actual_points:      number | null
  position_error:     number | null
}

export type ChampionshipProjection = {
  driver_code:     string
  team:            string
  actual_points:   number
  projected_total: number
  races_done:      number
  races_remaining: number
}

export type PredictionAccuracy = {
  mae_position:   number | null
  winner_correct: boolean | null
  podium_hits:    number | null
  top5_hits:      number | null
  brier_score:    number | null
}

export type RacePrediction = {
  season:           number
  round:            number
  gp_name:          string
  circuit:          string
  model_version:    string
  confidence:       number
  simulation_runs:  number
  data_weight_2026: number
  training_seasons: string
  predicted_at:     string
  has_actuals:      boolean
  drivers:          DriverPrediction[]
  championship:     ChampionshipProjection[]
  accuracy:         PredictionAccuracy | null
}

export type PredictionRow = Omit<
  DriverPrediction,
  | 'win_probability'
  | 'podium_probability'
  | 'points_expected'
  | 'confidence'
  | 'elo_rating'
  | 'rolling_avg_finish'
  | 'upset_score'
  | 'actual_points'
> & {
  win_probability: DbNumber
  podium_probability: DbNumber
  points_expected: DbNumber
  confidence: DbNumber
  elo_rating: DbNumber
  rolling_avg_finish: DbNumber
  upset_score: DbNumber
  actual_points: DbNumber
  model_version: string
  simulation_runs: number
  data_weight_2026: DbNumber
  training_seasons: string
  predicted_at: string
  gp_name: string
  circuit: string
}

export type StandingRow = {
  driver_code: string
  team: string
  actual_points: DbNumber
}

export type AccuracyRow = {
  mae_position: DbNumber
  winner_correct: boolean | null
  podium_hits: number | null
  top5_hits: number | null
  brier_score: DbNumber
}

export function buildChampionshipProjection(
  standings: StandingRow[],
  predictions: PredictionRow[],
  racesDone: number,
  racesInSeason = racesDone,
) {
  const racesRemaining = Math.max(0, racesInSeason - racesDone)

  return standings
    .map((standing): ChampionshipProjection => {
      const pred = predictions.find((p) => p.driver_code === standing.driver_code)
      const expectedPoints = pred ? toNumber(pred.points_expected, 2.0) : 2.0
      const actualPoints = toNumber(standing.actual_points)

      return {
        driver_code:     standing.driver_code,
        team:            standing.team,
        actual_points:   actualPoints,
        projected_total: Math.round(actualPoints + expectedPoints * racesRemaining),
        races_done:      racesDone,
        races_remaining: racesRemaining,
      }
    })
    .sort((a, b) => b.projected_total - a.projected_total)
}

export function shapeRacePrediction(params: {
  season: number
  round: number
  predictions: PredictionRow[]
  championship: ChampionshipProjection[]
  accuracy: AccuracyRow[]
}): RacePrediction {
  const meta = params.predictions[0]

  return {
    season:           params.season,
    round:            params.round,
    gp_name:          meta.gp_name,
    circuit:          meta.circuit,
    model_version:    meta.model_version,
    confidence:       toNumber(meta.confidence),
    simulation_runs:  meta.simulation_runs,
    data_weight_2026: toNumber(meta.data_weight_2026),
    training_seasons: meta.training_seasons,
    predicted_at:     meta.predicted_at,
    has_actuals:      params.predictions.some((p) => p.actual_position !== null),
    championship:     params.championship,
    drivers: params.predictions.map((p) => ({
      driver_code:        p.driver_code,
      team:               p.team,
      predicted_position: p.predicted_position,
      win_probability:    toNumber(p.win_probability),
      podium_probability: toNumber(p.podium_probability),
      points_expected:    toNumber(p.points_expected),
      confidence:         toNumber(p.confidence),
      elo_rating:         toNumber(p.elo_rating),
      grid_position:      p.grid_position,
      gap_to_pole_ms:     p.gap_to_pole_ms,
      rolling_avg_finish: toNumber(p.rolling_avg_finish, 10.5),
      is_upset_pick:      p.is_upset_pick,
      upset_score:        p.upset_score ? toNumber(p.upset_score) : null,
      actual_position:    p.actual_position,
      actual_points:      p.actual_points ? toNumber(p.actual_points) : null,
      position_error:     p.position_error,
    })),
    accuracy: shapeAccuracy(params.accuracy),
  }
}

function shapeAccuracy(rows: AccuracyRow[]): PredictionAccuracy | null {
  if (rows.length === 0) return null
  const row = rows[0]
  return {
    mae_position:   row.mae_position ? toNumber(row.mae_position) : null,
    winner_correct: row.winner_correct,
    podium_hits:    row.podium_hits,
    top5_hits:      row.top5_hits,
    brier_score:    row.brier_score ? toNumber(row.brier_score) : null,
  }
}
