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
  mergeKey: string | null
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

type TeamRaceReport = {
  team: string
  overview: string
  keyIssues: string[]
  storyThemes: string[]
  totalPoints: number
  rounds: {
    round: number
    gpName: string
    circuit: string
    eventDate: string | null
    fp: string | null
    qualifying: string | null
    sprint: string | null
    race: string | null
    summary: string
    wentWrong: string[]
  }[]
}

type TeamRaceReportRow = {
  team: string
  round: number
  gp_name: string
  circuit: string
  event_date: string | null
  fp_summary: string | null
  quali_summary: string | null
  sprint_summary: string | null
  race_summary: string | null
  fp_best_rank: string | number | null
  fp_sessions: string | number | null
  quali_best_pos: string | number | null
  quali_avg_pos: string | number | null
  sprint_best_pos: string | number | null
  sprint_points: string | number | null
  race_best_pos: string | number | null
  race_points: string | number | null
  race_avg_grid: string | number | null
  race_avg_finish: string | number | null
  race_statuses: string | null
}

type TeamIssueRow = {
  title: string
  summary: string | null
  body_text: string | null
  text_all: string | null
  source: string | null
  event_ts: string
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

const STORY_STOPWORDS = new Set([
  'a', 'amid', 'and', 'at', 'be', 'been', 'but', 'by', 'due', 'for', 'from', 'gp', 'grand',
  'has', 'have', 'heres', 'in', 'into', 'is', 'it', 'latest', 'main', 'new', 'of', 'on',
  'over', 'prix', 'race', 's', 'set', 'start', 'the', 'this', 'to', 'will', 'with', 'why',
])

const ENTITY_ALIASES: Record<string, string[]> = {
  antonelli: ['antonelli', 'kimi'],
  bortoleto: ['bortoleto', 'gabriel'],
  hadjar: ['hadjar', 'isack', '#06', 'car 06'],
  russell: ['russell', 'george'],
  mercedes: ['mercedes', 'wolff'],
}

function storyTokens(title: string) {
  return title
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(20\d{2}|f1|formula\s+1)\b/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !STORY_STOPWORDS.has(token))
}

function storyKey(title: string) {
  return [...new Set(storyTokens(title))].sort().join(' ').slice(0, 140)
}

function normalizedHeadline(title: string) {
  return title
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/#0?(\d+)/g, 'car $1')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function storyEntities(title: string) {
  const text = normalizedHeadline(title)
  const entities = Object.entries(ENTITY_ALIASES)
    .filter(([, aliases]) => aliases.some((alias) => text.includes(alias)))
    .map(([entity]) => entity)

  return entities.length ? entities.sort().join('+') : 'general'
}

function storyIncidentBucket(title: string) {
  const text = normalizedHeadline(title)
  const hasMiami = text.includes('miami')
  const hasWeather = /\b(storm|thunderstorm|weather|lightning|rain)\b/.test(text)

  if (hasMiami && hasWeather && /\b(start time|moved earlier|forward|changed|combat|risk|threat)\b/.test(text)) {
    return 'miami-weather-start-time'
  }
  if (/\b(disqualified|disqualification|excluded|exclusion|failed technical inspection|technical inspection|technical breach|floorboard|floorboards|referred to stewards|stewards)\b/.test(text)) {
    return 'regulatory-technical'
  }
  if (hasMiami && /\b(post qualifying|qualifying results|qualifying discussion|qualifying result)\b/.test(text)) {
    return 'miami-qualifying-results'
  }
  if (hasMiami && /\b(starting grid|grid for the main race|race grid)\b/.test(text)) {
    return 'miami-starting-grid'
  }

  return null
}

function storyDedupeKeys(story: NewsletterStory) {
  const keys = new Set<string>()
  const titleKey = storyKey(story.title)
  const incidentBucket = storyIncidentBucket(story.title)

  if (story.mergeKey) keys.add(`merge:${story.mergeKey}`)
  if (titleKey) keys.add(`title:${titleKey}`)
  if (incidentBucket) keys.add(`incident:${incidentBucket}:${storyEntities(story.title)}`)

  return keys
}

