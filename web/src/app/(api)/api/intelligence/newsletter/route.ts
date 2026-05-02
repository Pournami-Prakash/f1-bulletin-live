import { neon } from '@neondatabase/serverless'
import {
  clamp,
  err,
  methodNotAllowed,
  ok,
  toErrorMessage,
  toInt,
} from '@/lib/api'

export const dynamic = 'force-dynamic'

type StoryRow = {
  story_id: string
  topic_cluster: string | null
  story_title: string
  latest_url: string | null
  latest_source: string | null
  latest_event_ts: string
  first_seen_at: string | null
  last_seen_at: string | null
  events_count: number | null
  sources_count: number | null
  updates_count: number | null
  max_priority_score: number | null
  best_priority_tier: string | null
  driver: string | null
  heat_index: number | null
  momentum_score: number | null
  is_breaking: boolean | null
  breaking_tier: string | null
  merge_key: string | null
}

type NewsletterStory = {
  storyId: string
  title: string
  url: string | null
  source: string | null
  sourceType: 'news' | 'reddit' | 'official'
  cluster: string
  driver: string | null
  time: string
  priorityTier: string
  momentum: number
  heat: number
  sourceCount: number
  eventCount: number
  updateCount: number
  isBreaking: boolean
  majorScore: number
}

type NewsletterSection = {
  key: string
  label: string
  kicker: string
  tone: string
  stories: NewsletterStory[]
}

type StandingItem = {
  position: number
  name: string
  team?: string
  points: number
}

type SessionTopThree = {
  session: string
  gpName: string
  date: string | null
  rows: {
    position: number
    driver: string
    team?: string | null
    timeMs?: number | null
    gapMs?: number | null
  }[]
}

type LiveTimingSession = {
  Type?: string
  Name?: string
  StartDate?: string
  EndDate?: string
  GmtOffset?: string
  Path?: string
}

type LiveTimingMeeting = {
  Name?: string
  Sessions?: LiveTimingSession[]
}

type LiveTimingDriver = {
  FirstName?: string
  LastName?: string
  FullName?: string
  Tla?: string
  TeamName?: string
}

type LiveTimingLine = {
  Position?: string
  RacingNumber?: string
  BestLapTime?: { Value?: string }
  BestLapTimes?: { Value?: string }[]
}

const TEAM_RE = /\b(ferrari|mercedes|mclaren|red bull|williams|aston martin|alpine|haas|sauber|racing bulls|cadillac)\b/i
const TECH_RE = /\b(upgrade|floor|wing|engine|power unit|chassis|technical|aero|car|package|development)\b/i
const DRIVER_RE = /\b(driver|contract|seat|teammate|rookie|verstappen|norris|piastri|leclerc|hamilton|russell|alonso|sainz|antonelli|tsunoda|lawson|gasly|ocon|albon|bearman|hulkenberg|bortoleto|hadjar|stroll)\b/i

function sourceType(source?: string | null): NewsletterStory['sourceType'] {
  const s = String(source ?? '').toLowerCase()
  if (s.includes('reddit')) return 'reddit'
  if (s.includes('fia') || s.includes('official') || s.includes('formula1.com')) return 'official'
  return 'news'
}

function priorityWeight(tier?: string | null) {
  const t = String(tier ?? '').toUpperCase()
  if (t.includes('P0') || t.includes('CRITICAL')) return 48
  if (t.includes('P1') || t.includes('HIGH')) return 34
  if (t.includes('P2') || t.includes('MEDIUM')) return 22
  if (t.includes('P3') || t.includes('LOW')) return 10
  return 12
}

function storyKey(title: string) {
  return title.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim().slice(0, 84)
}

function majorScore(row: StoryRow) {
  return Math.round(
    priorityWeight(row.best_priority_tier) +
    (row.is_breaking ? 35 : 0) +
    Math.min(Number(row.momentum_score) || 0, 100) * 0.36 +
    Math.min(Number(row.heat_index) || 0, 100) * 0.22 +
    Math.min(Number(row.sources_count) || 0, 10) * 3.4 +
    Math.min(Number(row.events_count) || 0, 18) * 1.5 +
    Math.min(Number(row.updates_count) || 0, 12) * 1.2
  )
}

