import { NextResponse } from 'next/server'
import { getNeonSql } from '@/lib/neon'

export async function GET() {
  try {
    const sql = getNeonSql()
    const rows = await sql`
      SELECT id, season, round, gp_name, circuit, date, session_type
      FROM sessions
      WHERE session_type = 'R'
      ORDER BY season DESC, round DESC
    `
    return NextResponse.json(rows)
  } catch (error) {
    console.error('[/api/racing/sessions]', error)
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 })
  }
}
