import type { getNeonSql } from '@/lib/neon'

type Sql = ReturnType<typeof getNeonSql>
type CalendarRace = {
  race_name: string; city?: string | null; country?: string | null
  fp1_date?: string | null; sprint_quali_date?: string | null
  quali_date?: string | null; race_start_utc?: string | null; race_date: string
}
export type FeedPolicy = {
  mode: 'race-weekend' | 'race-build-up' | 'between-races' | 'long-break'
  windowHours: number; currentHours: number; halfLifeHours: number
  raceName: string | null; raceTerms: string[]
}
const HOUR = 3600000
const timestamp = (value?: string | null) => value ? Date.parse(value) : NaN

export function storyFeedPolicy(races: CalendarRace[], volume: { last72h: number; last7d: number }, now = Date.now()): FeedPolicy {
  const windows = races.map(race => {
    const end = timestamp(race.race_start_utc) || timestamp(race.race_date)
    const sessions = [race.fp1_date, race.sprint_quali_date, race.quali_date]
      .map(timestamp).filter(Number.isFinite)
    return { race, start: sessions.length ? Math.min(...sessions) : end - 48 * HOUR, end }
  }).filter(w => Number.isFinite(w.end))
  const live = windows.find(w => now >= w.start - 12 * HOUR && now <= w.end + 8 * HOUR)
  const upcoming = windows.filter(w => w.start > now).sort((a, b) => a.start - b.start)[0]
  const nearby = windows.some(w => Math.abs(w.end - now) <= 14 * 24 * HOUR)
  const buildup = upcoming && upcoming.start - now <= 4 * 24 * HOUR ? upcoming : undefined
  const mode: FeedPolicy['mode'] = live ? 'race-weekend' : buildup ? 'race-build-up' : nearby ? 'between-races' : 'long-break'
  const race = (live ?? buildup)?.race
  const baseWindow = mode === 'race-weekend' || mode === 'race-build-up' ? 72 : mode === 'between-races' ? 168 : 336
  // Keep useful coverage during quiet weeks, without letting older context lead.
  const windowHours = Math.max(baseWindow, volume.last72h < 12 ? (volume.last7d < 12 ? 336 : 168) : 72)
  return {
    mode, windowHours,
    currentHours: mode === 'race-weekend' ? 24 : 72,
    halfLifeHours: mode === 'race-weekend' ? 12 : mode === 'race-build-up' ? 36 : mode === 'between-races' ? 72 : 120,
    raceName: race?.race_name ?? null,
    raceTerms: race ? [...new Set([race.race_name.replace(/\b(20\d{2}|grand prix|gp)\b/gi, '').trim(), race.city, race.country]
      .filter((term): term is string => Boolean(term && term.length >= 3)))] : [],
  }
}

export async function loadStoryFeed(sql: Sql, options: { limit: number; cluster?: string; q?: string; hours?: number; now?: number }) {
  const now = options.now ?? Date.now()
  const at = new Date(now).toISOString()
  const cluster = options.cluster || 'all'
  const q = options.q || ''
  const [races, volume] = await Promise.all([
    sql`SELECT race_name, city, country, fp1_date, sprint_quali_date, quali_date, race_start_utc, race_date
        FROM race_calendar WHERE race_date BETWEEN (${at}::timestamptz - INTERVAL '30 days')::date
          AND (${at}::timestamptz + INTERVAL '60 days')::date ORDER BY race_date`,
    sql`SELECT COUNT(*) FILTER (WHERE latest_event_ts >= ${at}::timestamptz - INTERVAL '72 hours')::int AS last72h,
          COUNT(*) FILTER (WHERE latest_event_ts >= ${at}::timestamptz - INTERVAL '7 days')::int AS last7d
        FROM story_timeline WHERE latest_event_ts >= ${at}::timestamptz - INTERVAL '7 days'
          AND latest_event_ts <= ${at}::timestamptz
          AND (${cluster} = 'all' OR topic_cluster = ${cluster})
          AND (${q} = '' OR story_title ILIKE ${`%${q}%`} OR COALESCE(latest_source, '') ILIKE ${`%${q}%`}
            OR COALESCE(latest_url, '') ILIKE ${`%${q}%`})`,
  ])
  const policy = storyFeedPolicy(races as unknown as CalendarRace[], volume[0] as { last72h: number; last7d: number }, now)
  if (options.hours !== undefined) policy.windowHours = options.hours
  const cutoff = new Date(now - policy.windowHours * HOUR).toISOString()
  const currentCutoff = new Date(now - policy.currentHours * HOUR).toISOString()
  const breakingCutoff = new Date(now - 24 * HOUR).toISOString()
  const items = await sql`
    WITH candidates AS (
      SELECT story_id, topic_cluster, story_title, latest_url, latest_source, latest_event_ts,
        first_seen_at, last_seen_at, events_count, sources_count, updates_count,
        max_priority_score, best_priority_tier, driver, heat_index, momentum_score, merge_key,
        (is_breaking AND latest_event_ts >= ${breakingCutoff}::timestamptz) AS is_breaking,
        CASE WHEN latest_event_ts >= ${breakingCutoff}::timestamptz THEN breaking_tier ELSE NULL END AS breaking_tier,
        CASE WHEN latest_event_ts >= ${currentCutoff}::timestamptz THEN 'current' ELSE 'context' END AS feed_section,
        (
          30 + LEAST(100, GREATEST(0, COALESCE(max_priority_score, 0))) * 0.35
          + LEAST(100, GREATEST(0, COALESCE(momentum_score, 0))) * 0.15
          + LEAST(5, GREATEST(0, COALESCE(sources_count, 1) - 1)) * 5
          + CASE WHEN COALESCE(latest_source, '') ~* '(fia|official|formula1\\.com)' THEN 20 ELSE 0 END
          + CASE WHEN latest_event_ts >= ${currentCutoff}::timestamptz AND (
              EXISTS (SELECT 1 FROM jsonb_array_elements_text(${JSON.stringify(policy.raceTerms)}::jsonb) term
                WHERE POSITION(LOWER(term) IN LOWER(story_title)) > 0)
              OR (${policy.mode === 'race-weekend'} AND story_title ~* '\\m(result|qualifying|practice|sprint|stewards|penalty|disqualified)\\M')
            ) THEN 25 ELSE 0 END
        ) * CASE WHEN story_title ~* '(on this day|anniversary|nostalgia|lego|merchandise)' THEN 0.35 ELSE 1 END
          * EXP(-LN(2) * EXTRACT(EPOCH FROM (${at}::timestamptz - latest_event_ts)) / 3600 / ${policy.halfLifeHours}) AS feed_score
      FROM story_timeline
      WHERE latest_event_ts >= ${cutoff}::timestamptz AND latest_event_ts <= ${at}::timestamptz
        AND (${cluster} = 'all' OR topic_cluster = ${cluster})
        AND (${q} = '' OR story_title ILIKE ${`%${q}%`} OR COALESCE(latest_source, '') ILIKE ${`%${q}%`}
          OR COALESCE(latest_url, '') ILIKE ${`%${q}%`})
    )
    SELECT * FROM candidates
    ORDER BY (feed_section = 'current') DESC, feed_score DESC, latest_event_ts DESC, story_id
    LIMIT ${options.limit}
  `
  return { items, policy }
}