function mapStory(row: StoryRow): NewsletterStory {
  return {
    storyId: row.story_id,
    title: row.story_title,
    url: row.latest_url,
    source: row.latest_source,
    sourceType: sourceType(row.latest_source),
    cluster: row.topic_cluster ?? 'GENERAL_F1',
    driver: row.driver,
    time: row.latest_event_ts,
    priorityTier: row.best_priority_tier ?? 'P2',
    momentum: Math.round(Number(row.momentum_score) || 0),
    heat: Math.round(Number(row.heat_index) || 0),
    sourceCount: Number(row.sources_count) || 0,
    eventCount: Number(row.events_count) || 0,
    updateCount: Number(row.updates_count) || 0,
    isBreaking: Boolean(row.is_breaking),
    majorScore: majorScore(row),
  }
}

function dedupe(rows: StoryRow[]) {
  const seen = new Set<string>()
  return rows
    .map(mapStory)
    .filter((story) => {
      const key = storyKey(story.title)
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => b.majorScore - a.majorScore || Date.parse(b.time) - Date.parse(a.time))
}

function pickUnique(stories: NewsletterStory[], count: number, used: Set<string>) {
  const picked: NewsletterStory[] = []
  for (const story of stories) {
    const key = storyKey(story.title)
    if (!key || used.has(key)) continue
    used.add(key)
    picked.push(story)
    if (picked.length >= count) break
  }
  return picked
}

function makeSection(
  key: string,
  label: string,
  kicker: string,
  tone: string,
  stories: NewsletterStory[],
  count: number,
  used: Set<string>
): NewsletterSection {
  return { key, label, kicker, tone, stories: pickUnique(stories, count, used) }
}

function pickAward(label: string, stories: NewsletterStory[], used: Set<string>) {
  const [story] = pickUnique(stories, 1, used)
  return story ? { label, story } : null
}

function dominantCluster(stories: NewsletterStory[]) {
  const counts = new Map<string, number>()
  for (const story of stories) counts.set(story.cluster, (counts.get(story.cluster) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]?.replace(/_/g, ' ') ?? 'general F1'
}

function formatRange(days: number) {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - days)
  const fmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
  return `${fmt.format(start)} - ${fmt.format(end)}`
}

function contextBulletsForIssue() {
  const now = new Date()
  const inMiamiRestartWindow = now >= new Date('2026-04-01T00:00:00Z') && now <= new Date('2026-05-04T23:59:59Z')
  if (!inMiamiRestartWindow) return []
  return [
    'April reset: Bahrain and Saudi Arabia were called off, leaving a long gap between Japan and Miami.',
    'Miami restart: the championship resumes with the May 1-3 sprint weekend.',
    'Development race: teams used the pause for analysis, simulator work, wind tunnel correlation and upgrade prep.',
  ]
}

function qualiTimeToMs(value: string) {
  const [minutes, rest] = value.split(':')
  const seconds = Number(rest)
  const mins = Number(minutes)
  if (!Number.isFinite(mins) || !Number.isFinite(seconds)) return null
  return Math.round((mins * 60 + seconds) * 1000)
}

function parseLiveTimingDate(value?: string, gmtOffset?: string) {
  if (!value) return null
  const offset = gmtOffset ? gmtOffset.slice(0, 6) : 'Z'
  const date = new Date(`${value}${offset}`)
  return Number.isNaN(date.getTime()) ? null : date
}

async function fetchLiveTimingJson<T>(path: string, revalidate = 30): Promise<T | null> {
  const res = await fetch(`https://livetiming.formula1.com/static/${path}`, {
    headers: { 'user-agent': 'f1-bulletin/1.0' },
    next: { revalidate },
  })
  if (!res.ok) return null
  const text = await res.text()
  return JSON.parse(text.replace(/^\uFEFF/, '')) as T
}

function liveTimingDriverName(driver?: LiveTimingDriver) {
  if (!driver) return 'Unknown'
  const firstLast = [driver.FirstName, driver.LastName].filter(Boolean).join(' ')
  const name = firstLast || driver.FullName?.replace(/\s+/g, ' ').trim() || 'Unknown'
  return driver.Tla ? `${name} (${driver.Tla})` : name
}

async function fetchLiveTimingSessionTopThree(): Promise<SessionTopThree | null> {
  try {
    const season = new Date().getUTCFullYear()
    const yearIndex = await fetchLiveTimingJson<{ Meetings?: LiveTimingMeeting[] }>(`${season}/Index.json`, 300)
    if (!yearIndex?.Meetings?.length) return null

    const now = Date.now()
    const candidates = yearIndex.Meetings.flatMap((meeting) =>
      (meeting.Sessions ?? []).map((session) => ({ meeting, session }))
    )
      .filter(({ session }) => {
        const type = session.Type?.toLowerCase()
        if (type !== 'qualifying' && type !== 'practice') return false
        if (!session.Path) return false
        const start = parseLiveTimingDate(session.StartDate, session.GmtOffset)
        if (!start) return false
        return start.getTime() <= now + 30 * 60 * 1000 && start.getTime() >= now - 7 * 24 * 60 * 60 * 1000
      })
      .sort((a, b) => {
        const aStart = parseLiveTimingDate(a.session.StartDate, a.session.GmtOffset)?.getTime() ?? 0
        const bStart = parseLiveTimingDate(b.session.StartDate, b.session.GmtOffset)?.getTime() ?? 0
        return bStart - aStart
      })

    for (const { meeting, session } of candidates) {
      const path = session.Path ?? ''
      const [sessionInfo, driverList, timingData] = await Promise.all([
        fetchLiveTimingJson<{ Meeting?: { Name?: string }; Name?: string; Type?: string; StartDate?: string }>(`${path}SessionInfo.json`, 30),
        fetchLiveTimingJson<Record<string, LiveTimingDriver>>(`${path}DriverList.json`, 30),
        fetchLiveTimingJson<{ Lines?: Record<string, LiveTimingLine> }>(`${path}TimingData.json`, 15),
      ])
      const lines = timingData?.Lines
      if (!driverList || !lines) continue

      const rows = Object.values(lines)
        .map((line) => {
          const racingNumber = line.RacingNumber
          const best = line.BestLapTime?.Value ?? line.BestLapTimes?.at(-1)?.Value
          const position = Number(line.Position)
          return {
            position: Number.isFinite(position) ? position : 99,
            driver: liveTimingDriverName(racingNumber ? driverList[racingNumber] : undefined),
            team: racingNumber ? driverList[racingNumber]?.TeamName : null,
            timeMs: best ? qualiTimeToMs(best) : null,
          }
        })
        .filter((row) => row.position > 0 && row.position < 99 && row.timeMs)
        .sort((a, b) => a.position - b.position || (a.timeMs ?? 0) - (b.timeMs ?? 0))
        .slice(0, 3)

      if (rows.length >= 3) {
        return {
          session: sessionInfo?.Name ?? session.Name ?? session.Type ?? 'Session',
          gpName: sessionInfo?.Meeting?.Name ?? meeting.Name ?? 'Grand Prix',
          date: sessionInfo?.StartDate?.slice(0, 10) ?? session.StartDate?.slice(0, 10) ?? null,
          rows,
        }
      }
    }

    return null
  } catch {
    return null
  }
}

function driverName(row: Record<string, unknown>) {
  const driver = row.Driver as Record<string, string> | undefined
  if (!driver) return 'Unknown'
  return [driver.givenName, driver.familyName].filter(Boolean).join(' ') || driver.driverId || 'Unknown'
}

async function fetchStandings(): Promise<{ drivers: StandingItem[]; constructors: StandingItem[] }> {
  const [driversRes, constructorsRes] = await Promise.all([
    fetch('https://api.jolpi.ca/ergast/f1/current/driverStandings.json', { next: { revalidate: 3600 } }),
    fetch('https://api.jolpi.ca/ergast/f1/current/constructorStandings.json', { next: { revalidate: 3600 } }),
  ])

  const [driversJson, constructorsJson] = await Promise.all([
    driversRes.ok ? driversRes.json() : null,
    constructorsRes.ok ? constructorsRes.json() : null,
  ])

  const driverRows = driversJson?.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings ?? []
  const constructorRows = constructorsJson?.MRData?.StandingsTable?.StandingsLists?.[0]?.ConstructorStandings ?? []

  return {
    drivers: driverRows.slice(0, 5).map((row: Record<string, unknown>) => ({
      position: Number(row.position) || 0,
      name: driverName(row),
      team: ((row.Constructors as Record<string, string>[] | undefined)?.[0]?.name) ?? undefined,
      points: Number(row.points) || 0,
    })),
    constructors: constructorRows.slice(0, 5).map((row: Record<string, unknown>) => ({
      position: Number(row.position) || 0,
      name: (row.Constructor as Record<string, string> | undefined)?.name ?? 'Unknown',
      points: Number(row.points) || 0,
    })),
  }
}

export async function GET(req: Request) {
  if (!process.env.NEON_DATABASE_URL) {
    return err('NEON_DATABASE_URL not configured', 503, 'CONFIG_ERROR')
  }

  const { searchParams } = new URL(req.url)
  const days = clamp(toInt(searchParams.get('days'), 30), 1, 31)
  const limit = clamp(toInt(searchParams.get('limit'), 160), 24, 200)

  try {
    const sql = neon(process.env.NEON_DATABASE_URL!)
    const [rows, qualiRows, practiceRows, standings] = await Promise.all([
      sql`
      SELECT
        story_id,
        topic_cluster,
        story_title,
        latest_url,
        latest_source,
        latest_event_ts,
        first_seen_at,
        last_seen_at,
        events_count,
        sources_count,
        updates_count,
        max_priority_score,
        best_priority_tier,
        driver,
        heat_index,
        momentum_score,
        is_breaking,
        breaking_tier,
        merge_key
      FROM story_timeline
      WHERE latest_event_ts >= NOW() - (${days} || ' days')::interval
      ORDER BY is_breaking DESC, COALESCE(momentum_score, 0) DESC, latest_event_ts DESC
      LIMIT ${limit}
    `,
      sql`
        SELECT s.gp_name, s.date, q.driver_code, q.best_ms, q.gap_to_pole_ms, q.grid_position
        FROM qualifying_laps q
        JOIN sessions s ON s.id = q.session_id
        WHERE s.session_type = 'Q'
          AND s.date >= CURRENT_DATE - INTERVAL '10 days'
          AND s.date <= CURRENT_DATE + INTERVAL '2 days'
          AND q.best_ms IS NOT NULL
        ORDER BY s.date DESC, s.round DESC, q.grid_position ASC NULLS LAST, q.best_ms ASC
        LIMIT 3
      `,
      sql`
        WITH latest_practice AS (
          SELECT pl.session_id, pl.fp_session
          FROM practice_laps pl
          JOIN sessions s ON s.id = pl.session_id
          WHERE s.date >= CURRENT_DATE - INTERVAL '10 days'
            AND s.date <= CURRENT_DATE + INTERVAL '2 days'
          ORDER BY s.date DESC, s.round DESC,
            CASE pl.fp_session WHEN 'FP3' THEN 3 WHEN 'FP2' THEN 2 WHEN 'FP1' THEN 1 ELSE 0 END DESC
          LIMIT 1
        )
        SELECT s.gp_name, s.date, pl.fp_session, pl.driver_code, pl.best_lap_ms
        FROM practice_laps pl
        JOIN latest_practice lp ON lp.session_id = pl.session_id AND lp.fp_session = pl.fp_session
        JOIN sessions s ON s.id = pl.session_id
        WHERE pl.best_lap_ms IS NOT NULL
        ORDER BY pl.best_lap_ms ASC
        LIMIT 3
      `,
      fetchStandings().catch(() => ({ drivers: [], constructors: [] })),
    ])

    const stories = dedupe(rows as unknown as StoryRow[])
    const breaking = stories.filter((s) => s.isBreaking)
    const official = stories.filter((s) => s.sourceType === 'official')
    const reddit = stories.filter((s) => s.sourceType === 'reddit')
    const driverDrama = stories.filter((s) => Boolean(s.driver) || DRIVER_RE.test(s.title))
    const teamTech = stories.filter((s) => TEAM_RE.test(s.title) || TECH_RE.test(s.title))
    const watchNext = [...stories].sort((a, b) => {
      const aFresh = Date.parse(a.time) || 0
      const bFresh = Date.parse(b.time) || 0
      return (b.momentum + b.heat + bFresh / 100000000000) - (a.momentum + a.heat + aFresh / 100000000000)
    })

    const breakingPool = breaking.length
      ? breaking
      : stories.filter((s) => s.majorScore >= 55).length
        ? stories.filter((s) => s.majorScore >= 55)
        : stories
    const heroUsed = new Set<string>()
    const breakingNews = pickUnique(breakingPool, 6, heroUsed)
    const usedStories = new Set(heroUsed)
    const sections = [
      makeSection('lead', 'The big lap', 'The month distilled to the headlines with the loudest signal.', 'headline', stories, 6, usedStories),
      makeSection('shocks', 'Safety car moments', 'Breaking items, high-priority spikes, and stories that refused to stay quiet.', 'urgent', breaking.length ? breaking : stories.filter((s) => s.majorScore >= 75), 4, usedStories),
      makeSection('drivers', 'Driver drama desk', 'Contracts, teammates, rookies, reputations, and main-character energy.', 'character', driverDrama, 5, usedStories),
      makeSection('teams', 'Factory floor gossip', 'Constructor narratives, technical swings, upgrades, and garage politics.', 'technical', teamTech, 5, usedStories),
      makeSection('official', 'From the stewards room', 'Official and regulatory notes worth keeping in the permanent record.', 'official', official, 3, usedStories),
      makeSection('fans', 'Fan radio check', 'The fan pulse when the conversation jumped from headline to group chat.', 'fans', reddit, 3, usedStories),
      makeSection('watch', 'Next episode hooks', 'Stories with enough heat or recency to keep an eye on.', 'watch', watchNext, 4, usedStories),
    ].filter((section) => section.stories.length > 0)

    const awardUsed = new Set(usedStories)
    const awards = [
      pickAward('Main character energy', driverDrama.length ? driverDrama : stories, awardUsed),
      pickAward('Biggest siren', breaking.length ? breaking : stories, awardUsed),
      pickAward('Receipts department', [...stories].sort((a, b) => b.sourceCount - a.sourceCount), awardUsed),
      pickAward('Momentum merchant', [...stories].sort((a, b) => b.momentum - a.momentum), awardUsed),
    ].filter((award): award is { label: string; story: NewsletterStory } => Boolean(award))

    const rollupUsed = new Set([...awardUsed])
    const headlineRollup = pickUnique(stories, 18, rollupUsed)
    const liveTimingSession = await fetchLiveTimingSessionTopThree()
    const sessionTopThree: SessionTopThree | null = qualiRows.length > 0
      ? {
          session: 'Qualifying',
          gpName: String(qualiRows[0].gp_name),
          date: qualiRows[0].date ? String(qualiRows[0].date) : null,
          rows: qualiRows.map((row: Record<string, unknown>, index: number) => ({
            position: Number(row.grid_position) || index + 1,
            driver: String(row.driver_code),
            timeMs: Number(row.best_ms) || null,
            gapMs: Number(row.gap_to_pole_ms) || null,
          })),
        }
      : practiceRows.length > 0
        ? {
            session: String(practiceRows[0].fp_session),
            gpName: String(practiceRows[0].gp_name),
            date: practiceRows[0].date ? String(practiceRows[0].date) : null,
            rows: practiceRows.map((row: Record<string, unknown>, index: number) => ({
              position: index + 1,
              driver: String(row.driver_code),
              timeMs: Number(row.best_lap_ms) || null,
            })),
          }
        : null
    const resolvedSessionTopThree = liveTimingSession ?? sessionTopThree

    const payload = {
      title: 'The Paddock Month in Review',
      issueLabel: `${days}-day intelligence newsletter`,
      rangeLabel: formatRange(days),
      generatedAt: new Date().toISOString(),
      dek: stories.length
        ? `Thirty days of F1 noise, trimmed to ${stories.length} major storylines. The dominant thread was ${dominantCluster(stories).toLowerCase()}, with ${breaking.length} breaking signals and ${Math.max(...stories.map((s) => s.momentum), 0)} peak momentum.`
        : 'No major F1 storylines landed in this window yet.',
      stats: {
        totalStories: stories.length,
        breakingStories: breaking.length,
        officialStories: official.length,
        redditStories: reddit.length,
        topCluster: dominantCluster(stories),
        peakMomentum: Math.max(...stories.map((s) => s.momentum), 0),
      },
      contextBullets: contextBulletsForIssue(),
      breakingNews,
      sections,
      awards,
      headlineRollup,
      standings,
      sessionTopThree: resolvedSessionTopThree,
    }

    return ok(payload, { count: stories.length })
  } catch (e) {
    console.error('[/api/intelligence/newsletter]', e)
    return err(toErrorMessage(e))
  }
}

export function POST() {
  return methodNotAllowed(['GET'])
}
