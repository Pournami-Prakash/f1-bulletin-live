import { NextResponse } from 'next/server'
import { getNeonSql } from '@/lib/neon'

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const driver     = searchParams.get('driver')
    const days       = parseInt(searchParams.get('days') || '30')
    const format     = searchParams.get('format') || 'summary'
    const entityType = searchParams.get('type')   || 'driver'
    const sql = getNeonSql()

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)
    const cutoffStr = cutoff.toISOString().split('T')[0]

    if (format === 'timeseries') {
      if (!driver) return NextResponse.json({ ok: false, error: 'driver param required' }, { status: 400 })
      const series = await sql`
        SELECT date, entity_type, sentiment_avg, sentiment_delta,
          sentiment_label, mention_count, positive_count,
          negative_count, neutral_count, top_cluster
        FROM driver_sentiment_daily
        WHERE LOWER(driver_name) = LOWER(${driver})
          AND date >= ${cutoffStr}::date
        ORDER BY date ASC
      `
      return NextResponse.json({ ok: true, driver, days, data: series })
    }

    const summary = entityType === 'all'
      ? await sql`
          WITH ranked AS (
            SELECT driver_name, entity_type, date, sentiment_avg, sentiment_delta,
              mention_count, positive_count, negative_count, neutral_count, top_cluster,
              ROW_NUMBER() OVER (PARTITION BY driver_name, entity_type ORDER BY date DESC) AS rn
            FROM driver_sentiment_daily
            WHERE date >= ${cutoffStr}::date
          )
          SELECT driver_name, entity_type,
            ROUND(AVG(sentiment_avg)::NUMERIC, 3) AS sentiment_avg,
            COALESCE(MAX(sentiment_delta) FILTER (WHERE rn = 1), 0) AS sentiment_delta,
            SUM(mention_count) AS mentions,
            SUM(positive_count) AS positive,
            SUM(negative_count) AS negative,
            SUM(neutral_count) AS neutral,
            MODE() WITHIN GROUP (ORDER BY top_cluster) AS top_cluster,
            MAX(date) AS last_seen
          FROM ranked
          GROUP BY driver_name, entity_type
          HAVING SUM(mention_count) > 0
          ORDER BY mentions DESC LIMIT 30
        `
      : await sql`
          WITH ranked AS (
            SELECT driver_name, entity_type, date, sentiment_avg, sentiment_delta,
              mention_count, positive_count, negative_count, neutral_count, top_cluster,
              ROW_NUMBER() OVER (PARTITION BY driver_name, entity_type ORDER BY date DESC) AS rn
            FROM driver_sentiment_daily
            WHERE date >= ${cutoffStr}::date
              AND entity_type = ${entityType}
          )
          SELECT driver_name, entity_type,
            ROUND(AVG(sentiment_avg)::NUMERIC, 3) AS sentiment_avg,
            COALESCE(MAX(sentiment_delta) FILTER (WHERE rn = 1), 0) AS sentiment_delta,
            SUM(mention_count) AS mentions,
            SUM(positive_count) AS positive,
            SUM(negative_count) AS negative,
            SUM(neutral_count) AS neutral,
            MODE() WITHIN GROUP (ORDER BY top_cluster) AS top_cluster,
            MAX(date) AS last_seen
          FROM ranked
          GROUP BY driver_name, entity_type
          HAVING SUM(mention_count) > 0
          ORDER BY mentions DESC LIMIT 30
        `

    const formatted = summary.map((row: any) => ({
      name:           row.driver_name,
      driverName:     row.driver_name,
      entityType:     row.entity_type,
      team:           row.entity_type === 'team' ? row.driver_name : '',
      sentimentAvg:   Number(row.sentiment_avg),
      sentimentDelta: Number(row.sentiment_delta || 0),
      sentimentLabel: Number(row.sentiment_avg) > 0.15 ? 'positive'
                    : Number(row.sentiment_avg) < -0.15 ? 'negative' : 'neutral',
      mentions:       Number(row.mentions),
      totalMentions:  Number(row.mentions),
      positive:       Number(row.positive),
      negative:       Number(row.negative),
      neutral:        Number(row.neutral),
      topCluster:     row.top_cluster,
      lastSeen:       row.last_seen,
    }))
    return NextResponse.json({ ok: true, days, entityType, count: formatted.length, data: formatted, drivers: formatted })
  } catch (error) {
    console.error('[/api/intelligence/drivers]', error)
    return NextResponse.json({ ok: false, error: 'Failed to fetch driver data' }, { status: 500 })
  }
}
