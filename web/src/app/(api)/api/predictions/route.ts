import { NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.NEON_DATABASE_URL!)

const RACES_PER_SEASON = 24

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
  championship:     { driver_code: string; team: string; actual_points: number; projected_total: number; races_done: number; races_remaining: number }[]
  accuracy:         {
    mae_position:   number | null
    winner_correct: boolean | null
    podium_hits:    number | null
    top5_hits:      number | null
    brier_score:    number | null
  } | null
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const season  = searchParams.get('season')  ? parseInt(searchParams.get('season')!)  : null
  const round   = searchParams.get('round')   ? parseInt(searchParams.get('round')!)   : null
  const latest  = searchParams.get('latest')  === '1'
  const history = searchParams.get('history') === '1'

  try {
    // ── Accuracy history ───────────────────────────────────────────────────────
    if (history) {
      const rows = await sql`
        SELECT pa.season, pa.round, pa.model_version,
               pa.mae_position, pa.winner_correct,
               pa.podium_hits, pa.top5_hits, pa.brier_score,
               s.gp_name, s.circuit
        FROM prediction_accuracy pa
        JOIN sessions s ON s.season = pa.season AND s.round = pa.round AND s.session_type = 'R'
        ORDER BY pa.season DESC, pa.round DESC
        LIMIT 50
      `
      return NextResponse.json({ accuracy_history: rows })
    }

    // ── Determine target race ──────────────────────────────────────────────────
    let targetSeason = season
    let targetRound  = round

    if (latest || (!season && !round)) {
      const latest_row = await sql`
        SELECT season, round FROM predictions ORDER BY predicted_at DESC LIMIT 1
      `
      if (latest_row.length === 0) {
        return NextResponse.json({ error: 'No predictions available yet' }, { status: 404 })
      }
      targetSeason = latest_row[0].season
      targetRound  = latest_row[0].round
    }

    if (!targetSeason || !targetRound) {
      return NextResponse.json({ error: 'Provide ?season=&round= or ?latest=1' }, { status: 400 })
    }

    // ── Fetch predictions ──────────────────────────────────────────────────────
    const predictions = await sql`
      SELECT p.driver_code, p.team,
             p.predicted_position, p.win_probability, p.podium_probability,
             p.points_expected, p.confidence, p.model_version,
             p.simulation_runs, p.data_weight_2026, p.training_seasons,
             p.elo_rating, p.grid_position, p.gap_to_pole_ms, p.rolling_avg_finish,
             p.is_upset_pick, p.upset_score,
             p.actual_position, p.actual_points, p.position_error,
             p.predicted_at, p.gp_name, p.circuit
      FROM predictions p
      WHERE p.season = ${targetSeason}
        AND p.round  = ${targetRound}
      ORDER BY p.win_probability DESC
    `

    if (predictions.length === 0) {
      return NextResponse.json(
        { error: `No predictions for ${targetSeason} R${targetRound}` },
        { status: 404 }
      )
    }

    // ── Fetch accuracy ─────────────────────────────────────────────────────────
    const accuracy = await sql`
      SELECT mae_position, winner_correct, podium_hits, top5_hits, brier_score
      FROM prediction_accuracy
      WHERE season = ${targetSeason} AND round = ${targetRound}
      LIMIT 1
    `

    // ── Championship projection ────────────────────────────────────────────────
    // Include both race (R) and sprint (S) points.
    // If sprint results aren't ingested yet, IN ('R','S') still works —
    // it just sums whatever exists and picks up sprint points automatically
    // once they're loaded.
    const standings = await sql`
      SELECT r.driver_code, r.team, SUM(r.points)::numeric AS actual_points
      FROM results r
      JOIN sessions s ON s.id = r.session_id
      WHERE s.season = ${targetSeason}
        AND s.session_type IN ('R', 'S')
      GROUP BY r.driver_code, r.team
      ORDER BY actual_points DESC
    `

    // nDone = number of race rounds completed (not sprint sessions —
    // we don't want to double-count rounds that have both R and S)
    const nDoneRow = await sql`
      SELECT COUNT(DISTINCT round)::int AS n FROM sessions
      WHERE season = ${targetSeason} AND session_type = 'R' AND date <= NOW()
    `

    const nDone      = nDoneRow[0]?.n ?? 0
    const nRemaining = Math.max(0, RACES_PER_SEASON - nDone)

    const championship = standings.map((s: any) => {
      const pred = predictions.find((p: any) => p.driver_code === s.driver_code)
      const pts  = pred ? parseFloat(pred.points_expected) : 2.0
      return {
        driver_code:     s.driver_code,
        team:            s.team,
        actual_points:   parseFloat(s.actual_points),
        projected_total: Math.round(parseFloat(s.actual_points) + pts * nRemaining),
        races_done:      nDone,
        races_remaining: nRemaining,
      }
    }).sort((a: any, b: any) => b.projected_total - a.projected_total)

    // ── Shape response ─────────────────────────────────────────────────────────
    const meta = predictions[0]
    const response: RacePrediction = {
      season:           targetSeason,
      round:            targetRound,
      gp_name:          meta.gp_name,
      circuit:          meta.circuit,
      model_version:    meta.model_version,
      confidence:       parseFloat(meta.confidence),
      simulation_runs:  meta.simulation_runs,
      data_weight_2026: parseFloat(meta.data_weight_2026 ?? 0),
      training_seasons: meta.training_seasons,
      predicted_at:     meta.predicted_at,
      has_actuals:      predictions.some((p: any) => p.actual_position !== null),
      championship,
      drivers: predictions.map((p: any) => ({
        driver_code:        p.driver_code,
        team:               p.team,
        predicted_position: p.predicted_position,
        win_probability:    parseFloat(p.win_probability),
        podium_probability: parseFloat(p.podium_probability),
        points_expected:    parseFloat(p.points_expected ?? 0),
        confidence:         parseFloat(p.confidence),
        elo_rating:         parseFloat(p.elo_rating ?? 0),
        grid_position:      p.grid_position,
        gap_to_pole_ms:     p.gap_to_pole_ms,
        rolling_avg_finish: parseFloat(p.rolling_avg_finish ?? 10.5),
        is_upset_pick:      p.is_upset_pick,
        upset_score:        p.upset_score ? parseFloat(p.upset_score) : null,
        actual_position:    p.actual_position,
        actual_points:      p.actual_points ? parseFloat(p.actual_points) : null,
        position_error:     p.position_error,
      })),
      accuracy: accuracy.length > 0 ? {
        mae_position:   accuracy[0].mae_position   ? parseFloat(accuracy[0].mae_position)   : null,
        winner_correct: accuracy[0].winner_correct,
        podium_hits:    accuracy[0].podium_hits,
        top5_hits:      accuracy[0].top5_hits,
        brier_score:    accuracy[0].brier_score ? parseFloat(accuracy[0].brier_score) : null,
      } : null,
    }

    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' }
    })

  } catch (err) {
    console.error('[/api/predictions] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}