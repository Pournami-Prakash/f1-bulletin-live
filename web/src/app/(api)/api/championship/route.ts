import { publicJson } from '@/lib/api'
import { getNeonSql } from '@/lib/neon'
import { logEvent } from '@/lib/observability'
import { ChampionshipDataError, simulateChampionship, type CalendarEvent, type PublishedRace, type SeasonResult } from '@/lib/championship'

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get('season') ?? String(new Date().getUTCFullYear())
  const season = Number(raw)
  if (!/^\d{4}$/.test(raw) || season < 2025 || season > new Date().getUTCFullYear()) {
    return publicJson({ ok: false, error: 'Choose a season from 2025 through the current year.' }, { status: 400 })
  }
  try {
    const sql = getNeonSql()
    const [calendarRows, resultRows, predictionRows] = await Promise.all([
      sql`
        SELECT DISTINCT ON (round) round, race_name, circuit_name, race_start_utc,
               is_sprint_weekend, sprint_date
        FROM race_calendar WHERE season=${season}
        ORDER BY round, updated_at DESC NULLS LAST
      `,
      sql`
        WITH fields AS (
          SELECT s.season, s.round, s.session_type, COUNT(DISTINCT q.driver_code)::int AS n
          FROM qualifying_laps q JOIN sessions s ON s.id=q.session_id
          WHERE s.season BETWEEN ${season-2} AND ${season} AND s.session_type IN ('Q','SQ')
          GROUP BY s.season,s.round,s.session_type
        ), qualifying AS (
          SELECT DISTINCT ON (s.season,s.round,q.driver_code)
                 s.season,s.round,q.driver_code,q.grid_position
          FROM qualifying_laps q JOIN sessions s ON s.id=q.session_id
          WHERE s.season BETWEEN ${season-2} AND ${season} AND s.session_type='Q'
          ORDER BY s.season,s.round,q.driver_code,s.date DESC
        )
        SELECT s.season,s.round,s.session_type,s.circuit,r.driver_code,r.team,
               r.finish_position,r.grid_position,r.points,COALESCE(r.status,'') AS status,
               q.grid_position AS qualifying_position,f.n AS expected_drivers
        FROM results r JOIN sessions s ON s.id=r.session_id
        LEFT JOIN qualifying q ON q.season=s.season AND q.round=s.round AND q.driver_code=r.driver_code
        LEFT JOIN fields f ON f.season=s.season AND f.round=s.round
          AND f.session_type=CASE WHEN s.session_type='S' THEN 'SQ' ELSE 'Q' END
        WHERE s.season BETWEEN ${season-2} AND ${season} AND s.session_type IN ('R','S')
          AND s.date<=NOW()
        ORDER BY s.season,s.round,s.session_type,r.driver_code
      `,
      sql`
        WITH latest AS (
          SELECT DISTINCT ON (p.round) p.round,p.model_version
          FROM predictions p JOIN race_calendar c ON c.season=p.season AND c.round=p.round
          WHERE p.season=${season} AND p.model_version LIKE 'prod_%'
            AND p.model_version NOT LIKE '%backfill%' AND p.actual_position IS NULL
            AND p.predicted_at<c.race_start_utc AND c.race_start_utc>NOW()
          GROUP BY p.round,p.model_version ORDER BY p.round,MAX(p.predicted_at) DESC
        )
        SELECT p.round,p.driver_code,p.predicted_position
        FROM predictions p JOIN latest l ON l.round=p.round AND l.model_version=p.model_version
        JOIN race_calendar c ON c.season=p.season AND c.round=p.round
        WHERE p.season=${season} AND p.predicted_at<c.race_start_utc AND p.actual_position IS NULL
      `,
    ])
    const results = resultRows.map(row => ({ ...row, season: Number(row.season), round: Number(row.round),
      finish_position: row.finish_position == null ? NaN : Number(row.finish_position), points: row.points == null ? NaN : Number(row.points),
      grid_position: row.grid_position == null ? null : Number(row.grid_position),
      qualifying_position: row.qualifying_position == null ? null : Number(row.qualifying_position),
      expected_drivers: row.expected_drivers == null ? undefined : Number(row.expected_drivers),
    })) as SeasonResult[]
    const forecast = simulateChampionship({ season, calendar: calendarRows as CalendarEvent[], results,
      predictions: predictionRows as PublishedRace[] })
    return publicJson({ ok: true, ...forecast })
  } catch (error) {
    if (error instanceof ChampionshipDataError) return publicJson({ ok: false, error: error.message }, { status: 409 })
    logEvent('error', 'api_failed', { route: '/api/championship' })
    return publicJson({ ok: false, error: 'Championship scenarios could not be loaded. Please try again.' }, { status: 503 })
  }
}
