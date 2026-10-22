import { publicJson } from '@/lib/api'
import { logEvent } from '@/lib/observability'
import { clamp, toInt, toEnum } from '@/lib/api'
import { getNeonSql } from '@/lib/neon'

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const driver     = searchParams.get('driver')
    const days       = clamp(toInt(searchParams.get('days'), 30), 1, 365)
    const format     = searchParams.get('format') || 'summary'
    const entityType = toEnum(searchParams.get('type'), ['driver', 'team', 'all'] as const, 'driver')
    const sql = getNeonSql()

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)
    const cutoffStr = cutoff.toISOString().split('T')[0]

    if (format === 'batch') {
      const names = (searchParams.get('names') ?? '').split('|').filter(Boolean);
      if (!names.length || names.length > 30 || names.some(name => name.length > 80)) {
        return publicJson({ ok: false, error: 'Provide up to 30 entity names' }, { status: 400 });
      }
      const series = await sql`
        SELECT driver_name, date, entity_type, sentiment_avg, sentiment_delta,
          sentiment_label, mention_count, positive_count, negative_count, neutral_count, top_cluster
        FROM driver_sentiment_daily
        WHERE driver_name = ANY(${names}) AND entity_type = ${entityType}
          AND date >= ${cutoffStr}::date
        ORDER BY driver_name, date ASC LIMIT 11000`;
      const data: Record<string, typeof series> = Object.fromEntries(names.map(name => [name, []]));
      for (const row of series) data[row.driver_name]?.push(row);
      return publicJson({ ok: true, data });
    }
    if (format !== 'summary' && format !== 'timeseries') return publicJson({ ok: false, error: 'Invalid format' }, { status: 400 });
    if (format === 'timeseries') {
      if (!driver) return publicJson({ ok: false, error: 'driver param required' }, { status: 400 })
      const series = await sql`
        SELECT date, entity_type, sentiment_avg, sentiment_delta,
          sentiment_label, mention_count, positive_count,
          negative_count, neutral_count, top_cluster
        FROM driver_sentiment_daily
        WHERE LOWER(driver_name) = LOWER(${driver})
          AND entity_type = ${entityType}
          AND date >= ${cutoffStr}::date
        ORDER BY date ASC LIMIT 366
      `
      return publicJson({ ok: true, driver, days, data: series })
    }

    const summary = entityType === 'all'
      ? await sql`
          WITH latest AS (
            SELECT MAX(date) AS max_date
            FROM driver_sentiment_daily
            WHERE date >= ${cutoffStr}::date
          ),
          ranked AS (
            SELECT driver_name, entity_type, date, sentiment_avg, sentiment_delta,
              mention_count, positive_count, negative_count, neutral_count, top_cluster,
              ROW_NUMBER() OVER (PARTITION BY driver_name, entity_type ORDER BY date DESC) AS rn
            FROM driver_sentiment_daily
            WHERE date = (SELECT max_date FROM latest)
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
          WITH latest AS (
            SELECT MAX(date) AS max_date
            FROM driver_sentiment_daily
            WHERE date >= ${cutoffStr}::date
              AND entity_type = ${entityType}
          ),
          ranked AS (
            SELECT driver_name, entity_type, date, sentiment_avg, sentiment_delta,
              mention_count, positive_count, negative_count, neutral_count, top_cluster,
              ROW_NUMBER() OVER (PARTITION BY driver_name, entity_type ORDER BY date DESC) AS rn
            FROM driver_sentiment_daily
            WHERE date = (SELECT max_date FROM latest)
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
    return publicJson({ ok: true, days, entityType, count: formatted.length, data: formatted, drivers: formatted })
  } catch {
    logEvent('error', 'api_failed', { route: '/api/intelligence/drivers' })
    return publicJson({ ok: false, error: 'Failed to fetch driver data' }, { status: 500 })
  }
}
