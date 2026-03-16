import { neon } from '@neondatabase/serverless'
import { NextResponse } from 'next/server'

export const dynamic = "force-dynamic"

export async function GET() {
  if (!process.env.NEON_DATABASE_URL) {
    return NextResponse.json({ ok: false, error: 'NEON_DATABASE_URL not configured' }, { status: 503 })
  }
  try {
    const sql = neon(process.env.NEON_DATABASE_URL!)
    const cutoff30 = new Date(); cutoff30.setDate(cutoff30.getDate() - 30)
    const cutoff30str = cutoff30.toISOString().split('T')[0]

    const [clusters, drivers, alerts, pipeline, stories, events] = await Promise.all([
      sql`
        SELECT cluster_id, cluster_name, summary,
          article_count, momentum_score, sentiment_avg,
          sentiment_label, is_spike, z_score, priority,
          source_breakdown, last_updated
        FROM cluster_summaries
        WHERE article_count > 0
        ORDER BY is_spike DESC, momentum_score DESC NULLS LAST LIMIT 8
      `,
      sql`
        SELECT driver_name,
          ROUND(AVG(sentiment_avg)::NUMERIC, 3) AS sentiment_avg,
          SUM(mention_count) AS total_mentions,
          MAX(date) AS last_seen,
          CASE
            WHEN AVG(sentiment_avg) >  0.15 THEN 'positive'
            WHEN AVG(sentiment_avg) < -0.15 THEN 'negative'
            ELSE 'neutral'
          END AS sentiment_label
        FROM driver_sentiment_daily
        WHERE date >= ${cutoff30str}::date AND entity_type = 'driver'
        GROUP BY driver_name HAVING SUM(mention_count) > 0
        ORDER BY total_mentions DESC LIMIT 10
      `,
      sql`
        SELECT cluster_name, severity, z_score, article_count, triggered_at
        FROM spike_alerts
        WHERE resolved = FALSE AND triggered_at >= NOW() - INTERVAL '24 hours'
        ORDER BY z_score DESC LIMIT 5
      `,
      sql`
        SELECT run_at, articles_processed, clusters_summarized,
          spikes_detected, drivers_updated, duration_seconds, status
        FROM pipeline_run_log ORDER BY run_at DESC LIMIT 1
      `,
      sql`
        SELECT story_id, topic_cluster, story_title, latest_source, latest_url,
          latest_event_ts, events_count, sources_count, max_priority_score,
          best_priority_tier, driver, heat_index, momentum_score, is_breaking, breaking_tier
        FROM story_timeline
        ORDER BY is_breaking DESC, COALESCE(momentum_score, 0) DESC, latest_event_ts DESC
        LIMIT 20
      `,
      sql`
        SELECT url, title, source_type, source, topic_cluster AS cluster_name,
          priority_score, priority_tier, event_ts AS published_at,
          relevance_score, controversy_score
        FROM event_f1_only
        ORDER BY event_ts DESC
        LIMIT 20
      `,
    ])

    const fallbackClusters = stories.slice(0, 8).map((s: any) => ({
      cluster_id: s.story_id,
      cluster_name: s.topic_cluster ?? 'GENERAL_F1',
      summary: s.story_title,
      article_count: Number(s.events_count) || 0,
      momentum_score: Number(s.momentum_score) || 0,
      sentiment_avg: null,
      sentiment_label: 'neutral',
      is_spike: Boolean(s.is_breaking),
      z_score: null,
      priority: s.best_priority_tier || 'NORMAL',
      source_breakdown: null,
      last_updated: s.latest_event_ts,
    }))

    const clusterRows = clusters.length > 0 ? clusters : fallbackClusters

    return NextResponse.json({
      ok: true,
      data: {
        clusters: clusterRows.map((c: any) => ({
          clusterId: c.cluster_id, clusterName: c.cluster_name, summary: c.summary,
          articleCount: c.article_count, momentumScore: c.momentum_score,
          sentimentAvg: c.sentiment_avg, sentimentLabel: c.sentiment_label,
          isSpike: c.is_spike, zScore: c.z_score, priority: c.priority,
          sourceBreakdown: c.source_breakdown, lastUpdated: c.last_updated,
        })),
        drivers: drivers.map((d: any) => ({
          name: d.driver_name, driverName: d.driver_name,
          sentimentAvg: d.sentiment_avg, sentimentLabel: d.sentiment_label,
          mentions: Number(d.total_mentions), totalMentions: Number(d.total_mentions),
          lastSeen: d.last_seen,
        })),
        alerts: alerts.map((a: any) => ({
          clusterName: a.cluster_name, severity: a.severity,
          zScore: a.z_score, articleCount: a.article_count, triggeredAt: a.triggered_at,
        })),
        sentiment: {
          breakdown: {
            positive: 0,
            negative: 0,
            neutral: 0,
          },
          avgScore: 0,
          label: 'neutral',
        },
        pipeline: {
          ...(pipeline[0] ?? {}),
          totalSignals: stories.length || events.length,
          articlesLastHour: events.filter((e: any) => {
            const ts = new Date(e.published_at).getTime()
            return Number.isFinite(ts) && ts >= Date.now() - 60 * 60 * 1000
          }).length,
        },
        recentArticles: events.map((e: any) => ({
          guid: e.url,
          title: e.title,
          source_type: e.source_type,
          source: e.source,
          cluster_name: e.cluster_name,
          priority_score: e.priority_score,
          priority_tier: e.priority_tier,
          published_at: e.published_at,
          sentiment_label: 'neutral',
        })),
        topStories: stories,
        signalsToday: Number((pipeline[0] as any)?.articles_processed || events.length || 0),
        topDriver: drivers[0]?.driver_name ?? null,
        breakingCount: stories.filter((s: any) => s.is_breaking).length,
      },
    })
  } catch (error) {
    console.error('[/api/intelligence/overview]', error)
    return NextResponse.json({ ok: false, error: 'Failed to fetch overview' }, { status: 500 })
  }
}
