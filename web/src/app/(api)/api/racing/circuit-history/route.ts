import { NextResponse } from 'next/server'
import { getNeonSql } from '@/lib/neon'

const CIRCUIT_ALIASES: Record<string, string[]> = {
  melbourne: ['Melbourne', 'Albert Park Circuit'],
  shanghai: ['Shanghai', 'Shanghai International Circuit'],
  suzuka: ['Suzuka', 'Suzuka International Racing Course'],
  miami: ['Miami', 'Miami Gardens', 'Miami International Autodrome'],
  montreal: ['Montréal', 'Montreal', 'Circuit Gilles Villeneuve'],
  monaco: ['Monaco', 'Monte Carlo', 'Circuit de Monaco'],
  barcelona: ['Barcelona', 'Circuit de Barcelona-Catalunya'],
  spielberg: ['Spielberg', 'Red Bull Ring'],
  silverstone: ['Silverstone', 'Silverstone Circuit'],
  spa: ['Spa', 'Spa-Francorchamps', 'Circuit de Spa-Francorchamps'],
  hungaroring: ['Budapest', 'Hungaroring'],
  zandvoort: ['Zandvoort', 'Circuit Zandvoort'],
  monza: ['Monza', 'Autodromo Nazionale Monza'],
  madrid: ['Madrid', 'Madrid Street Circuit'],
  baku: ['Baku', 'Baku City Circuit'],
  singapore: ['Singapore', 'Marina Bay', 'Marina Bay Street Circuit'],
  austin: ['Austin', 'Circuit of The Americas'],
  mexico: ['Mexico City', 'Autodromo Hermanos Rodriguez'],
  interlagos: ['São Paulo', 'Sao Paulo', 'Interlagos', 'Autodromo Jose Carlos Pace'],
  vegas: ['Las Vegas', 'Las Vegas Strip Circuit'],
  lusail: ['Lusail', 'Qatar', 'Lusail International Circuit'],
  yas: ['Yas Island', 'Abu Dhabi', 'Yas Marina Circuit'],
}

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const key = (searchParams.get('circuitKey') || '').toLowerCase()
  const aliases = CIRCUIT_ALIASES[key] ?? []

  if (aliases.length === 0) {
    return NextResponse.json({ circuitKey: key, winners: [] })
  }

  try {
    const sql = getNeonSql()
    const winners = await sql`
      SELECT s.season, s.round, s.gp_name, s.circuit,
             r.driver_code, r.team, r.grid_position, r.points
      FROM sessions s
      JOIN results r ON r.session_id = s.id
      WHERE s.session_type = 'R'
        AND r.finish_position = 1
        AND s.circuit = ANY(${aliases})
      ORDER BY s.season DESC, s.round DESC
      LIMIT 6
    `

    return NextResponse.json({ circuitKey: key, aliases, winners })
  } catch (error) {
    console.error('[/api/racing/circuit-history]', error)
    return NextResponse.json({ circuitKey: key, winners: [] }, { status: 500 })
  }
}
