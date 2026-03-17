import { NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.NEON_DATABASE_URL!)

// GET /api/predictions/rounds?season=2026
// Returns list of rounds that have predictions, latest first.
// Deduplicates by round — takes latest predicted_at per round.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const season = searchParams.get('season') ? parseInt(searchParams.get('season')!) : 2026

  try {
    const rows = await sql`
      SELECT
        p.round,
        p.gp_name,
        p.circuit,
        MAX(p.predicted_at) AS predicted_at,
        BOOL_OR(p.actual_position IS NOT NULL) AS has_actuals
      FROM predictions p
      WHERE p.season = ${season}
      GROUP BY p.round, p.gp_name, p.circuit
      ORDER BY p.round DESC
    `

    return NextResponse.json({ season, rounds: rows })
  } catch (err) {
    console.error('[/api/predictions/rounds]', err)
    return NextResponse.json({ season, rounds: [] })
  }
}