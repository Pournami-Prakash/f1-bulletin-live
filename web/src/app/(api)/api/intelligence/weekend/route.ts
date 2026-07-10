import { NextResponse } from 'next/server'
import { getNeonSql } from '@/lib/neon'

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const sql = getNeonSql()

    const [weekendStateRows, nextRaces, preraceRows, watchlistRows] = await Promise.all([
      sql`SELECT * FROM weekend_state WHERE id = 1 LIMIT 1`,
      sql`SELECT * FROM race_calendar WHERE race_date >= CURRENT_DATE ORDER BY race_date ASC LIMIT 3`,
      sql`SELECT * FROM pre_race_intelligence ORDER BY race_date DESC NULLS LAST, generated_at DESC LIMIT 1`,
      sql`SELECT * FROM v_regulatory_watchlist LIMIT 10`,
    ])

    const ws = weekendStateRows[0] ?? null
    const prerace = preraceRows[0] ?? null
    const nextRace = ws ? {
      round: ws.next_race_round,
      name: ws.next_race_name,
      circuit: ws.next_race_circuit,
      city: ws.next_race_city,
      country: ws.next_race_country,
      flag: ws.next_race_flag,
      date: ws.next_race_date,
      startUtc: ws.next_race_start_utc,
      isSprintWeekend: ws.is_sprint_weekend,
    } : null

    return NextResponse.json({
      ok: true,
      currentState: {
        isRaceWeek: Boolean(ws?.is_race_week),
        daysUntilRace: ws?.days_until_race ?? null,
        nextRace,
        sessions: {
          current: ws?.current_session ?? null,
          fp1Today: Boolean(ws?.fp1_today),
          fp2Today: Boolean(ws?.fp2_today),
          fp3Today: Boolean(ws?.fp3_today),
          qualiToday: Boolean(ws?.quali_today),
          sprintToday: Boolean(ws?.sprint_today),
          raceToday: Boolean(ws?.race_today),
        },
      },
      nextRaces,
      watchlist: watchlistRows.map((r: any) => ({
        entityName: r.entity_name,
        entityType: r.entity_type,
        riskScore: r.risk_score,
        riskLabel: r.risk_label,
        watchlistReason: r.watchlist_reason,
      })),
      preRaceSnapshot: prerace ? {
        sections: {
          weekendOverview: prerace.weekend_overview,
          regulatoryWatchlist: prerace.regulatory_watchlist,
          formGuide: prerace.form_guide,
          controversyRadar: prerace.controversy_radar,
          keyBattles: prerace.key_battles,
          sessionPreview: prerace.session_preview,
        },
        generatedAt: prerace.generated_at,
      } : null,
    })
  } catch (error) {
    console.error('[/api/intelligence/weekend]', error)
    return NextResponse.json({ ok: false, error: 'Failed to fetch weekend data' }, { status: 500 })
  }
}
