import { NextResponse } from 'next/server'
import { getNeonSql, PRODUCTION_MODEL_PREFIX } from '@/lib/neon'
import {
  buildChampionshipProjection,
  shapeRacePrediction,
  type AccuracyRow,
  type PredictionRow,
  type StandingRow,
} from '@/lib/predictions'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const season  = searchParams.get('season')  ? parseInt(searchParams.get('season')!)  : null
  const round   = searchParams.get('round')   ? parseInt(searchParams.get('round')!)   : null
  const latest  = searchParams.get('latest')  === '1'
  const history = searchParams.get('history') === '1'
  const model   = searchParams.get('model')

  try {
    const sql = getNeonSql()

    if (history) {
      const rows = await sql`
        SELECT DISTINCT ON (pa.season, pa.round)
               pa.season, pa.round, pa.model_version,
               pa.mae_position, pa.winner_correct,
               pa.podium_hits, pa.top5_hits, pa.brier_score,
               s.gp_name, s.circuit
        FROM prediction_accuracy pa
        JOIN sessions s ON s.season = pa.season AND s.round = pa.round AND s.session_type = 'R'
        ORDER BY pa.season DESC, pa.round DESC, pa.evaluated_at DESC
        LIMIT 50
      `
      return NextResponse.json({ accuracy_history: rows })
    }

    let targetSeason = season
    let targetRound  = round

    if (latest || (!season && !round)) {
      const latest_row = await sql`
        SELECT season, round
        FROM predictions
        ORDER BY
          CASE WHEN model_version LIKE ${PRODUCTION_MODEL_PREFIX + '%'} THEN 0 ELSE 1 END,
          CASE WHEN circuit IS NULL OR LOWER(circuit) = 'unknown' THEN 1 ELSE 0 END,
          predicted_at DESC
        LIMIT 1
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

    const modelRows = model
      ? [{ model_version: model }]
      : await sql`
          SELECT model_version
          FROM predictions
          WHERE season = ${targetSeason}
            AND round  = ${targetRound}
          GROUP BY model_version
          ORDER BY
            CASE WHEN model_version LIKE ${PRODUCTION_MODEL_PREFIX + '%'} THEN 0 ELSE 1 END,
            CASE
              WHEN BOOL_OR(circuit IS NOT NULL AND LOWER(circuit) <> 'unknown') THEN 0
              ELSE 1
            END,
            MAX(predicted_at) DESC,
            model_version DESC
          LIMIT 1
        `

    if (modelRows.length === 0) {
      return NextResponse.json(
        { error: `No prediction model for ${targetSeason} R${targetRound}` },
        { status: 404 }
      )
    }

    const targetModel = modelRows[0].model_version

    const predictionRows = await sql`
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
        AND p.model_version = ${targetModel}
      ORDER BY p.predicted_position ASC
    `
    const predictions = predictionRows as unknown as PredictionRow[]

    if (predictions.length === 0) {
      return NextResponse.json(
        { error: `No predictions for ${targetSeason} R${targetRound}` },
        { status: 404 }
      )
    }

    const accuracyRows = await sql`
      SELECT mae_position, winner_correct, podium_hits, top5_hits, brier_score
      FROM prediction_accuracy
      WHERE season = ${targetSeason}
        AND round = ${targetRound}
        AND model_version = ${targetModel}
      LIMIT 1
    `
    const accuracy = accuracyRows as unknown as AccuracyRow[]

    const standingsRows = await sql`
      SELECT r.driver_code, r.team, SUM(r.points)::numeric AS actual_points
      FROM results r
      JOIN sessions s ON s.id = r.session_id
      WHERE s.season = ${targetSeason}
        AND s.session_type IN ('R', 'S')
      GROUP BY r.driver_code, r.team
      ORDER BY actual_points DESC
    `
    const standings = standingsRows as unknown as StandingRow[]

    const nDoneRow = await sql`
      SELECT COUNT(DISTINCT s.round)::int AS n
      FROM sessions s
      JOIN results r ON r.session_id = s.id
      WHERE s.season = ${targetSeason}
        AND s.session_type = 'R'
        AND r.finish_position IS NOT NULL
    `

    const calendarCountRows = await sql`
      SELECT COUNT(*)::int AS n
      FROM (
        SELECT DISTINCT race_date, LOWER(TRIM(circuit_name))
        FROM race_calendar
        WHERE season = ${targetSeason}
      ) normalized_calendar
    `

    const racesDone = nDoneRow[0]?.n ?? 0
    const racesInSeason = calendarCountRows[0]?.n || undefined
    const championship = buildChampionshipProjection(
      standings,
      predictions,
      racesDone,
      racesInSeason,
    )
    const response = shapeRacePrediction({
      season: targetSeason,
      round: targetRound,
      predictions,
      championship,
      accuracy,
    })

    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'no-store' }
    })

  } catch (err) {
    console.error('[/api/predictions] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
