import { NextRequest, NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.NEON_DATABASE_URL!)

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params
  const id = parseInt(sessionId)

  // Winner for track outline
  const winnerRow = await sql`
    SELECT driver_code FROM results
    WHERE session_id = ${id} AND finish_position = 1
    LIMIT 1`
  const winner = winnerRow[0]?.driver_code

  // Track outline: winner's lap 3, frames 0-31 in order
  const outline = winner ? await sql`
    SELECT x, y FROM telemetry_replay
    WHERE session_id = ${id} AND driver_code = ${winner} AND lap_number = 3
    ORDER BY frame ASC` : []

  // All race data: for each (lap, frame) combo, all drivers' positions
  // Returns flat array ordered by lap → frame → driver
  const frames = await sql`
    SELECT lap_number, frame, driver_code, x, y
    FROM telemetry_replay
    WHERE session_id = ${id}
    ORDER BY lap_number ASC, frame ASC, driver_code ASC`

  const totalLaps = await sql`
    SELECT MAX(lap_number) as total FROM telemetry_replay WHERE session_id = ${id}`

  return NextResponse.json({
    outline: outline.map((r: any) => ({ x: parseFloat(r.x), y: parseFloat(r.y) })),
    frames,
    totalLaps: Number(totalLaps[0]?.total ?? 1),
  })
}