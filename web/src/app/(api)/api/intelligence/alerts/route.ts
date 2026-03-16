import { neon } from '@neondatabase/serverless'
import { NextResponse } from 'next/server'

export const dynamic = "force-dynamic"

export async function GET() {
  if (!process.env.NEON_DATABASE_URL) {
    return NextResponse.json({ ok: false, error: 'NEON_DATABASE_URL not configured' }, { status: 503 })
  }

  try {
    const sql = neon(process.env.NEON_DATABASE_URL!)

    const [alerts, articles] = await Promise.all([
      sql`
        SELECT cluster_name, severity, z_score, article_count, triggered_at
        FROM spike_alerts
        WHERE resolved = FALSE
          AND triggered_at >= NOW() - INTERVAL '12 hours'
        ORDER BY z_score DESC
        LIMIT 10
      `,
      sql`
        SELECT guid, title, source_type, cluster_name, priority_score, published_at
        FROM article_intelligence
        WHERE published_at >= NOW() - INTERVAL '3 hours'
        ORDER BY priority_score DESC, published_at DESC
        LIMIT 20
      `,
    ])

    const ticker = articles.map(a => ({
      headline:    a.title,
      source_type: a.source_type,
      cluster:     a.cluster_name,
      priority:    a.priority_score,
      time:        a.published_at,
    }))

    return NextResponse.json({ ok: true, alerts, ticker, count: alerts.length })
  } catch (error) {
    console.error('[/api/intelligence/alerts]', error)
    return NextResponse.json({ ok: false, error: 'Failed to fetch alerts' }, { status: 500 })
  }
}
