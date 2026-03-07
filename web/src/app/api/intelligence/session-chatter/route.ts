import { neon } from '@neondatabase/serverless'
import { NextResponse } from 'next/server'

export const revalidate = 120

export async function GET(request: Request) {
  if (!process.env.NEON_DATABASE_URL) {
    return NextResponse.json({ ok: false, error: 'NEON_DATABASE_URL not configured' }, { status: 503 })
  }
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '8')
    const sql = neon(process.env.NEON_DATABASE_URL!)

    const cols = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'session_chatter' ORDER BY ordinal_position
    `
    if (cols.length === 0) {
      return NextResponse.json({ ok: true, chatter: [], count: 0 })
    }

    const chatter = await sql`SELECT * FROM session_chatter ORDER BY id DESC LIMIT ${limit}`
    return NextResponse.json({ ok: true, chatter, count: chatter.length })
  } catch (error) {
    console.error('[/api/intelligence/session-chatter]', error)
    return NextResponse.json({ ok: false, error: 'Failed to fetch session chatter' }, { status: 500 })
  }
}
