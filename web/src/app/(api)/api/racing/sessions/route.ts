import { NextResponse } from 'next/server'
import { getNeonSql } from '@/lib/neon'

export async function GET() {
  try {
    const sql = getNeonSql()
    const rows = await sql`
      SELECT
        s.id,
        s.season,
        s.round,
        s.gp_name,
        s.circuit,
        s.date,
        s.session_type,
        (SELECT COUNT(*)::int FROM results r WHERE r.session_id = s.id) AS result_count,
        (SELECT COUNT(*)::int FROM laps l WHERE l.session_id = s.id) AS lap_count,
        (SELECT COUNT(*)::int FROM stints st WHERE st.session_id = s.id) AS stint_count,
        (SELECT COUNT(*)::int FROM telemetry_replay tr WHERE tr.session_id = s.id) AS replay_count
      FROM sessions s
      WHERE session_type = 'R'
      ORDER BY season DESC, round DESC
    `
    return NextResponse.json(rows)
  } catch (error) {
    console.error('[/api/racing/sessions]', error)
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 })
  }
}
