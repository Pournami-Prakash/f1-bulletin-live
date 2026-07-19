// app/api/intelligence/session-chatter/route.ts
// Live session chatter — race week articles filtered by relevance
// Only returns data during race week

import { NextResponse } from 'next/server'
import { getNeonSql } from '@/lib/neon'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const session = searchParams.get('session')    // FP1|FP2|FP3|QUALIFYING|SPRINT|RACE|GENERAL
    const hours   = parseInt(searchParams.get('hours') || '6')
    const limit   = parseInt(searchParams.get('limit') || '30')
    const round   = searchParams.get('round')

    const sql = getNeonSql()

    // Get current race round if not specified
    const [stateRow] = await sql`
      SELECT is_race_week, next_race_round, current_session, days_until_race
      FROM weekend_state WHERE id = 1
    `

    // Not race week — return empty with context
    if (!stateRow?.is_race_week) {
      return NextResponse.json({
        ok:         true,
        isRaceWeek: false,
        daysUntil:  stateRow?.days_until_race,
        count:      0,
        data:       [],
        message:    stateRow?.days_until_race
          ? `Session chatter activates in ${stateRow.days_until_race - 5} days`
          : 'No upcoming race found',
      })
    }

    const targetRound = round
      ? parseInt(round)
      : stateRow.next_race_round

    // Fetch chatter with full enrichment
    const chatter = await sql`
      SELECT
        sc.guid,
        sc.title,
        sc.summary,
        sc.source_type,
        sc.cluster_name,
        sc.sentiment_score,
        sc.sentiment_label,
        sc.priority_score,
        sc.session_relevance,
        sc.relevance_score,
        sc.engagement_score,
        sc.published_at,
        sc.race_name,
        sc.circuit_name,
        -- Enrich with article intelligence if available
        (ai.local_embedding IS NOT NULL OR ai.embedding IS NOT NULL) AS has_embedding
      FROM session_chatter sc
      LEFT JOIN article_intelligence ai USING (guid)
      WHERE sc.race_round = ${targetRound}
        AND sc.published_at >= NOW() - (${hours} || ' hours')::INTERVAL
        AND ${session ? sql`sc.session_relevance = ${session.toUpperCase()}` : sql`TRUE`}
      ORDER BY
        sc.relevance_score DESC,
        sc.priority_score  DESC,
        sc.published_at    DESC
      LIMIT ${limit}
    `

    // Group by session for tabbed view
    const bySession: Record<string, typeof chatter> = {}
    chatter.forEach(item => {
      const s = item.session_relevance || 'GENERAL'
      if (!bySession[s]) bySession[s] = []
      bySession[s].push(item)
    })

    // Session counts
    const sessionCounts = Object.fromEntries(
      Object.entries(bySession).map(([k, v]) => [k, v.length])
    )

    return NextResponse.json({
      ok:             true,
      isRaceWeek:     true,
      activeSession:  stateRow.current_session,
      raceName:       chatter[0]?.race_name || null,
      circuitName:    chatter[0]?.circuit_name || null,
      count:          chatter.length,
      sessionCounts,
      data: chatter.map(item => ({
        guid:            item.guid,
        title:           item.title,
        summary:         item.summary,
        sourceType:      item.source_type,
        clusterName:     item.cluster_name,
        sentimentScore:  item.sentiment_score,
        sentimentLabel:  item.sentiment_label,
        priorityScore:   item.priority_score,
        sessionRelevance: item.session_relevance,
        relevanceScore:  item.relevance_score,
        publishedAt:     item.published_at,
      })),
      bySession: session ? undefined : bySession,
    })

  } catch (error) {
    console.error('[/api/intelligence/session-chatter]', error)
    return NextResponse.json(
      { ok: false, error: 'Failed to fetch session chatter' },
      { status: 500 }
    )
  }
}
