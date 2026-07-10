import { NextResponse } from 'next/server'
import { getNeonSql, PRODUCTION_MODEL_PREFIX } from '@/lib/neon'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const season = searchParams.get('season') ? parseInt(searchParams.get('season')!) : 2026

  try {
    const sql = getNeonSql()
    const rows = await sql`
      WITH ranked_models AS (
        SELECT
          p.round,
          p.gp_name,
          p.circuit,
          p.model_version,
          MAX(p.predicted_at) AS predicted_at,
          BOOL_OR(p.actual_position IS NOT NULL) AS has_actuals,
          ROW_NUMBER() OVER (
            PARTITION BY p.round
            ORDER BY
              CASE WHEN p.model_version LIKE ${PRODUCTION_MODEL_PREFIX + '%'} THEN 0 ELSE 1 END,
              CASE
                WHEN BOOL_OR(p.circuit IS NOT NULL AND LOWER(p.circuit) <> 'unknown') THEN 0
                ELSE 1
              END,
              MAX(p.predicted_at) DESC,
              p.model_version DESC
          ) AS rn
        FROM predictions p
        WHERE p.season = ${season}
        GROUP BY p.round, p.gp_name, p.circuit, p.model_version
      )
      SELECT round, gp_name, circuit, model_version, predicted_at, has_actuals
      FROM ranked_models
      WHERE rn = 1
      ORDER BY round DESC
    `

    return NextResponse.json({ season, rounds: rows })
  } catch (err) {
    console.error('[/api/predictions/rounds]', err)
    return NextResponse.json({ season, rounds: [] })
  }
}
