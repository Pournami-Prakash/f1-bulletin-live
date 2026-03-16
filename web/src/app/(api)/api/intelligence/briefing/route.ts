import { neon } from '@neondatabase/serverless'
import { NextResponse } from 'next/server'

export const dynamic = "force-dynamic"

export async function GET() {
  if (!process.env.NEON_DATABASE_URL) {
    return NextResponse.json({ ok: false, error: 'NEON_DATABASE_URL not configured' }, { status: 503 })
  }

  try {
    const sql = neon(process.env.NEON_DATABASE_URL!)

    const [briefing, stories] = await Promise.all([
      sql`
        SELECT briefing_date, headline, lead_paragraph,
          top_story_summary, driver_spotlight,
          controversy_note, what_to_watch,
          top_cluster, top_driver,
          total_signals, breaking_count,
          avg_sentiment, sentiment_label,
          active_spike_count, generated_at
        FROM daily_briefings
        ORDER BY briefing_date DESC
        LIMIT 1
      `,
      sql`
        SELECT story_id, topic_cluster, story_title, latest_source,
          latest_event_ts, max_priority_score, best_priority_tier,
          is_breaking, momentum_score
        FROM story_timeline
        ORDER BY is_breaking DESC, COALESCE(momentum_score, 0) DESC, latest_event_ts DESC
        LIMIT 30
      `,
    ])

    const mapped = stories.map((s: any) => ({
      type:       s.latest_source?.toLowerCase().includes('reddit') ? 'r'
                : s.latest_source?.toLowerCase().includes('fia') ? 'o' : 'n',
      priority:   s.best_priority_tier || 'P2',
      tag:        s.latest_source?.toLowerCase().includes('reddit') ? 'REDDIT'
                : s.latest_source?.toLowerCase().includes('fia') ? 'OFFICIAL' : 'NEWS',
      isBreaking: Boolean(s.is_breaking),
      cluster:    s.topic_cluster,
      source:     s.latest_source,
      title:      s.story_title,
      summary:    '',
      score:      Math.round(Number(s.max_priority_score) || 0),
      time:       s.latest_event_ts,
    }))

    return NextResponse.json({
      ok: true,
      briefing: briefing[0] ?? null,
      stories: mapped,
      count: mapped.length,
    })
  } catch (error) {
    console.error('[/api/intelligence/briefing]', error)
    return NextResponse.json({ ok: false, error: 'Failed to fetch briefing' }, { status: 500 })
  }
}
