import { neon } from '@neondatabase/serverless'
import { NextResponse } from 'next/server'

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  if (!process.env.NEON_DATABASE_URL) {
    return NextResponse.json({ ok: false, error: 'NEON_DATABASE_URL not configured' }, { status: 503 })
  }
  try {
    const { searchParams } = new URL(request.url)
    const days = parseInt(searchParams.get('days') || '1')
    const type = searchParams.get('type') || 'all'
    const sql = neon(process.env.NEON_DATABASE_URL!)

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
    return NextResponse.json({ ok: true, data, count: data.length })
  } catch (error) {
    console.error('[/api/intelligence/controversy]', error)
    return NextResponse.json({ ok: false, error: 'Failed to fetch controversy data' }, { status: 500 })
  }
}
