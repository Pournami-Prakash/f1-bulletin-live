import { neon } from '@neondatabase/serverless'
import { NextResponse } from 'next/server'

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

export async function GET() {
  if (!process.env.NEON_DATABASE_URL) {
    return NextResponse.json({ error: 'NEON_DATABASE_URL not configured' }, { status: 503 })
  }
  try {
    const sql = neon(process.env.NEON_DATABASE_URL!)
    const rows = await sql`
      SELECT *
      FROM race_calendar
      WHERE season = 2026
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