function isNearDuplicateTitle(a: string, b: string) {
  const aIncident = storyIncidentBucket(a)
  const bIncident = storyIncidentBucket(b)
  if (aIncident && aIncident === bIncident) {
    const aEntities = storyEntities(a)
    const bEntities = storyEntities(b)
    if (aEntities === bEntities || aEntities === 'general' || bEntities === 'general') return true
  }

  const aTokens = new Set(storyTokens(a))
  const bTokens = new Set(storyTokens(b))
  if (!aTokens.size || !bTokens.size) return false

  let overlap = 0
  for (const token of aTokens) if (bTokens.has(token)) overlap += 1
  const smaller = Math.min(aTokens.size, bTokens.size)
  const larger = Math.max(aTokens.size, bTokens.size)
  const jaccard = overlap / (aTokens.size + bTokens.size - overlap)

  return (smaller >= 4 && overlap >= smaller) || (larger >= 5 && jaccard >= 0.58)
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
    mergeKey: row.merge_key,
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

function num(value: string | number | null | undefined) {
  if (value === null || value === undefined) return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function formatPos(value: number | null) {
  return value ? `P${Math.round(value)}` : 'no mark'
}

const TEAM_ALIASES: Record<string, string[]> = {
  'Aston Martin': ['aston martin', 'alonso', 'stroll'],
  Alpine: ['alpine', 'gasly', 'colapinto', 'doohan'],
  Audi: ['audi', 'sauber', 'kick sauber', 'hulkenberg', 'bortoleto'],
  Cadillac: ['cadillac', 'perez', 'bottas'],
  Ferrari: ['ferrari', 'leclerc', 'hamilton'],
  'Haas F1 Team': ['haas', 'bearman', 'ocon'],
  McLaren: ['mclaren', 'norris', 'piastri'],
  Mercedes: ['mercedes', 'antonelli', 'russell', 'wolff'],
  'Racing Bulls': ['racing bulls', 'lawson', 'lindblad'],
  'Red Bull Racing': ['red bull', 'verstappen', 'hadjar'],
  Williams: ['williams', 'albon', 'sainz'],
}

function teamStoryMatches(team: string, story: NewsletterStory) {
  return teamTextMatches(team, story.title)
}

function cleanIssueText(value?: string | null) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[^;\s]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function teamTextMatches(team: string, text: string) {
  const t = text.toLowerCase()
  if (/\b(golf|pga|scheffler|young stretches|harry williams)\b/.test(t)) return false
  const aliases = TEAM_ALIASES[team] ?? [team.toLowerCase()]
  return aliases.some((alias) => t.includes(alias))
}

function issueThemeFromText(text: string) {
  const t = text.toLowerCase()
  if (/\b(overweight|weight limit|too heavy)\b/.test(t)) return 'Weight is a recurring concern in coverage, costing lap time before the team can fight cleanly.'
  if (/\b(hydraulic|reliability|failure|issue|problem|retired|dnf)\b/.test(t)) return 'Reliability has been part of the story, turning pace windows into damage limitation.'
  if (/\b(shakedown|preparation|delays?|missed testing|private testing|barcelona|behind schedule|back foot)\b/.test(t)) return 'Preparation has looked compromised, leaving the team on the back foot early.'
  if (/\b(front wing|wing change|floor|aero|upgrade|upgraded|package|development|setup)\b/.test(t)) return 'The car is still being worked through aerodynamically, with setup or upgrade questions shaping the weekend.'
  if (/\b(strategy|tactical|pit stop|pit stops|tyre|tires)\b/.test(t)) return 'Execution and strategy are carrying extra weight because raw pace has not been enough on its own.'
  if (/\b(disqualified|penalty|penalised|penalized|stewards|track limits)\b/.test(t)) return 'Regulatory or penalty trouble added avoidable drag to the weekend.'
  if (/\brain|weather|forecast|wet\b/.test(t)) return 'Weather uncertainty complicated the read on pace and race execution.'
  if (/\b(slow start|poor start|lack pace|lacks raw pace|far off|struggling|passenger|painful|ninth fastest|top four)\b/.test(t)) return 'The competitive picture reads as a pace deficit rather than one isolated bad result.'
  return null
}

function issueText(row: TeamIssueRow) {
  return cleanIssueText([row.title, row.summary, row.body_text, row.text_all].filter(Boolean).join(' '))
}

function teamStoryThemes(team: string, stories: NewsletterStory[], issueRows: TeamIssueRow[] = []) {
  const seen = new Set<string>()
  const themes: string[] = []
  for (const row of issueRows) {
    const text = issueText(row)
    if (!teamTextMatches(team, text)) continue
    const theme = issueThemeFromText(text)
    if (!theme || seen.has(theme)) continue
    seen.add(theme)
    themes.push(theme)
  }
  for (const story of stories) {
    if (!teamStoryMatches(team, story)) continue
    const theme = issueThemeFromText(story.title)
    if (!theme || seen.has(theme)) continue
    seen.add(theme)
    themes.push(theme)
  }
  return themes
    .sort((a, b) => issuePriority(a) - issuePriority(b))
    .slice(0, 4)
}

function issuePriority(theme: string) {
  const t = theme.toLowerCase()
  if (t.includes('weight')) return 1
  if (t.includes('reliability')) return 2
  if (t.includes('preparation')) return 3
  if (t.includes('pace deficit')) return 4
  if (t.includes('aerodynamically')) return 5
  if (t.includes('execution') || t.includes('strategy')) return 6
  if (t.includes('regulatory') || t.includes('penalty')) return 7
  return 9
}

function teamWeekendNarrative(row: TeamRaceReportRow) {
  const fpBest = num(row.fp_best_rank)
  const fpSessions = num(row.fp_sessions) ?? 0
  const qualiBest = num(row.quali_best_pos)
  const qualiAvg = num(row.quali_avg_pos)
  const sprintBest = num(row.sprint_best_pos)
  const sprintPts = num(row.sprint_points)
  const raceBest = num(row.race_best_pos)
  const racePts = num(row.race_points)
  const raceGrid = num(row.race_avg_grid)
  const raceFinish = num(row.race_avg_finish)
  const statuses = String(row.race_statuses ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  const phases: string[] = []
  if (fpBest) {
    phases.push(`practice pace peaked at ${formatPos(fpBest)} across ${fpSessions || 1} FP session${fpSessions === 1 ? '' : 's'}`)
  }
  if (qualiBest) {
    phases.push(`qualifying topped out at ${formatPos(qualiBest)} with a ${formatPos(qualiAvg)} team average`)
  }
  if (sprintBest) {
    phases.push(`sprint best was ${formatPos(sprintBest)} for ${Math.round(sprintPts ?? 0)} pts`)
  }
  if (raceBest) {
    phases.push(`race best was ${formatPos(raceBest)} for ${Math.round(racePts ?? 0)} pts`)
  }

  const wentWrong: string[] = []
  if (fpBest && qualiBest && qualiBest - fpBest >= 6) {
    wentWrong.push(`FP speed did not convert to qualifying: best session rank ${formatPos(fpBest)} became ${formatPos(qualiBest)} on the grid.`)
  }
  if (qualiAvg && qualiAvg > 12) {
    wentWrong.push(`Both cars started too deep on average (${formatPos(qualiAvg)}), leaving the weekend dependent on recovery drives.`)
  }
  if (sprintBest && sprintBest > 8) {
    wentWrong.push(`The sprint missed points, with the best car only ${formatPos(sprintBest)}.`)
  }
  if (raceBest && racePts !== null && racePts <= 0) {
    wentWrong.push(`Sunday produced no points despite a classified best finish of ${formatPos(raceBest)}.`)
  }
  if (raceGrid && raceFinish && raceFinish - raceGrid >= 3) {
    wentWrong.push(`Race execution slipped backwards: average finish ${formatPos(raceFinish)} from an average grid of ${formatPos(raceGrid)}.`)
  }
  const troubleStatuses = statuses.filter((s) => !/^(finished|\+\d+ laps?)$/i.test(s))
  if (troubleStatuses.length) {
    wentWrong.push(`Result statuses flagged trouble: ${[...new Set(troubleStatuses)].join(', ')}.`)
  }
  if (!wentWrong.length) {
    if ((racePts ?? 0) >= 20) wentWrong.push('Very little went wrong in the headline result; this was mainly execution and points conversion.')
    else wentWrong.push('No single failure signal stands out; the loss was mostly cumulative pace and position ceiling.')
  }

  const fallback = 'the available session data does not yet show a clear competitive pattern'
  return {
    summary: `${row.gp_name.replace(' Grand Prix', ' GP')}: ${phases.length ? phases.join('; ') : fallback}.`,
    wentWrong,
  }
}

function mapTeamRaceReports(rows: TeamRaceReportRow[], stories: NewsletterStory[], issueRows: TeamIssueRow[]): TeamRaceReport[] {
  const grouped = new Map<string, TeamRaceReport>()
  for (const row of rows) {
    const team = row.team || 'Unknown'
    if (!grouped.has(team)) grouped.set(team, { team, overview: '', keyIssues: [], storyThemes: [], totalPoints: 0, rounds: [] })
    const narrative = teamWeekendNarrative(row)
    grouped.get(team)!.rounds.push({
      round: Number(row.round) || 0,
      gpName: row.gp_name,
      circuit: row.circuit,
      eventDate: row.event_date,
      fp: row.fp_summary,
      qualifying: row.quali_summary,
      sprint: row.sprint_summary,
      race: row.race_summary,
      summary: narrative.summary,
      wentWrong: narrative.wentWrong,
    })
  }
  return [...grouped.values()]
    .map((report) => ({
      ...report,
      storyThemes: teamStoryThemes(report.team, stories, issueRows),
      overview: teamOverview(report, stories, issueRows),
      keyIssues: teamKeyIssues(report, stories, issueRows),
      totalPoints: teamTotalPoints(report),
      rounds: report.rounds.sort((a, b) => b.round - a.round),
    }))
    .sort((a, b) => a.totalPoints - b.totalPoints || a.team.localeCompare(b.team))
}

function extractBestPosition(text?: string | null) {
  const match = String(text ?? '').match(/best P(\d+)/i)
  return match ? Number(match[1]) : null
}

function extractPoints(text?: string | null) {
  const match = String(text ?? '').match(/,\s*([\d.]+)\s*pts/i)
  return match ? Number(match[1]) : null
}

function teamOverview(report: TeamRaceReport, stories: NewsletterStory[], issueRows: TeamIssueRow[]) {
  const rounds = report.rounds
  const racePoints = rounds.map((r) => extractPoints(r.race)).filter((v): v is number => v !== null)
  const sprintPoints = rounds.map((r) => extractPoints(r.sprint)).filter((v): v is number => v !== null)
  const qualiPositions = rounds.map((r) => extractBestPosition(r.qualifying)).filter((v): v is number => v !== null)
  const racePositions = rounds.map((r) => extractBestPosition(r.race)).filter((v): v is number => v !== null)
  const totalRacePoints = racePoints.reduce((sum, value) => sum + value, 0)
  const totalSprintPoints = sprintPoints.reduce((sum, value) => sum + value, 0)
  const bestQuali = qualiPositions.length ? Math.min(...qualiPositions) : null
  const bestRace = racePositions.length ? Math.min(...racePositions) : null
  const score = totalRacePoints + totalSprintPoints

  let tone = 'has had an uneven opening phase'
  if (score >= 80 || bestRace === 1) tone = 'has started 2026 as one of the benchmark teams'
  else if (score >= 35 || (bestRace !== null && bestRace <= 3)) tone = 'has been a regular front-end factor'
  else if (score >= 10 || (bestRace !== null && bestRace <= 8)) tone = 'has lived in the midfield fight'
  else if (score <= 2) tone = 'has endured a difficult and low-yield start'

  const parts = [`${report.team} ${tone}`]
  if (bestQuali) parts.push(`best qualifying result ${formatPos(bestQuali)}`)
  if (bestRace) parts.push(`best race result ${formatPos(bestRace)}`)
  if (racePoints.length || sprintPoints.length) parts.push(`${Math.round(score)} combined race/sprint points in the sampled rounds`)
  const themes = teamStoryThemes(report.team, stories, issueRows)
  const narrative = themes.length ? ` ${themes[0]}` : ''
  return `${parts.join(', ')}.${narrative}`
}

function teamTotalPoints(report: TeamRaceReport) {
  return report.rounds.reduce((sum, round) => (
    sum + (extractPoints(round.race) ?? 0) + (extractPoints(round.sprint) ?? 0)
  ), 0)
}

function teamKeyIssues(report: TeamRaceReport, stories: NewsletterStory[], issueRows: TeamIssueRow[]) {
  const issues = [...teamStoryThemes(report.team, stories, issueRows), ...report.rounds.flatMap((round) => round.wentWrong)]
  const seen = new Set<string>()
  return issues.filter((issue) => {
    const key = issue.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, 3)
}

function dedupe(rows: StoryRow[]) {
  const seenKeys = new Set<string>()
  const seenStories: NewsletterStory[] = []
  return rows
    .map(mapStory)
    .filter((story) => {
      const keys = storyDedupeKeys(story)
      if (!keys.size || [...keys].some((key) => seenKeys.has(key))) return false
      if (seenStories.some((seen) => isNearDuplicateTitle(story.title, seen.title))) return false
      for (const key of keys) seenKeys.add(key)
      seenStories.push(story)
      return true
    })
    .sort((a, b) => b.majorScore - a.majorScore || Date.parse(b.time) - Date.parse(a.time))
}

function pickUnique(stories: NewsletterStory[], count: number, used: Set<string>) {
  const picked: NewsletterStory[] = []
  for (const story of stories) {
    const keys = storyDedupeKeys(story)
    if (!keys.size || [...keys].some((key) => used.has(key))) continue
    if ([...used].some((usedKey) => usedKey.startsWith('raw-title:') && isNearDuplicateTitle(story.title, usedKey.slice(10)))) continue
    for (const key of keys) used.add(key)
    used.add(`raw-title:${story.title}`)
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
    const [rows, qualiRows, practiceRows, teamRaceRows, teamIssueRows, standings] = await Promise.all([
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
      sql`
        WITH selected_rounds AS (
          SELECT season, round, MAX(gp_name) AS gp_name, MAX(circuit) AS circuit, MAX(date) AS event_date
          FROM sessions
          WHERE season = 2026
            AND date <= CURRENT_DATE + INTERVAL '2 days'
          GROUP BY season, round
          ORDER BY round DESC
          LIMIT 3
        ),
        team_pool AS (
          SELECT DISTINCT team
          FROM predictions
          WHERE season = 2026 AND team IS NOT NULL
          UNION
          SELECT DISTINCT r.team
          FROM results r
          JOIN sessions s ON s.id = r.session_id
          WHERE s.season = 2026 AND r.team IS NOT NULL
        ),
        latest_team AS (
          SELECT DISTINCT ON (r.driver_code) r.driver_code, r.team
          FROM results r
          JOIN sessions s ON s.id = r.session_id
          WHERE r.team IS NOT NULL
          ORDER BY r.driver_code, s.season DESC, s.round DESC
        ),
        practice_ranked AS (
          SELECT s.season, s.round, COALESCE(lt.team, 'Unknown') AS team,
                 pl.fp_session, pl.driver_code, pl.best_lap_ms,
                 RANK() OVER (
                   PARTITION BY s.season, s.round, pl.fp_session
                   ORDER BY pl.best_lap_ms ASC NULLS LAST
                 ) AS session_rank
          FROM practice_laps pl
          JOIN sessions s ON s.id = pl.session_id
          LEFT JOIN latest_team lt ON lt.driver_code = pl.driver_code
          JOIN selected_rounds sr ON sr.season = s.season AND sr.round = s.round
          WHERE pl.best_lap_ms IS NOT NULL
        ),
        practice_best AS (
          SELECT DISTINCT ON (season, round, team, fp_session)
                 season, round, team, fp_session, driver_code, session_rank
          FROM practice_ranked
          ORDER BY season, round, team, fp_session, session_rank ASC
        ),
        practice_agg AS (
          SELECT season, round, team,
                 STRING_AGG(
                   fp_session || ' P' || session_rank || ' ' || driver_code,
                   ', '
                   ORDER BY CASE fp_session WHEN 'FP1' THEN 1 WHEN 'FP2' THEN 2 WHEN 'FP3' THEN 3 ELSE 4 END
                 ) AS fp_summary,
                 MIN(session_rank) AS fp_best_rank,
                 COUNT(DISTINCT fp_session) AS fp_sessions
          FROM practice_best
          GROUP BY season, round, team
        ),
        quali_ranked AS (
          SELECT s.season, s.round, COALESCE(lt.team, 'Unknown') AS team,
                 q.driver_code, q.grid_position, q.best_ms
          FROM qualifying_laps q
          JOIN sessions s ON s.id = q.session_id
          LEFT JOIN latest_team lt ON lt.driver_code = q.driver_code
          JOIN selected_rounds sr ON sr.season = s.season AND sr.round = s.round
          WHERE q.grid_position IS NOT NULL
        ),
        quali_agg AS (
          SELECT DISTINCT ON (season, round, team)
                 season, round, team,
                 'best P' || grid_position || ' ' || driver_code ||
                   ', avg P' || ROUND(AVG(grid_position) OVER (PARTITION BY season, round, team)::numeric, 1) AS quali_summary,
                 grid_position AS quali_best_pos,
                 ROUND(AVG(grid_position) OVER (PARTITION BY season, round, team)::numeric, 1) AS quali_avg_pos
          FROM quali_ranked
          ORDER BY season, round, team, grid_position ASC, best_ms ASC NULLS LAST
        ),
        result_ranked AS (
          SELECT s.season, s.round, s.session_type, r.team, r.driver_code,
                 r.grid_position, r.finish_position, r.points, r.status
          FROM results r
          JOIN sessions s ON s.id = r.session_id
          JOIN selected_rounds sr ON sr.season = s.season AND sr.round = s.round
          WHERE s.session_type IN ('S', 'R')
            AND r.finish_position IS NOT NULL
        ),
        result_agg AS (
          SELECT DISTINCT ON (season, round, team, session_type)
                 season, round, team, session_type,
                 CASE
                   WHEN session_type = 'S' THEN
                     'best P' || finish_position || ' ' || driver_code ||
                     ', ' || ROUND(SUM(points) OVER (PARTITION BY season, round, team, session_type)::numeric, 1) || ' pts'
                   ELSE
                     'best P' || finish_position || ' ' || driver_code ||
                     ', ' || ROUND(SUM(points) OVER (PARTITION BY season, round, team, session_type)::numeric, 1) || ' pts'
                 END AS result_summary,
                 finish_position AS best_pos,
                 ROUND(SUM(points) OVER (PARTITION BY season, round, team, session_type)::numeric, 1) AS total_points,
                 ROUND(AVG(grid_position) OVER (PARTITION BY season, round, team, session_type)::numeric, 1) AS avg_grid,
                 ROUND(AVG(finish_position) OVER (PARTITION BY season, round, team, session_type)::numeric, 1) AS avg_finish,
                 STRING_AGG(COALESCE(status, 'Unknown'), ', ') OVER (PARTITION BY season, round, team, session_type) AS statuses
          FROM result_ranked
          ORDER BY season, round, team, session_type, finish_position ASC
        )
        SELECT tp.team, sr.round, sr.gp_name, sr.circuit, sr.event_date,
               pa.fp_summary,
               pa.fp_best_rank,
               pa.fp_sessions,
               qa.quali_summary,
               qa.quali_best_pos,
               qa.quali_avg_pos,
               sa.result_summary AS sprint_summary,
               sa.best_pos AS sprint_best_pos,
               sa.total_points AS sprint_points,
               ra.result_summary AS race_summary,
               ra.best_pos AS race_best_pos,
               ra.total_points AS race_points,
               ra.avg_grid AS race_avg_grid,
               ra.avg_finish AS race_avg_finish,
               ra.statuses AS race_statuses
        FROM team_pool tp
        CROSS JOIN selected_rounds sr
        LEFT JOIN practice_agg pa ON pa.season = sr.season AND pa.round = sr.round AND pa.team = tp.team
        LEFT JOIN quali_agg qa ON qa.season = sr.season AND qa.round = sr.round AND qa.team = tp.team
        LEFT JOIN result_agg sa ON sa.season = sr.season AND sa.round = sr.round AND sa.team = tp.team AND sa.session_type = 'S'
        LEFT JOIN result_agg ra ON ra.season = sr.season AND ra.round = sr.round AND ra.team = tp.team AND ra.session_type = 'R'
        WHERE pa.fp_summary IS NOT NULL
           OR qa.quali_summary IS NOT NULL
           OR sa.result_summary IS NOT NULL
           OR ra.result_summary IS NOT NULL
        ORDER BY tp.team ASC, sr.round DESC
      `,
      sql`
        SELECT title, summary, body_text, text_all, source, event_ts
        FROM event_f1_only
        WHERE event_ts >= NOW() - (${days} || ' days')::interval
          AND is_f1_relevant = TRUE
          AND (
            LOWER(COALESCE(text_all, '') || ' ' || COALESCE(title, '') || ' ' || COALESCE(summary, '') || ' ' || COALESCE(body_text, ''))
              ~ '(williams|albon|sainz|mercedes|antonelli|russell|ferrari|leclerc|hamilton|mclaren|norris|piastri|red bull|verstappen|hadjar|racing bulls|lawson|lindblad|aston martin|alonso|stroll|alpine|gasly|colapinto|audi|sauber|hulkenberg|bortoleto|haas|bearman|ocon|cadillac|perez|bottas)'
          )
          AND (
            LOWER(COALESCE(text_all, '') || ' ' || COALESCE(title, '') || ' ' || COALESCE(summary, '') || ' ' || COALESCE(body_text, ''))
              ~ '(overweight|weight|hydraulic|reliability|failure|issue|problem|retired|dnf|shakedown|preparation|delay|testing|barcelona|back foot|front wing|wing change|floor|aero|upgrade|package|development|strategy|pit stop|tyre|tire|penalty|penalised|penalized|stewards|track limits|weather|rain|slow start|poor start|lack pace|raw pace|far off|struggling|painful|passenger|disqualified)'
          )
        ORDER BY event_ts DESC, priority_score DESC NULLS LAST
        LIMIT 500
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
    const teamRaceReports = mapTeamRaceReports(
      teamRaceRows as unknown as TeamRaceReportRow[],
      stories,
      teamIssueRows as unknown as TeamIssueRow[]
    )

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
      teamRaceReports,
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
