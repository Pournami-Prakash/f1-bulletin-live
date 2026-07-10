import { NextResponse } from 'next/server'
import { getNeonSql, PRODUCTION_MODEL_PREFIX } from '@/lib/neon'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const season = searchParams.get('season') ? parseInt(searchParams.get('season')!) : 2026

  try {
    const sql = getNeonSql()
    const rows = await sql`
      SELECT
        p.round,
        p.gp_name,
        p.circuit,
        MAX(p.predicted_at) AS predicted_at,
        BOOL_OR(p.actual_position IS NOT NULL) AS has_actuals
      FROM predictions p
      WHERE p.season = ${season}
        AND p.model_version LIKE ${PRODUCTION_MODEL_PREFIX + '%'}
      GROUP BY p.round, p.gp_name, p.circuit
      ORDER BY p.round DESC
    `

    return NextResponse.json({ season, rounds: rows })
  } catch (err) {
    console.error('[/api/predictions/rounds]', err)
    return NextResponse.json({ season, rounds: [] })
  }
}
