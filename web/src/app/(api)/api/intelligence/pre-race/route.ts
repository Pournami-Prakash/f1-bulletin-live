import { neon } from '@neondatabase/serverless'
import { NextResponse } from 'next/server'

export const dynamic = "force-dynamic"

export async function GET() {
  if (!process.env.NEON_DATABASE_URL) {
    return NextResponse.json({ ok: false, error: 'NEON_DATABASE_URL not configured' }, { status: 503 })
  }
  try {
    const sql = neon(process.env.NEON_DATABASE_URL!)
    const [weekendRows, preRaceRows, watchlistRows, chatterRows] = await Promise.all([
      sql`SELECT * FROM weekend_state WHERE id = 1 LIMIT 1`,
      sql`SELECT * FROM pre_race_intelligence ORDER BY race_date DESC NULLS LAST, generated_at DESC LIMIT 1`,
      sql`SELECT * FROM v_regulatory_watchlist LIMIT 10`,
      sql`SELECT * FROM session_chatter ORDER BY published_at DESC LIMIT 20`,
    ])

    const ws = weekendRows[0] ?? null
    const pre = preRaceRows[0] ?? null

    return NextResponse.json({
      ok: true,
      daysUntil: ws?.days_until_race ?? null,
      currentState: {
        nextRace: ws ? {
          round: ws.next_race_round,
          name: ws.next_race_name,
          circuit: ws.next_race_circuit,
          city: ws.next_race_city,
          country: ws.next_race_country,
          flag: ws.next_race_flag,
          date: ws.next_race_date,
          startUtc: ws.next_race_start_utc,
        } : null,
        sessions: {
          current: ws?.current_session ?? null,
        },
      },
      watchlist: watchlistRows.map((r: any) => ({
        entityName: r.entity_name,
        entityType: r.entity_type,
        riskScore: r.risk_score,
        riskLabel: r.risk_label,
        watchlistReason: r.watchlist_reason,
      })),
      snapshot: pre ? {
        sections: {
          weekendOverview: pre.weekend_overview,
          regulatoryWatchlist: pre.regulatory_watchlist,
          formGuide: pre.form_guide,
          controversyRadar: pre.controversy_radar,
          keyBattles: pre.key_battles,
          sessionPreview: pre.session_preview,
        },
        generatedAt: pre.generated_at,
      } : null,
      chatter: { data: chatterRows.map((r: any) => ({
        guid: r.guid,
        title: r.title,
        sessionRelevance: r.session_relevance,
        sentimentLabel: r.sentiment_label,
        publishedAt: r.published_at,
      })) },
    })
  } catch (error) {
    console.error('[/api/intelligence/pre-race]', error)
    return NextResponse.json({ ok: false, error: 'Failed to fetch pre-race data' }, { status: 500 })
  }
}
