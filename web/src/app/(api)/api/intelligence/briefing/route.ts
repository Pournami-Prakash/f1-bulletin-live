import { publicJson } from '@/lib/api'
import { logEvent } from '@/lib/observability'
import { loadStoryFeed } from '@/lib/story-feed'
import { getNeonSql } from '@/lib/neon'

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const sql = getNeonSql()

    const [briefing, feed] = await Promise.all([
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
      loadStoryFeed(sql, { limit: 30 }),
    ])

    const stories = feed.items

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

    return publicJson({
      ok: true,
      briefing: briefing[0] ?? null,
      stories: mapped,
      feed: feed.policy,
      count: mapped.length,
    })
  } catch {
    logEvent('error', 'api_failed', { route: '/api/intelligence/briefing' })
    return publicJson({ ok: false, error: 'Failed to fetch briefing' }, { status: 500 })
  }
}
