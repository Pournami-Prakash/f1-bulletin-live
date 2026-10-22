import { publicJson } from '@/lib/api'
import { logEvent } from '@/lib/observability'
import { clamp, toInt, toEnum } from '@/lib/api'
import { getNeonSql } from '@/lib/neon'

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const days = clamp(toInt(searchParams.get('days'), 1), 1, 365)
    const type = toEnum(searchParams.get('type'), ['driver', 'team', 'all'] as const, 'all')
    const sql = getNeonSql()

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)
    const cutoffStr = cutoff.toISOString().split('T')[0]

    const rows = type === 'all'
      ? await sql`
          SELECT entity_name, entity_type, index_date,
            controversy_score, controversy_label,
            sentiment_score, spike_score, media_score,
            score_delta, trending_direction,
            mention_count, negative_count, top_cluster, updated_at
          FROM controversy_index
          WHERE index_date >= ${cutoffStr}::date
          ORDER BY controversy_score DESC NULLS LAST
          LIMIT 20
        `
      : await sql`
          SELECT entity_name, entity_type, index_date,
            controversy_score, controversy_label,
            sentiment_score, spike_score, media_score,
            score_delta, trending_direction,
            mention_count, negative_count, top_cluster, updated_at
          FROM controversy_index
          WHERE index_date >= ${cutoffStr}::date
            AND entity_type = ${type}
          ORDER BY controversy_score DESC NULLS LAST
          LIMIT 20
        `
    const data = rows.map((r: any) => ({
      name:           r.entity_name,
      entityName:     r.entity_name,
      type:           r.entity_type,
      entityType:     r.entity_type,
      date:           r.index_date,
      score:          r.controversy_score,
      label:          r.controversy_label,
      sentimentScore: r.sentiment_score,
      spikeScore:     r.spike_score,
      mediaScore:     r.media_score,
      delta:          r.score_delta,
      trend:          r.trending_direction,
      mentions:       r.mention_count,
      negativeCount:  r.negative_count,
      topCluster:     r.top_cluster,
    }))
    return publicJson({ ok: true, data, count: data.length })
  } catch {
    logEvent('error', 'api_failed', { route: '/api/intelligence/controversy' })
    return publicJson({ ok: false, error: 'Failed to fetch controversy data' }, { status: 500 })
  }
}
