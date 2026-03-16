import { neon } from '@neondatabase/serverless'
import { NextResponse } from 'next/server'

export const dynamic = "force-dynamic"

export async function GET() {
  if (!process.env.NEON_DATABASE_URL) {
    return NextResponse.json({ ok: false, error: 'NEON_DATABASE_URL not configured' }, { status: 503 })
  }

  try {
    const sql = neon(process.env.NEON_DATABASE_URL!)

    const clusters = await sql`
      SELECT cluster_id, cluster_name, summary,
        article_count, momentum_score, sentiment_avg,
        sentiment_label, is_spike, z_score, priority,
        source_breakdown, last_updated
      FROM cluster_summaries
      WHERE article_count > 0
      ORDER BY is_spike DESC, momentum_score DESC NULLS LAST
      LIMIT 12
    `

    let formatted: any[]
    if (clusters.length > 0) {
      formatted = clusters.map((c: any) => ({
        clusterId: c.cluster_id,
        clusterName: c.cluster_name,
        cluster: c.cluster_name,
        summary: c.summary,
        count: c.article_count,
        articleCount: c.article_count,
        momentum: Math.round(Number(c.momentum_score) || 0),
        momentumScore: Number(c.momentum_score) || 0,
        sentiment: c.sentiment_avg,
        sentimentAvg: c.sentiment_avg,
        sentimentLabel: c.sentiment_label,
        isSpike: c.is_spike,
        priority: c.priority || 'NORMAL',
        lastUpdated: c.last_updated,
      }))
    } else {
      const stories = await sql`
        SELECT story_id, topic_cluster, story_title, latest_event_ts,
          events_count, momentum_score, is_breaking, best_priority_tier
        FROM story_timeline
        ORDER BY is_breaking DESC, COALESCE(momentum_score, 0) DESC, latest_event_ts DESC
        LIMIT 12
      `
      formatted = stories.map((s: any) => ({
        clusterId: s.story_id,
        clusterName: s.topic_cluster || 'GENERAL_F1',
        cluster: s.topic_cluster || 'GENERAL_F1',
        summary: s.story_title,
        count: Number(s.events_count) || 0,
        articleCount: Number(s.events_count) || 0,
        momentum: Math.round(Number(s.momentum_score) || 0),
        momentumScore: Number(s.momentum_score) || 0,
        sentiment: null,
        sentimentAvg: null,
        sentimentLabel: 'neutral',
        isSpike: Boolean(s.is_breaking),
        priority: s.best_priority_tier || 'NORMAL',
        lastUpdated: s.latest_event_ts,
      }))
    }

    return NextResponse.json({ ok: true, clusters: formatted, count: formatted.length })
  } catch (error) {
    console.error('[/api/intelligence/summaries]', error)
    return NextResponse.json({ ok: false, error: 'Failed to fetch summaries' }, { status: 500 })
  }
}
