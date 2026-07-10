import { NextResponse } from 'next/server'
import { getNeonSql } from '@/lib/neon'

export const revalidate = 300

export interface RaceRound {
  round:              number
  race_name:          string
  circuit_name:       string
  city:               string
  country:            string
  country_code:       string
  flag_emoji:         string
  fp1_date:           string | null
  fp2_date:           string | null
  fp3_date:           string | null
  quali_date:         string | null
  sprint_quali_date:  string | null
  sprint_date:        string | null
  race_date:          string
  race_start_utc:     string
  circuit_length_km:  number | null
  race_laps:          number | null
  lap_record:         string | null
  lap_record_holder:  string | null
  lap_record_year:    number | null
  drs_zones:          number | null
  is_sprint_weekend:  boolean
  is_completed:       boolean
  season:             number
  created_at:         string
  updated_at:         string
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const season = Number.parseInt(searchParams.get('season') ?? '2026', 10)
  const targetSeason = Number.isFinite(season) ? season : 2026

  try {
    const sql = getNeonSql()
    const rows = await sql`
      SELECT *
      FROM (
        SELECT DISTINCT ON (
          season,
          race_date,
          LOWER(TRIM(circuit_name))
        ) *
        FROM race_calendar
        WHERE season = ${targetSeason}
        ORDER BY
          season,
          race_date,
          LOWER(TRIM(circuit_name)),
          round ASC,
          updated_at DESC
      ) normalized_calendar
      ORDER BY round
    `
    return NextResponse.json(rows)
  } catch (err) {
    console.error('Neon calendar query failed:', err)
    return NextResponse.json(
      { error: 'Failed to fetch calendar' },
      { status: 500 }
    )
  }
}
