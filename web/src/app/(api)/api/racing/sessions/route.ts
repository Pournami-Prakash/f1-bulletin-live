import { NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.NEON_DATABASE_URL!)

export async function GET() {
  const rows = await sql`
    SELECT id, season, round, gp_name, circuit, date, session_type
    FROM sessions
    WHERE session_type = 'R'
    ORDER BY season DESC, round DESC
  `
  return NextResponse.json(rows)
}