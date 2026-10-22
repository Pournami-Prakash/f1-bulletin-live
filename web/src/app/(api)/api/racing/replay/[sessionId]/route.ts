import { NextRequest, NextResponse } from 'next/server'
import { getNeonSql } from '@/lib/neon'
import { badRequest, err } from '@/lib/api'

const MAX_FRAMES = 100_000
export async function GET(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params
  if (!/^\d{1,10}$/.test(sessionId) || Number(sessionId) < 1 || Number(sessionId) > 2147483647) return badRequest('Invalid session ID')
  const id = Number(sessionId)
  try {
    const sql = getNeonSql()
    const [winnerRow] = await sql`SELECT driver_code FROM results WHERE session_id = ${id} AND finish_position = 1 LIMIT 1`
    const [outline, frames, totalLaps] = await Promise.all([
      winnerRow ? sql`SELECT x, y FROM telemetry_replay WHERE session_id = ${id} AND driver_code = ${winnerRow.driver_code} AND lap_number = 3 ORDER BY frame ASC LIMIT 1000` : [],
      sql`SELECT lap_number, frame, driver_code, x, y FROM telemetry_replay WHERE session_id = ${id} ORDER BY lap_number, frame, driver_code LIMIT ${MAX_FRAMES + 1}`,
      sql`SELECT MAX(lap_number) AS total FROM telemetry_replay WHERE session_id = ${id}`,
    ])
    if (frames.length > MAX_FRAMES) return err('Replay is too large to display', 413)
    return NextResponse.json({ outline: outline.map(r => ({ x: Number(r.x), y: Number(r.y) })), frames, totalLaps: Number(totalLaps[0]?.total ?? 1) }, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60' },
    })
  } catch { return err('Failed to fetch replay') }
}
