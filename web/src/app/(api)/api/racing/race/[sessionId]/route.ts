import { NextRequest, NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.NEON_DATABASE_URL!)

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params
  const id = parseInt(sessionId)
  const tab = req.nextUrl.searchParams.get('tab') ?? 'overview'

  // Always fetch session + results (needed for every tab)
  const [session, results] = await Promise.all([
    sql`SELECT id, season, round, gp_name, circuit, date
        FROM sessions WHERE id = ${id}`,
    sql`SELECT driver_code, team, grid_position, finish_position,
               points, status, fastest_lap_ms
        FROM results WHERE session_id = ${id}
        ORDER BY finish_position ASC NULLS LAST`,
  ])

  // Lazy-load heavier data only when that tab is requested
  let laps = null
  let stints = null
  let fastestLap = null
  let lapCounts = null

  if (tab === 'overview' || tab === 'laps') {
    const driver = req.nextUrl.searchParams.get('driver')

    const [lapsResult, fastestLapResult, lapCountsResult] = await Promise.all([
      driver
        ? sql`
            SELECT driver_code, lap_number, lap_time_ms,
                   s1_ms, s2_ms, s3_ms, compound, tyre_life,
                   is_personal_best, position
            FROM laps
            WHERE session_id = ${id} AND driver_code = ${driver}
            ORDER BY lap_number ASC`
        : sql`
            SELECT driver_code, lap_number, lap_time_ms,
                   s1_ms, s2_ms, s3_ms, compound, tyre_life,
                   is_personal_best, position
            FROM laps
            WHERE session_id = ${id}
            ORDER BY driver_code, lap_number ASC`,
      sql`
        SELECT driver_code, MIN(lap_time_ms) as fastest_lap_ms
        FROM laps
        WHERE session_id = ${id} AND lap_time_ms IS NOT NULL
        GROUP BY driver_code
        ORDER BY fastest_lap_ms ASC
        LIMIT 1`,
      sql`
        SELECT driver_code, COUNT(*) as lap_count
        FROM laps
        WHERE session_id = ${id}
        GROUP BY driver_code`,
    ])

    laps       = lapsResult
    fastestLap = fastestLapResult[0] ?? null
    lapCounts  = lapCountsResult
  }

  if (tab === 'overview' || tab === 'strategy') {
    stints = await sql`
      SELECT driver_code, stint_number, compound,
             start_lap, end_lap, lap_count
      FROM stints
      WHERE session_id = ${id}
      ORDER BY driver_code, stint_number ASC`
  }

  return NextResponse.json({
    session:    session[0] ?? null,
    results,
    laps,
    stints,
    fastestLap,
    lapCounts,
  })
}