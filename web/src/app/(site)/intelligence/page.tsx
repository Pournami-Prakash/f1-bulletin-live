'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import Header from '@/components/Header'
import Ticker from '@/components/Ticker'
import Footer from '@/components/Footer'
import BgCanvas from '@/components/BgCanvas'
import {
  type TimeseriesPoint,
  type SentimentProfile,
  type ControversyProfile,
  type TrendSignal,
  type Anomaly,
  type PredictiveSignal,
  type EntityCorrelation,
  type StoryArc,
  type ComparisonResult,
  type ComparisonDimension,
  type StoryBeat,
  computeSentimentProfile,
  computeControversyProfile,
  computeTrendSignal,
  detectAnomalies,
  computePredictiveSignal,
  computeCorrelationMatrix,
  computeStoryArc,
  compareEntities,
} from '@/app/(api)/api/drivers/analytics/route'

// ── Types ─────────────────────────────────────────────────────────────────────

type MainTab = 'stories' | 'drivers' | 'teams'
type WindowMode = 'race' | '14' | '30'
type IntelTab = 'driver' | 'team'

type Story = {
  story_id?: string | number
  story_title?: string
  latest_source?: string
  latest_url?: string
  latest_event_ts?: string
  topic_cluster?: string
  best_priority_tier?: string
  is_breaking?: boolean
  momentum_score?: number
  events_count?: number
  sources_count?: number
  driver?: string | null
  heat_index?: number
}

type SummaryEntity = {
  driverName: string
  mentions: number
  sentimentAvg: number
  sentimentDelta: number
  sentimentLabel: string
  positiveCount?: number
  negativeCount?: number
  neutralCount?: number
  topCluster?: string | null
  lastDate?: string | null
}

type ControversyRaw = {
  entityName: string
  score: number
  label?: string
  trend?: string
  delta?: number
  components?: { sentiment?: number; fia?: number; spike?: number; media?: number }
}

type EnrichedEntity = SummaryEntity & {
  controversyScore: number
  influenceScore: number
  narrativeGroup: string
  pulse: 'RISING' | 'FALLING' | 'CONTROVERSIAL' | 'MOST DISCUSSED' | 'STABLE'
}

// ── Colors & constants ────────────────────────────────────────────────────────

const EC: Record<string, string> = {
  VERSTAPPEN: '#3671C6', PEREZ: '#3671C6', HAMILTON: '#DC0000', LECLERC: '#DC0000',
  SAINZ: '#DC0000', NORRIS: '#FF8000', PIASTRI: '#FF8000', RUSSELL: '#27F4D2',
  BOTTAS: '#27F4D2', ALONSO: '#358C75', STROLL: '#358C75', GASLY: '#BFD7E0',
  OCON: '#BFD7E0', ALBON: '#64C4FF', HULKENBERG: '#B6BABD', MAGNUSSEN: '#B6BABD',
  TSUNODA: '#6692FF', LAWSON: '#6692FF', ZHOU: '#52E252', BEARMAN: '#52E252',
  ANTONELLI: '#27F4D2', COLAPINTO: '#64C4FF',
  'RED BULL': '#3671C6', FERRARI: '#DC0000', MERCEDES: '#27F4D2', MCLAREN: '#FF8000',
  'ASTON MARTIN': '#358C75', ALPINE: '#BFD7E0', WILLIAMS: '#64C4FF',
  HAAS: '#B6BABD', SAUBER: '#52E252', 'RACING BULLS': '#6692FF',
}
const col = (n: string) => EC[n?.toUpperCase?.()] || '#8b93a7'

const PHASE_C: Record<string, string> = {
  ignition: '#f59e0b', amplification: '#ef4444', peak: '#dc2626',
  resolution: '#60a5fa', dormant: '#6b7280', resurgence: '#a855f7',
}
const SIG_C: Record<string, { c: string; label: string }> = {
  pre_breakout:    { c: '#22c55e', label: 'PRE-BREAKOUT' },
  sentiment_shift: { c: '#f59e0b', label: 'SENTIMENT SHIFT' },
  cooling:         { c: '#60a5fa', label: 'COOLING' },
  recovery:        { c: '#10b981', label: 'RECOVERY' },
  watch:           { c: '#a855f7', label: 'WATCH' },
  stable:          { c: '#6b7280', label: 'STABLE' },
}
const TIER_C: Record<string, string> = {
  low: '#6b7280', moderate: '#60a5fa', high: '#f59e0b', critical: '#ef4444',
}
const TRAJ_C: Record<string, string> = {
  escalating: '#ef4444', 'de-escalating': '#22c55e',
  sustained: '#f59e0b', new: '#a855f7', resolved: '#6b7280',
}
const SENT_ARC_C: Record<string, string> = {
  improving: '#22c55e', worsening: '#ef4444', volatile: '#f59e0b', flat: '#6b7280',
}

// ── Calendar ──────────────────────────────────────────────────────────────────

type Race = { round: number; name: string; shortName: string; city: string; country: string; flag: string; fp1: string; race: string; sprint: boolean }

const CALENDAR_2026: Race[] = [
  { round: 1,  name: 'Australian Grand Prix',   shortName: 'Australia',    city: 'Melbourne',   country: 'Australia',    flag: '🇦🇺', fp1: '2026-03-06', race: '2026-03-08', sprint: false },
  { round: 2,  name: 'Chinese Grand Prix',       shortName: 'China',        city: 'Shanghai',    country: 'China',        flag: '🇨🇳', fp1: '2026-03-13', race: '2026-03-15', sprint: true  },
  { round: 3,  name: 'Japanese Grand Prix',      shortName: 'Japan',        city: 'Suzuka',      country: 'Japan',        flag: '🇯🇵', fp1: '2026-03-27', race: '2026-03-29', sprint: false },
  { round: 4,  name: 'Bahrain Grand Prix',       shortName: 'Bahrain',      city: 'Sakhir',      country: 'Bahrain',      flag: '🇧🇭', fp1: '2026-04-10', race: '2026-04-12', sprint: false },
  { round: 5,  name: 'Saudi Arabian Grand Prix', shortName: 'Saudi Arabia', city: 'Jeddah',      country: 'Saudi Arabia', flag: '🇸🇦', fp1: '2026-04-17', race: '2026-04-19', sprint: false },
  { round: 6,  name: 'Miami Grand Prix',         shortName: 'Miami',        city: 'Miami',       country: 'USA',          flag: '🇺🇸', fp1: '2026-05-01', race: '2026-05-03', sprint: true  },
  { round: 7,  name: 'Canadian Grand Prix',      shortName: 'Canada',       city: 'Montreal',    country: 'Canada',       flag: '🇨🇦', fp1: '2026-05-22', race: '2026-05-24', sprint: true  },
  { round: 8,  name: 'Monaco Grand Prix',        shortName: 'Monaco',       city: 'Monte Carlo', country: 'Monaco',       flag: '🇲🇨', fp1: '2026-06-05', race: '2026-06-07', sprint: false },
  { round: 9,  name: 'Spanish Grand Prix',       shortName: 'Spain',        city: 'Barcelona',   country: 'Spain',        flag: '🇪🇸', fp1: '2026-06-12', race: '2026-06-14', sprint: false },
  { round: 10, name: 'Austrian Grand Prix',      shortName: 'Austria',      city: 'Spielberg',   country: 'Austria',      flag: '🇦🇹', fp1: '2026-06-26', race: '2026-06-28', sprint: false },
  { round: 11, name: 'British Grand Prix',       shortName: 'Great Britain',city: 'Silverstone', country: 'UK',           flag: '🇬🇧', fp1: '2026-07-03', race: '2026-07-05', sprint: true  },
  { round: 12, name: 'Belgian Grand Prix',       shortName: 'Belgium',      city: 'Spa',         country: 'Belgium',      flag: '🇧🇪', fp1: '2026-07-17', race: '2026-07-19', sprint: false },
  { round: 13, name: 'Hungarian Grand Prix',     shortName: 'Hungary',      city: 'Budapest',    country: 'Hungary',      flag: '🇭🇺', fp1: '2026-07-24', race: '2026-07-26', sprint: false },
  { round: 14, name: 'Dutch Grand Prix',         shortName: 'Netherlands',  city: 'Zandvoort',   country: 'Netherlands',  flag: '🇳🇱', fp1: '2026-08-21', race: '2026-08-23', sprint: true  },
  { round: 15, name: 'Italian Grand Prix',       shortName: 'Italy',        city: 'Monza',       country: 'Italy',        flag: '🇮🇹', fp1: '2026-09-04', race: '2026-09-06', sprint: false },
  { round: 16, name: 'Madrid Grand Prix',        shortName: 'Madrid',       city: 'Madrid',      country: 'Spain',        flag: '🇪🇸', fp1: '2026-09-11', race: '2026-09-13', sprint: false },
  { round: 17, name: 'Azerbaijan Grand Prix',    shortName: 'Azerbaijan',   city: 'Baku',        country: 'Azerbaijan',   flag: '🇦🇿', fp1: '2026-09-24', race: '2026-09-26', sprint: false },
  { round: 18, name: 'Singapore Grand Prix',     shortName: 'Singapore',    city: 'Singapore',   country: 'Singapore',    flag: '🇸🇬', fp1: '2026-10-09', race: '2026-10-11', sprint: true  },
  { round: 19, name: 'United States Grand Prix', shortName: 'USA',          city: 'Austin',      country: 'USA',          flag: '🇺🇸', fp1: '2026-10-23', race: '2026-10-25', sprint: false },
  { round: 20, name: 'Mexico City Grand Prix',   shortName: 'Mexico',       city: 'Mexico City', country: 'Mexico',       flag: '🇲🇽', fp1: '2026-10-30', race: '2026-11-01', sprint: false },
  { round: 21, name: 'São Paulo Grand Prix',     shortName: 'Brazil',       city: 'São Paulo',   country: 'Brazil',       flag: '🇧🇷', fp1: '2026-11-06', race: '2026-11-08', sprint: false },
  { round: 22, name: 'Las Vegas Grand Prix',     shortName: 'Las Vegas',    city: 'Las Vegas',   country: 'USA',          flag: '🇺🇸', fp1: '2026-11-19', race: '2026-11-21', sprint: false },
  { round: 23, name: 'Qatar Grand Prix',         shortName: 'Qatar',        city: 'Lusail',      country: 'Qatar',        flag: '🇶🇦', fp1: '2026-11-27', race: '2026-11-29', sprint: false },
  { round: 24, name: 'Abu Dhabi Grand Prix',     shortName: 'Abu Dhabi',    city: 'Abu Dhabi',   country: 'UAE',          flag: '🇦🇪', fp1: '2026-12-04', race: '2026-12-06', sprint: false },
]

function getCurrentRace() {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  for (const r of CALENDAR_2026) {
    const fp1 = new Date(r.fp1); fp1.setHours(0, 0, 0, 0)
    const rd  = new Date(r.race); rd.setHours(23, 59, 59, 0)
    if (today >= fp1 && today <= rd) return { race: r, live: true, daysUntil: 0 }
  }
  for (const r of CALENDAR_2026) {
    const fp1 = new Date(r.fp1); fp1.setHours(0, 0, 0, 0)
    if (fp1 > today) {
      const diff = Math.ceil((fp1.getTime() - today.getTime()) / 86400000)
      return { race: r, live: false, daysUntil: diff }
    }
  }
  return null
}

function raceWindowDays(race: Race) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const fp1 = new Date(race.fp1); fp1.setHours(0, 0, 0, 0)
  return Math.max(Math.ceil((today.getTime() - fp1.getTime()) / 86400000) + 1, 4)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const sign = (v?: number) => { const n = +(v ?? 0); return `${n >= 0 ? '+' : ''}${n.toFixed(3)}` }

function hr(hex: string, a: number) {
  if (!hex.startsWith('#')) return `rgba(255,255,255,${a})`
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  const n = parseInt(h, 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

function fmtDate(d: string) {
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function timeAgo(value: string) {
  const d = new Date(value)
  if (isNaN(d.getTime())) return value
  const m = Math.floor((Date.now() - d.getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function safeNum(v: unknown, fb = 0) { const n = Number(v); return Number.isFinite(n) ? n : fb }

function nscore(vals: number[], v: number) {
  const mn = Math.min(...vals, 0), mx = Math.max(...vals, 1)
  return mx === mn ? 50 : ((v - mn) / (mx - mn)) * 100
}

function classifyNarrative(c?: string | null) {
  const s = (c || '').toLowerCase()
  if (s.includes('driver')) return 'DRIVER'
  if (s.includes('team')) return 'TEAM'
  if (s.includes('fia') || s.includes('regulation')) return 'REGULATION'
  if (s.includes('technical') || s.includes('engine')) return 'TECH'
  if (s.includes('race') || s.includes('pace')) return 'PACE'
  return 'GENERAL'
}

function inferNarrative(title: string) {
  const t = title.toLowerCase()
  if (t.includes('pole') || t.includes('qualifying')) return 'Qualifying'
  if (t.includes('win') || t.includes('victory') || t.includes('podium')) return 'Race Result'
  if (t.includes('championship') || t.includes('title') || t.includes('rival')) return 'Championship'
  if (t.includes('upgrade') || t.includes('car') || t.includes('engine') || t.includes('technical')) return 'Technical'
  if (t.includes('contract') || t.includes('team') || t.includes('seat')) return 'Team News'
  return 'Coverage'
}

function getSourceType(source?: string) {
  const s = String(source ?? '').toLowerCase()
  if (s.includes('reddit')) return 'reddit'
  if (s.includes('fia') || s.includes('official') || s.includes('formula1.com')) return 'official'
  return 'news'
}

function dedupeStories(stories: Story[]): Story[] {
  const seen = new Set<string>()
  return stories.filter(s => {
    const key = (s.story_title ?? '').toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// Cluster stories by narrative
type StoryCluster = {
  label: string
  stories: Story[]
  avgMomentum: number
  drivers: string[]   // driver names mentioned across stories
  srcCounts: Record<string, number>
}

function buildStoryClusters(stories: Story[], driverNames: string[]): StoryCluster[] {
  const map = new Map<string, Story[]>()
  for (const s of stories) {
    const label = inferNarrative(s.story_title ?? '')
    if (!map.has(label)) map.set(label, [])
    map.get(label)!.push(s)
  }

  return Array.from(map.entries()).map(([label, clStories]) => {
    const sorted = [...clStories].sort((a, b) => safeNum(b.momentum_score) - safeNum(a.momentum_score))
    const avgMomentum = Math.round(clStories.reduce((s, st) => s + safeNum(st.momentum_score), 0) / clStories.length)

    // Find driver mentions in story titles
    const mentionedDrivers = driverNames.filter(name =>
      clStories.some(s => s.story_title?.toUpperCase().includes(name.toUpperCase()))
    ).slice(0, 4)

    const srcCounts: Record<string, number> = {}
    for (const s of clStories) {
      const t = getSourceType(s.latest_source)
      srcCounts[t] = (srcCounts[t] ?? 0) + 1
    }

    return { label, stories: sorted, avgMomentum, drivers: mentionedDrivers, srcCounts }
  }).sort((a, b) => {
    if (b.stories.length !== a.stories.length) return b.stories.length - a.stories.length
    return b.avgMomentum - a.avgMomentum
  })
}

// Normalise entity data
function normSummary(r: any): SummaryEntity {
  return {
    driverName: r?.driverName ?? r?.driver_name ?? r?.entityName ?? r?.entity_name ?? 'UNKNOWN',
    mentions: safeNum(r?.mentions ?? r?.mentionCount ?? r?.mention_count ?? 0),
    sentimentAvg: safeNum(r?.sentimentAvg ?? r?.sentiment_avg ?? 0),
    sentimentDelta: safeNum(r?.sentimentDelta ?? r?.sentiment_delta ?? r?.sentimentTrend ?? 0),
    sentimentLabel: r?.sentimentLabel ?? r?.sentiment_label ?? 'neutral',
    positiveCount: safeNum(r?.positiveCount ?? r?.positive_count ?? 0),
    negativeCount: safeNum(r?.negativeCount ?? r?.negative_count ?? 0),
    neutralCount:  safeNum(r?.neutralCount  ?? r?.neutral_count  ?? 0),
    topCluster: r?.topCluster ?? r?.top_cluster ?? null,
    lastDate:   r?.lastDate   ?? r?.last_mentioned ?? r?.date ?? null,
  }
}

function normTs(r: any): TimeseriesPoint {
  return {
    date:          r?.date ?? r?.signal_date ?? '',
    mentions:      safeNum(r?.mention_count ?? r?.mentions),
    sentimentAvg:  safeNum(r?.sentiment_avg ?? r?.sentimentAvg),
    positiveCount: safeNum(r?.positive_count ?? r?.positiveCount),
    negativeCount: safeNum(r?.negative_count ?? r?.negativeCount),
    neutralCount:  safeNum(r?.neutral_count  ?? r?.neutralCount),
  }
}

function normCon(r: any): ControversyRaw {
  return {
    entityName: r?.entityName ?? r?.entity_name ?? r?.name ?? 'UNKNOWN',
    score:  safeNum(r?.score ?? r?.controversyScore ?? 0),
    label:  r?.label  ?? r?.controversyLabel,
    trend:  r?.trend  ?? r?.trendingDirection,
    delta:  safeNum(r?.delta ?? r?.scoreDelta),
    components: {
      sentiment: safeNum(r?.components?.sentiment ?? r?.sentimentScore),
      fia:       safeNum(r?.components?.fia       ?? r?.fiaScore),
      spike:     safeNum(r?.components?.spike     ?? r?.spikeScore),
      media:     safeNum(r?.components?.media     ?? r?.mediaScore),
    },
  }
}

function sparkPts(data: TimeseriesPoint[], key: 'sentimentAvg' | 'mentions', W: number, H: number): string {
  if (data.length < 2) return ''
  const vals = data.map(d => d[key])
  const mn = Math.min(...vals), mx = Math.max(...vals), range = Math.max(mx - mn, 0.001)
  return data.map((d, i) => {
    const x = (i / (data.length - 1)) * W
    const y = H - ((d[key] - mn) / range) * (H * 0.85) - H * 0.075
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useEntityTs(tab: IntelTab, name: string | null, days = 30) {
  const [data, setData] = useState<TimeseriesPoint[]>([])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!name) { setData([]); return }
    let mounted = true; setLoading(true)
    fetch(`/api/intelligence/drivers?format=timeseries&type=${tab}&driver=${encodeURIComponent(name)}&days=${days}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (mounted) setData(d?.ok ? (d.data ?? []).map(normTs) : []) })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [tab, name, days])
  return { data, loading }
}

function useBatchTs(tab: IntelTab, entities: EnrichedEntity[], days = 30) {
  const [map, setMap] = useState<Record<string, TimeseriesPoint[]>>({})
  const keyRef = useRef('')
  useEffect(() => {
    if (!entities.length) return
    const key = `${tab}:${entities.map(e => e.driverName).join(',')}:${days}`
    if (key === keyRef.current) return
    keyRef.current = key
    let mounted = true
    Promise.all(
      entities.map(e =>
        fetch(`/api/intelligence/drivers?format=timeseries&type=${tab}&driver=${encodeURIComponent(e.driverName)}&days=${days}`)
          .then(r => r.ok ? r.json() : null)
          .then(d => [e.driverName, d?.ok ? (d.data ?? []).map(normTs) : []] as const)
      )
    ).then(results => { if (mounted) setMap(Object.fromEntries(results)) })
    return () => { mounted = false }
  }, [tab, entities, days])
  return map
}

// ── Story components ──────────────────────────────────────────────────────────

function FeaturedStory({ story, color }: { story: Story; color: string }) {
  const href    = story.latest_url ?? null
  const srcType = getSourceType(story.latest_source)
  const srcColor = srcType === 'reddit' ? '#FF6314' : srcType === 'official' ? '#27F4D2' : 'var(--blue)'
  const narrative = inferNarrative(story.story_title ?? '')
  const momentum  = Math.min(100, safeNum(story.momentum_score))
  const time = story.latest_event_ts ? timeAgo(story.latest_event_ts) : '—'

  const inner = (
    <div style={{
      border: `1px solid ${color}40`, borderRadius: 18,
      background: `linear-gradient(135deg, ${color}10, rgba(0,0,0,.4))`,
      padding: '24px 28px', position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(500px 200px at 0% 0%, ${color}12, transparent 60%)`,
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        height: 2, background: `linear-gradient(90deg, ${color}, transparent)`,
      }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{
          padding: '3px 9px', borderRadius: 5,
          border: '1px solid var(--b1)',
          fontSize: 8, color: 'var(--t3)',
          fontFamily: 'var(--font-mono)', letterSpacing: '.12em',
        }}>LEAD STORY</span>
        <span style={{
          padding: '3px 9px', borderRadius: 5,
          background: `${color}15`, border: `1px solid ${color}30`,
          fontSize: 8, color, fontFamily: 'var(--font-mono)', letterSpacing: '.12em',
        }}>{narrative.toUpperCase()}</span>
        <span style={{
          padding: '3px 9px', borderRadius: 5,
          background: `${srcColor}10`, border: `1px solid ${srcColor}30`,
          fontSize: 8, color: srcColor, fontFamily: 'var(--font-mono)', letterSpacing: '.1em',
        }}>{srcType.toUpperCase()}</span>
        {story.is_breaking && (
          <span style={{
            padding: '3px 9px', borderRadius: 5,
            background: 'rgba(225,6,0,.1)', border: '1px solid rgba(225,6,0,.4)',
            fontSize: 8, color: 'var(--red)', fontFamily: 'var(--font-mono)',
          }}>BREAKING</span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--t3)' }}>{time}</span>
      </div>

      <div style={{
        fontSize: 20, lineHeight: 1.45, color: 'var(--t1)',
        marginBottom: 16, maxWidth: 800, position: 'relative', zIndex: 1,
      }}>
        {story.story_title}
        {href && <span style={{ marginLeft: 8, fontSize: 14, color, opacity: 0.6 }}>↗</span>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ fontSize: 10, color: 'var(--t3)' }}>{story.latest_source}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 8, color: 'var(--t3)', fontFamily: 'var(--font-mono)' }}>MOMENTUM</span>
          <div style={{ width: 60, height: 2, background: 'var(--b1)', borderRadius: 2 }}>
            <div style={{ height: '100%', width: `${momentum}%`, background: color, borderRadius: 2 }} />
          </div>
          <span style={{ fontSize: 8, color, fontFamily: 'var(--font-mono)' }}>{momentum}</span>
        </div>
      </div>
    </div>
  )

  if (!href) return inner
  return <a href={href} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>{inner}</a>
}

function StoryClusterPanel({
  cluster,
  driverSentiment,
  onDriverClick,
}: {
  cluster: StoryCluster
  driverSentiment: Record<string, SummaryEntity>
  onDriverClick: (name: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const lead = cluster.stories[0]
  const rest = cluster.stories.slice(1)
  const srcColor = (src: string) => src === 'reddit' ? '#FF6314' : src === 'official' ? '#27F4D2' : 'var(--blue)'

  return (
    <div style={{
      border: '1px solid var(--b1)', borderRadius: 16,
      background: 'rgba(0,0,0,.2)', overflow: 'hidden',
    }}>
      {/* Cluster header */}
      <div style={{
        padding: '13px 18px',
        borderBottom: '1px solid var(--b1)',
        background: 'rgba(255,255,255,.02)',
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ width: 3, height: 16, borderRadius: 2, background: 'var(--red)', flexShrink: 0 }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t1)', letterSpacing: '.12em' }}>
          {cluster.label.toUpperCase()}
        </span>
        <span style={{ fontSize: 9, color: 'var(--t3)', fontFamily: 'var(--font-mono)' }}>
          {cluster.stories.length} {cluster.stories.length === 1 ? 'story' : 'stories'}
        </span>

        {/* Source pills */}
        <div style={{ display: 'flex', gap: 4 }}>
          {Object.entries(cluster.srcCounts).map(([src, count]) => (
            <span key={src} style={{
              padding: '1px 6px', borderRadius: 3, fontSize: 7,
              color: srcColor(src), background: `${srcColor(src)}12`,
              border: `1px solid ${srcColor(src)}25`,
              fontFamily: 'var(--font-mono)',
            }}>{src} {count}</span>
          ))}
        </div>

        {/* Driver tags — linked to intelligence */}
        {cluster.drivers.length > 0 && (
          <div style={{ display: 'flex', gap: 5, marginLeft: 'auto', flexWrap: 'wrap' }}>
            {cluster.drivers.map(name => {
              const c = col(name)
              const sent = driverSentiment[name.toUpperCase()]
              return (
                <button
                  key={name}
                  onClick={() => onDriverClick(name)}
                  style={{
                    padding: '2px 8px', borderRadius: 4,
                    border: `1px solid ${c}40`,
                    background: `${c}12`,
                    color: c, fontSize: 8,
                    fontFamily: 'var(--font-mono)', letterSpacing: '.08em',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}
                >
                  {name}
                  {sent && (
                    <span style={{
                      color: safeNum(sent.sentimentDelta) > 0 ? '#22c55e'
                        : safeNum(sent.sentimentDelta) < 0 ? '#ef4444' : 'var(--t3)',
                    }}>
                      {safeNum(sent.sentimentDelta) > 0 ? '↑' : safeNum(sent.sentimentDelta) < 0 ? '↓' : '→'}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {/* Momentum */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
          <div style={{ width: 32, height: 2, background: 'var(--b1)', borderRadius: 2 }}>
            <div style={{ height: '100%', width: `${Math.min(100, cluster.avgMomentum)}%`, background: 'var(--red)', borderRadius: 2 }} />
          </div>
          <span style={{ fontSize: 8, color: 'var(--t3)', fontFamily: 'var(--font-mono)' }}>{cluster.avgMomentum}</span>
        </div>
      </div>

      {/* Lead story row */}
      {lead && <StoryRow story={lead} />}

      {/* Expandable rest */}
      {rest.length > 0 && (
        <>
          <AnimatePresence>
            {expanded && rest.map((s, i) => (
              <motion.div
                key={s.story_id ?? i}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18 }}
                style={{ overflow: 'hidden' }}
              >
                <StoryRow story={s} dim />
              </motion.div>
            ))}
          </AnimatePresence>
          <button
            onClick={() => setExpanded(e => !e)}
            style={{
              width: '100%', padding: '9px 18px',
              background: 'transparent', border: 'none',
              borderTop: '1px solid var(--b1)',
              color: 'var(--t3)', cursor: 'pointer',
              fontSize: 9, fontFamily: 'var(--font-mono)',
              letterSpacing: '.12em', textAlign: 'left',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <span style={{
              transform: expanded ? 'rotate(90deg)' : 'none',
              transition: 'transform .18s', display: 'inline-block',
            }}>›</span>
            {expanded ? 'SHOW LESS' : `${rest.length} MORE ${rest.length === 1 ? 'STORY' : 'STORIES'}`}
          </button>
        </>
      )}
    </div>
  )
}

function StoryRow({ story, dim }: { story: Story; dim?: boolean }) {
  const href     = story.latest_url ?? null
  const srcType  = getSourceType(story.latest_source)
  const srcColor = srcType === 'reddit' ? '#FF6314' : srcType === 'official' ? '#27F4D2' : 'var(--blue)'
  const time     = story.latest_event_ts ? timeAgo(story.latest_event_ts) : '—'
  const momentum = Math.min(100, safeNum(story.momentum_score))

  const inner = (
    <div style={{
      padding: '11px 18px',
      borderBottom: '1px solid rgba(255,255,255,.04)',
      display: 'grid', gridTemplateColumns: '1fr auto',
      gap: 12, alignItems: 'center',
      background: dim ? 'transparent' : 'rgba(255,255,255,.012)',
      opacity: dim ? 0.75 : 1,
      cursor: href ? 'pointer' : 'default',
    }}>
      <div>
        <div style={{
          fontSize: 12.5, color: 'var(--t1)', lineHeight: 1.45,
          marginBottom: 5,
          display: '-webkit-box', WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical', overflow: 'hidden',
        } as React.CSSProperties}>
          {story.story_title}
          {href && <span style={{ marginLeft: 5, fontSize: 10, color: 'var(--red)', opacity: 0.6 }}>↗</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 7, color: srcColor, background: `${srcColor}10`,
            padding: '1px 5px', borderRadius: 3,
            border: `1px solid ${srcColor}25`,
            fontFamily: 'var(--font-mono)',
          }}>{srcType.toUpperCase()}</span>
          <span style={{ fontSize: 9, color: 'var(--t3)' }}>{story.latest_source}</span>
          <span style={{ fontSize: 9, color: 'var(--t3)' }}>{time}</span>
          {story.is_breaking && (
            <span style={{
              fontSize: 7, color: 'var(--red)',
              background: 'rgba(225,6,0,.08)', padding: '1px 5px',
              borderRadius: 3, border: '1px solid rgba(225,6,0,.3)',
              fontFamily: 'var(--font-mono)',
            }}>BREAKING</span>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <div style={{ width: 28, height: 2, background: 'var(--b1)', borderRadius: 2 }}>
          <div style={{
            height: '100%', width: `${momentum}%`,
            background: story.is_breaking ? 'var(--red)' : 'rgba(255,255,255,.2)',
            borderRadius: 2,
          }} />
        </div>
        <span style={{ fontSize: 8, color: 'var(--t3)', fontFamily: 'var(--font-mono)', minWidth: 16 }}>{momentum}</span>
      </div>
    </div>
  )

  if (!href) return inner
  return <a href={href} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>{inner}</a>
}

// ── Paddock Intelligence sub-components (preserved from existing drivers page) ─

function SectionLabel({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 9, letterSpacing: '.16em', color: 'var(--t3)', marginBottom: 14, textTransform: 'uppercase' }}>{children}</div>
}

function KpiCard({ label, value, color, sub }: { label: string; value: string | number; color: string; sub?: string }) {
  return (
    <motion.div whileHover={{ y: -2 }} transition={{ duration: 0.18 }} style={{
      border: '1px solid rgba(255,255,255,.08)', borderRadius: 22, padding: '16px 18px',
      background: 'linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.014))',
      position: 'relative', overflow: 'hidden',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,.04), 0 14px 36px rgba(0,0,0,.18)',
    }}>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(circle at 100% 0%,${hr(color, .12)},transparent 42%)`, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', left: 18, top: 18, width: 24, height: 2, borderRadius: 999, background: color, opacity: .9 }} />
      <div style={{ fontSize: 9, letterSpacing: '.17em', color: 'var(--t3)', margin: '10px 0 8px' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-bebas)', fontSize: 34, lineHeight: 1, color: 'var(--t1)', marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: 'var(--t3)' }}>{sub}</div>}
    </motion.div>
  )
}

function Bdg({ c, children }: { c: string; children: ReactNode }) {
  return <span className="bdg" style={{ background: hr(c, .13), color: c, borderColor: hr(c, .28) }}>{children}</span>
}

function MomentumBars({ entities, loading }: { entities: EnrichedEntity[]; loading: boolean }) {
  const top = [...entities].sort((a, b) => (b.mentions ?? 0) - (a.mentions ?? 0)).slice(0, 10)
  const max = Math.max(...top.map(e => e.mentions ?? 0), 1)
  if (loading) return <div style={{ display: 'grid', gap: 9 }}>{Array(6).fill(null).map((_, i) => <div key={i} className="sk" style={{ height: 26 }} />)}</div>
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {top.map(e => {
        const c  = col(e.driverName)
        const pct = ((e.mentions ?? 0) / max) * 100
        const d  = e.sentimentDelta ?? 0
        const dc = d > 0.02 ? '#22c55e' : d < -0.02 ? '#ef4444' : 'var(--t3)'
        const sig = e.pulse !== 'STABLE'
          ? ({ RISING: { c: '#22c55e', t: '↑' }, FALLING: { c: '#ef4444', t: '↓' }, CONTROVERSIAL: { c: '#f59e0b', t: '⚡' }, 'MOST DISCUSSED': { c: '#60a5fa', t: '◉' } } as any)[e.pulse]
          : null
        return (
          <div key={e.driverName} style={{ display: 'grid', gridTemplateColumns: '112px 1fr 48px 48px', gap: 10, alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{ width: 3, height: 14, borderRadius: 2, background: c, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: 'var(--t1)' }}>{e.driverName}</span>
              {sig && <span style={{ fontSize: 10, color: sig.c }}>{sig.t}</span>}
            </div>
            <div style={{ height: 5, borderRadius: 999, background: 'rgba(255,255,255,.06)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: c, borderRadius: 999, transition: 'width .9s cubic-bezier(.4,0,.2,1)' }} />
            </div>
            <div style={{ textAlign: 'right', fontFamily: 'var(--font-bebas)', fontSize: 15, color: c, lineHeight: 1 }}>{e.mentions}</div>
            <div style={{ textAlign: 'right', fontSize: 9, color: dc, fontFamily: 'var(--font-mono)' }}>{sign(d)}</div>
          </div>
        )
      })}
    </div>
  )
}

function OverlaidTrendChart({ entities, seriesMap, anomalyMap }: { entities: EnrichedEntity[]; seriesMap: Record<string, TimeseriesPoint[]>; anomalyMap: Record<string, Anomaly[]> }) {
  const W = 460, H = 130
  const series = entities.map(e => ({ e, data: (seriesMap[e.driverName] ?? []).sort((a, b) => a.date.localeCompare(b.date)) })).filter(s => s.data.length > 1)
  if (!series.length) return <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t3)', fontSize: 11 }}>Loading…</div>
  const allVals = series.flatMap(s => s.data.map(d => d.sentimentAvg))
  const gMin = Math.min(...allVals), gMax = Math.max(...allVals), gRange = Math.max(gMax - gMin, .001)
  const X = (i: number, n: number) => (i / Math.max(n - 1, 1)) * W
  const Y = (v: number) => H - ((v - gMin) / gRange) * (H * .84) - H * .08
  return (
    <div>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
        <defs>{series.map(({ e }) => (
          <linearGradient key={e.driverName} id={`tg-${e.driverName}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={col(e.driverName)} stopOpacity=".14" />
            <stop offset="100%" stopColor={col(e.driverName)} stopOpacity="0" />
          </linearGradient>
        ))}</defs>
        {gMin < 0 && gMax > 0 && <line x1={0} y1={Y(0)} x2={W} y2={Y(0)} stroke="rgba(255,255,255,.1)" strokeDasharray="3 3" />}
        {series.map(({ e, data }) => {
          const pts = data.map((d, i) => [X(i, data.length), Y(d.sentimentAvg)] as [number, number])
          return <path key={`a-${e.driverName}`} d={`M${pts.map(p => p.join(',')).join(' L')} V${H} H0 Z`} fill={`url(#tg-${e.driverName})`} />
        })}
        {series.map(({ e, data }) => (
          <path key={`l-${e.driverName}`}
            d={data.map((d, i) => `${i === 0 ? 'M' : 'L'}${X(i, data.length).toFixed(1)},${Y(d.sentimentAvg).toFixed(1)}`).join(' ')}
            fill="none" stroke={col(e.driverName)} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {series.map(({ e, data }) =>
          (anomalyMap[e.driverName] ?? []).filter(a => a.severity !== 'low').slice(0, 2).map(a => {
            const idx = data.findIndex(d => d.date === a.date)
            if (idx < 0) return null
            return <circle key={`${e.driverName}-${a.date}`} cx={X(idx, data.length)} cy={Y(data[idx].sentimentAvg)} r="4" fill="#f59e0b" stroke="rgba(0,0,0,.5)" strokeWidth="1" />
          })
        )}
      </svg>
      <div style={{ display: 'flex', gap: 14, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {series.map(({ e }) => {
          const d = e.sentimentDelta ?? 0
          return (
            <div key={e.driverName} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 18, height: 2, background: col(e.driverName), borderRadius: 1 }} />
              <span style={{ fontSize: 10, color: 'var(--t2)' }}>{e.driverName}</span>
              <span style={{ fontSize: 9, color: d > 0 ? '#22c55e' : d < 0 ? '#ef4444' : 'var(--t3)', fontFamily: 'var(--font-mono)' }}>{sign(d)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PredictiveSignalsViz({ signals }: { signals: PredictiveSignal[] }) {
  const top = signals.filter(s => s.signal !== 'stable').slice(0, 6)
  if (!top.length) return <div style={{ fontSize: 11, color: 'var(--t3)' }}>No active pre-trend signals.</div>
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {top.map(s => {
        const cfg = SIG_C[s.signal] ?? SIG_C.stable
        const c = col(s.entityName)
        const dirC = s.predictedDirection === 'up' ? '#22c55e' : s.predictedDirection === 'down' ? '#ef4444' : '#6b7280'
        return (
          <div key={s.entityName} style={{ display: 'grid', gridTemplateColumns: '3px 1fr', gap: 12, alignItems: 'stretch' }}>
            <div style={{ background: c, borderRadius: 2 }} />
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: 'var(--font-bebas)', fontSize: 14, color: c, letterSpacing: '.05em' }}>{s.entityName}</span>
                  <Bdg c={cfg.c}>{cfg.label}</Bdg>
                </div>
                <span style={{ fontSize: 10, color: dirC, fontFamily: 'var(--font-mono)' }}>
                  {s.predictedDirection === 'up' ? '▲' : s.predictedDirection === 'down' ? '▼' : '→'} {s.mentionRampRate >= 0 ? '+' : ''}{s.mentionRampRate.toFixed(0)}%
                </span>
              </div>
              <div style={{ height: 3, background: 'rgba(255,255,255,.06)', borderRadius: 2, marginBottom: 5, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${s.preTrendScore}%`, background: cfg.c, transition: 'width .9s ease' }} />
              </div>
              <div style={{ fontSize: 9, color: 'var(--t3)', lineHeight: 1.5 }}>{s.reason}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function TableHead({ tab }: { tab: IntelTab }) {
  return (
    <div className="tbl-head tbl-cols">
      <span>#</span>
      <span>{tab === 'driver' ? 'DRIVER' : 'CONSTRUCTOR'}</span>
      <span style={{ textAlign: 'right' }}>MENTIONS</span>
      <span style={{ textAlign: 'right' }}>SENTIMENT</span>
      <span style={{ textAlign: 'right' }}>Δ RECENT</span>
      <span style={{ textAlign: 'center' }}>DIR</span>
      <span style={{ textAlign: 'right' }}>CONTROVERSY</span>
    </div>
  )
}

function EntityRow({ entity, rank, conRaw, trendSig, pred, active, onSelect }: {
  entity: EnrichedEntity; rank: number; conRaw?: ControversyRaw; trendSig?: TrendSignal
  pred?: PredictiveSignal; active: boolean; onSelect: () => void
}) {
  const c  = col(entity.driverName)
  const d  = entity.sentimentDelta ?? 0
  const dc = d > 0.02 ? '#22c55e' : d < -0.02 ? '#ef4444' : 'var(--t3)'
  const cs = conRaw?.score ?? 0
  const cc = cs >= 65 ? '#ef4444' : cs >= 35 ? '#f59e0b' : cs >= 10 ? '#60a5fa' : 'var(--t3)'
  const p  = pred && pred.signal !== 'stable' ? SIG_C[pred.signal] : null
  return (
    <div className={`tbl-row tbl-cols${active ? ' on' : ''}`} onClick={onSelect} style={{ borderLeftColor: active ? c : 'transparent' }}>
      <span style={{ fontSize: 10, color: 'var(--t3)', fontFamily: 'var(--font-bebas)' }}>{rank}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
        <div style={{ width: 3, height: 20, background: c, borderRadius: 2, flexShrink: 0 }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Link
              href={`/drivers/${entity.driverName.toLowerCase()}`}
              onClick={e => e.stopPropagation()}
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <span style={{
                fontFamily: 'var(--font-bebas)', fontSize: 14,
                letterSpacing: '.06em', lineHeight: 1,
                borderBottom: '1px solid rgba(255,255,255,.1)',
              }}>{entity.driverName}</span>
            </Link>
            {p && <span className="bdg" style={{ background: hr(p.c, .12), color: p.c, borderColor: hr(p.c, .25), fontSize: 7 }}>{p.label}</span>}
          </div>
          {trendSig && trendSig.phase !== 'stable' && (
            <div style={{ fontSize: 8, color: PHASE_C[trendSig.phase] ?? 'var(--t3)', marginTop: 1, letterSpacing: '.08em' }}>
              {trendSig.phase.toUpperCase()}
            </div>
          )}
        </div>
      </div>
      <span style={{ textAlign: 'right', fontFamily: 'var(--font-bebas)', fontSize: 15, lineHeight: 1 }}>{entity.mentions ?? 0}</span>
      <span style={{ textAlign: 'right', fontSize: 10, color: entity.sentimentLabel === 'positive' ? '#22c55e' : entity.sentimentLabel === 'negative' ? '#ef4444' : 'var(--t2)' }}>
        {(entity.sentimentAvg ?? 0) >= 0 ? '+' : ''}{Number(entity.sentimentAvg ?? 0).toFixed(3)}
      </span>
      <span style={{ textAlign: 'right', fontSize: 10, color: dc, fontFamily: 'var(--font-mono)' }}>{d >= 0 ? '+' : ''}{d.toFixed(3)}</span>
      <div style={{ textAlign: 'center', fontSize: 13, color: dc }}>{d > 0.02 ? '↑' : d < -0.02 ? '↓' : '→'}</div>
      <div style={{ textAlign: 'right' }}>
        {cs > 0
          ? <span style={{ fontFamily: 'var(--font-bebas)', fontSize: 14, color: cc }}>{Math.round(cs)}<span style={{ fontSize: 7, color: 'var(--t3)', marginLeft: 1 }}>/100</span></span>
          : <span style={{ color: 'var(--t3)', fontSize: 10 }}>—</span>}
      </div>
    </div>
  )
}

function RowSkeleton() {
  return (
    <div className="tbl-row tbl-cols" style={{ pointerEvents: 'none', borderLeft: '2px solid transparent' }}>
      {[18, 130, 34, 48, 42, 16, 34].map((w, i) => (
        <div key={i} className="sk" style={{ height: 11, width: w, justifySelf: i < 2 ? 'start' : i === 5 ? 'center' : 'end' }} />
      ))}
    </div>
  )
}

function EntityDetail({ entity, entityType, ts, tsLoading, conRaw, sentProf, conProf, trendSig, anomalies, arc, pred, section, setSection, days, onClose }: {
  entity: EnrichedEntity; entityType: IntelTab; ts: TimeseriesPoint[]; tsLoading: boolean
  conRaw?: ControversyRaw; sentProf?: SentimentProfile; conProf?: ControversyProfile
  trendSig?: TrendSignal; anomalies: Anomaly[]; arc?: StoryArc; pred?: PredictiveSignal
  section: 'trend' | 'sentiment' | 'controversy' | 'arc'; setSection: (s: any) => void
  days: number; onClose: () => void
}) {
  const c = col(entity.driverName)
  const p = pred && pred.signal !== 'stable' ? SIG_C[pred.signal] : null
  const sorted = [...ts].sort((a, b) => a.date.localeCompare(b.date))
  const mPath = sparkPts(sorted, 'mentions', 260, 58)
  const sPath = sparkPts(sorted, 'sentimentAvg', 260, 58)
  const totPos = ts.reduce((s, d) => s + d.positiveCount, 0)
  const totNeu = ts.reduce((s, d) => s + d.neutralCount, 0)
  const totNeg = ts.reduce((s, d) => s + d.negativeCount, 0)
  return (
    <div>
      <div style={{ padding: '14px 16px', background: hr(c, .08), borderBottom: '1px solid var(--b1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 8, letterSpacing: '.15em', color: 'var(--t2)', marginBottom: 2 }}>{entityType === 'team' ? 'CONSTRUCTOR' : 'DRIVER'} INTELLIGENCE</div>
          <div style={{ fontFamily: 'var(--font-bebas)', fontSize: 21, color: c, letterSpacing: '.06em', lineHeight: 1 }}>{entity.driverName}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          {p && <Bdg c={p.c}>{p.label}</Bdg>}
          <button onClick={onClose} style={{ background: 'transparent', border: '1px solid var(--b1)', color: 'var(--t2)', width: 28, height: 28, borderRadius: 8, cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', borderBottom: '1px solid var(--b1)' }}>
        {[
          { l: 'INFLUENCE',   v: `${entity.influenceScore}`,                                              c },
          { l: 'MENTIONS',    v: `${entity.mentions}` },
          { l: 'SENTIMENT',   v: sign(entity.sentimentAvg), c: entity.sentimentAvg > 0 ? '#22c55e' : entity.sentimentAvg < 0 ? '#ef4444' : undefined },
          { l: 'CONTROVERSY', v: (conRaw?.score ?? 0) > 0 ? `${Math.round(conRaw!.score)}` : '—',
            c: (conRaw?.score ?? 0) >= 50 ? '#ef4444' : (conRaw?.score ?? 0) >= 25 ? '#f59e0b' : undefined },
        ].map((s, i) => (
          <div key={s.l} style={{ padding: '10px 11px', borderRight: i < 3 ? '1px solid var(--b1)' : undefined }}>
            <div style={{ fontSize: 7.5, letterSpacing: '.12em', color: 'var(--t3)', marginBottom: 3 }}>{s.l}</div>
            <div style={{ fontFamily: 'var(--font-bebas)', fontSize: 19, color: s.c ?? 'var(--t1)', lineHeight: 1 }}>{s.v}</div>
          </div>
        ))}
      </div>
      <div className="dtabs">
        {(['trend', 'sentiment', 'controversy', 'arc'] as const).map(v => (
          <button key={v} className={`dtab${section === v ? ' on' : ''}`} onClick={() => setSection(v)}>
            {v === 'arc' ? 'STORY ARC' : v.toUpperCase()}
          </button>
        ))}
      </div>
      <div style={{ padding: '13px 15px' }}>
        {section === 'trend' && (
          <div style={{ display: 'grid', gap: 13 }}>
            {tsLoading ? <div className="sk" style={{ height: 76 }} /> : (
              <>
                <div>
                  <div style={{ fontSize: 8, letterSpacing: '.12em', color: 'var(--t3)', marginBottom: 5 }}>MENTION VOLUME · {days} DAYS</div>
                  <svg width="100%" height={60} viewBox="0 0 260 60">
                    <defs><linearGradient id={`mg-${entity.driverName}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={c} stopOpacity=".22" /><stop offset="100%" stopColor={c} stopOpacity="0" /></linearGradient></defs>
                    {mPath && <><path d={`${mPath} V56 H0 Z`} fill={`url(#mg-${entity.driverName})`} /><path d={mPath} fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" /></>}
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 8, letterSpacing: '.12em', color: 'var(--t3)', marginBottom: 5 }}>SENTIMENT AVERAGE · {days} DAYS</div>
                  <svg width="100%" height={60} viewBox="0 0 260 60">
                    <defs><linearGradient id={`sg-${entity.driverName}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={entity.sentimentAvg >= 0 ? '#22c55e' : '#ef4444'} stopOpacity=".18" /><stop offset="100%" stopColor={entity.sentimentAvg >= 0 ? '#22c55e' : '#ef4444'} stopOpacity="0" /></linearGradient></defs>
                    {sPath && <><path d={`${sPath} V56 H0 Z`} fill={`url(#sg-${entity.driverName})`} /><path d={sPath} fill="none" stroke={entity.sentimentAvg >= 0 ? '#22c55e' : '#ef4444'} strokeWidth="1.8" strokeLinecap="round" /></>}
                  </svg>
                </div>
              </>
            )}
            {trendSig && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                <DS l="PHASE"    v={trendSig.phase.toUpperCase()} c={PHASE_C[trendSig.phase]} />
                <DS l="VELOCITY" v={`${trendSig.mentionVelocity >= 0 ? '+' : ''}${trendSig.mentionVelocity.toFixed(2)}/day`} c={trendSig.mentionVelocity > 0 ? '#22c55e' : '#ef4444'} />
                <DS l="BREAKOUT" v={trendSig.mentionBreakout ? `${trendSig.breakoutMagnitude.toFixed(1)}σ ABOVE` : 'NO'} c={trendSig.mentionBreakout ? '#22c55e' : undefined} />
                {trendSig.daysSinceSpike != null && <DS l="LAST SPIKE" v={`${trendSig.daysSinceSpike}d ago`} />}
              </div>
            )}
          </div>
        )}
        {section === 'sentiment' && sentProf && (
          <div style={{ display: 'grid', gap: 12 }}>
            <div>
              <div style={{ fontSize: 8, letterSpacing: '.12em', color: 'var(--t3)', marginBottom: 6 }}>COMPOSITION</div>
              <div style={{ height: 6, borderRadius: 999, display: 'flex', overflow: 'hidden', background: 'rgba(255,255,255,.06)', marginBottom: 7 }}>
                <div style={{ width: `${sentProf.positiveRatio * 100}%`, background: '#22c55e' }} />
                <div style={{ width: `${sentProf.neutralRatio * 100}%`, background: 'rgba(255,255,255,.14)' }} />
                <div style={{ width: `${sentProf.negativeRatio * 100}%`, background: '#ef4444' }} />
              </div>
              <div style={{ display: 'flex', gap: 9 }}>
                {[{ l: 'Pos', v: totPos, c: '#22c55e' }, { l: 'Neu', v: totNeu, c: 'var(--t3)' }, { l: 'Neg', v: totNeg, c: '#ef4444' }].map(s => (
                  <span key={s.l} style={{ fontSize: 9, color: 'var(--t2)' }}><span style={{ color: s.c }}>{s.v}</span> {s.l}</span>
                ))}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
              <DS l="POLARITY"     v={sentProf.polarityIndex.toFixed(3)}                       c={sentProf.polarityIndex > 0.1 ? '#22c55e' : sentProf.polarityIndex < -0.1 ? '#ef4444' : undefined} />
              <DS l="SUBJECTIVITY" v={`${(sentProf.subjectivity * 100).toFixed(1)}%`} />
              <DS l="VOLATILITY"   v={sentProf.volatility.toFixed(4)}                          c={sentProf.volatility > 0.1 ? '#f59e0b' : undefined} />
              <DS l="ACCELERATION" v={`${sentProf.acceleration >= 0 ? '+' : ''}${sentProf.acceleration.toFixed(3)}`} c={sentProf.acceleration > 0 ? '#22c55e' : sentProf.acceleration < 0 ? '#ef4444' : undefined} />
              <DS l="RECENT BIAS"  v={sentProf.recentBias.toUpperCase()}                       c={sentProf.recentBias === 'positive' ? '#22c55e' : sentProf.recentBias === 'negative' ? '#ef4444' : undefined} />
              <DS l="LABEL"        v={sentProf.label.toUpperCase()} />
            </div>
            {anomalies.length > 0 && (
              <div>
                <div style={{ fontSize: 8, letterSpacing: '.12em', color: 'var(--t3)', marginBottom: 7 }}>ANOMALIES DETECTED</div>
                {anomalies.slice(0, 4).map((a, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--b1)' }}>
                    <span style={{ fontSize: 9, color: 'var(--t2)', lineHeight: 1.4 }}>{a.description}</span>
                    <span style={{ fontSize: 8, color: 'var(--t3)', flexShrink: 0 }}>{fmtDate(a.date)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {section === 'controversy' && (conProf ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
              <DS l="TIER"          v={conProf.tier.toUpperCase()}        c={TIER_C[conProf.tier]} />
              <DS l="TRAJECTORY"    v={conProf.trajectory}                c={TRAJ_C[conProf.trajectory]} />
              <DS l="DOMINANT"      v={conProf.dominantDriver.toUpperCase()} />
              <DS l="CONCENTRATION" v={`${(conProf.concentration * 100).toFixed(0)}%`} c={conProf.concentration > 0.6 ? '#f59e0b' : undefined} />
            </div>
            {[
              { l: 'SENTIMENT', v: conProf.components.sentiment, c: '#ef4444' },
              { l: 'FIA',       v: conProf.components.fia,       c: '#f59e0b' },
              { l: 'SPIKE',     v: conProf.components.spike,     c: '#60a5fa' },
              { l: 'MEDIA',     v: conProf.components.media,     c: '#a855f7' },
            ].map(comp => (
              <div key={comp.l}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: 'var(--t3)', marginBottom: 4 }}>
                  <span>{comp.l}</span><span style={{ color: comp.c }}>{Math.round(comp.v)}/100</span>
                </div>
                <div style={{ height: 4, background: 'rgba(255,255,255,.06)', borderRadius: 2 }}>
                  <div style={{ height: '100%', width: `${comp.v}%`, background: comp.c, borderRadius: 2, transition: 'width .8s ease' }} />
                </div>
              </div>
            ))}
          </div>
        ) : <div style={{ fontSize: 11, color: 'var(--t3)' }}>No controversy data.</div>)}
        {section === 'arc' && arc && (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
              <DS l="PHASE"          v={arc.phase.toUpperCase()}         c={PHASE_C[arc.phase]} />
              <DS l="SENTIMENT ARC"  v={arc.sentimentArc.toUpperCase()}  c={SENT_ARC_C[arc.sentimentArc]} />
              {arc.peakDate && <DS l="PEAK DATE" v={fmtDate(arc.peakDate)} />}
              {arc.estimatedResolutionDays != null && <DS l="EST. RESOLUTION" v={`~${arc.estimatedResolutionDays}d`} />}
            </div>
            <div style={{ height: 4, background: 'rgba(255,255,255,.06)', borderRadius: 2 }}>
              <div style={{ height: '100%', width: `${arc.currentIntensity}%`, background: PHASE_C[arc.phase] ?? '#6b7280', transition: 'width .8s ease' }} />
            </div>
            <p style={{ fontSize: 10, color: 'var(--t2)', lineHeight: 1.7, margin: 0, padding: '9px 11px', borderRadius: 8, border: '1px solid var(--b1)', background: 'rgba(0,0,0,.15)' }}>{arc.narrative}</p>
            {arc.beats.length > 0 && (
              <div>
                <div style={{ fontSize: 8, letterSpacing: '.12em', color: 'var(--t3)', marginBottom: 7 }}>STORY BEATS</div>
                {arc.beats.slice(0, 5).map((b: StoryBeat, i: number) => (
                  <div key={i} style={{ display: 'flex', gap: 9, padding: '5px 0', borderBottom: '1px solid var(--b1)', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 8, color: 'var(--t3)', flexShrink: 0, minWidth: 46, marginTop: 1 }}>{fmtDate(b.date)}</span>
                    <span style={{ fontSize: 9, color: 'var(--t2)', lineHeight: 1.5 }}>{b.description}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function DS({ l, v, c }: { l: string; v: string; c?: string }) {
  return (
    <div style={{ border: '1px solid var(--b1)', borderRadius: 8, padding: '7px 9px', background: 'rgba(0,0,0,.2)' }}>
      <div style={{ fontSize: 7.5, letterSpacing: '.12em', color: 'var(--t3)', marginBottom: 3 }}>{l}</div>
      <div style={{ fontSize: 11, color: c ?? 'var(--t1)', lineHeight: 1.3, wordBreak: 'break-word' }}>{v}</div>
    </div>
  )
}

function EmptyDetail() {
  return (
    <div style={{ padding: '28px 18px' }}>
      <div style={{ fontSize: 9, letterSpacing: '.14em', color: 'var(--t3)', marginBottom: 9 }}>INTELLIGENCE PANEL</div>
      <p style={{ color: 'var(--t2)', fontSize: 11, lineHeight: 1.8, margin: 0 }}>Select any driver or constructor from the table to open trend, sentiment, controversy, and story arc analysis.</p>
    </div>
  )
}

function ControversyViz({ entities, profiles }: { entities: EnrichedEntity[]; profiles: Record<string, ControversyProfile> }) {
  const ents = entities.filter(e => profiles[e.driverName] && profiles[e.driverName].score > 0)
  if (!ents.length) return <div style={{ fontSize: 11, color: 'var(--t3)' }}>No active controversy signals.</div>
  const comps = ['sentiment', 'fia', 'spike', 'media'] as const
  const compC = { sentiment: '#ef4444', fia: '#f59e0b', spike: '#60a5fa', media: '#a855f7' }
  return (
    <div style={{ display: 'grid', gap: 11 }}>
      {ents.map(e => {
        const p = profiles[e.driverName], c = col(e.driverName)
        const tc = TIER_C[p.tier] ?? '#6b7280'
        return (
          <div key={e.driverName} style={{ border: '1px solid var(--b1)', borderRadius: 10, padding: '11px 13px', background: 'rgba(0,0,0,.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 3, height: 17, background: c, borderRadius: 2 }} />
                <span style={{ fontFamily: 'var(--font-bebas)', fontSize: 13, letterSpacing: '.05em' }}>{e.driverName}</span>
                <Bdg c={tc}>{p.tier}</Bdg>
                <Bdg c={TRAJ_C[p.trajectory] ?? '#6b7280'}>{p.trajectory}</Bdg>
              </div>
              <span style={{ fontFamily: 'var(--font-bebas)', fontSize: 17, color: tc }}>{Math.round(p.score)}<span style={{ fontSize: 8, color: 'var(--t3)', marginLeft: 1 }}>/100</span></span>
            </div>
            <div style={{ height: 5, borderRadius: 3, overflow: 'hidden', display: 'flex', gap: 1, marginBottom: 8 }}>
              {comps.map(comp => { const v = p.components[comp]; if (v <= 0) return null; return <div key={comp} style={{ flex: v, background: compC[comp] }} /> })}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {comps.map(comp => (
                <div key={comp} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 6, height: 6, borderRadius: 2, background: compC[comp] }} />
                  <span style={{ fontSize: 8, color: 'var(--t3)', textTransform: 'uppercase' }}>{comp} <span style={{ color: 'var(--t2)' }}>{Math.round(p.components[comp])}</span></span>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CorrelationViz({ correlations }: { correlations: EntityCorrelation[] }) {
  if (!correlations.length) return <div style={{ fontSize: 11, color: 'var(--t3)' }}>Insufficient data.</div>
  const relC: Record<string, string> = { rivals: '#ef4444', 'co-trending': '#22c55e', 'narrative-linked': '#60a5fa', inverse: '#f59e0b', independent: '#6b7280' }
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {correlations.map((corr, i) => {
        const cA = col(corr.entityA), cB = col(corr.entityB)
        const rc = relC[corr.relationship] ?? '#6b7280'
        return (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px 90px', gap: 10, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--b1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontFamily: 'var(--font-bebas)', fontSize: 12, color: cA }}>{corr.entityA}</span>
              <span style={{ color: 'var(--t3)', fontSize: 10 }}>↔</span>
              <span style={{ fontFamily: 'var(--font-bebas)', fontSize: 12, color: cB }}>{corr.entityB}</span>
            </div>
            <div><div style={{ fontSize: 7, color: 'var(--t3)', marginBottom: 3 }}>MENTIONS</div><CorrBar v={corr.mentionCorrelation} /></div>
            <div><div style={{ fontSize: 7, color: 'var(--t3)', marginBottom: 3 }}>SENTIMENT</div><CorrBar v={corr.sentimentCorrelation} /></div>
            <Bdg c={rc}>{corr.relationship}</Bdg>
          </div>
        )
      })}
    </div>
  )
}

function CorrBar({ v }: { v: number }) {
  const c = v > 0.3 ? '#22c55e' : v < -0.3 ? '#ef4444' : '#6b7280'
  return (
    <div style={{ height: 4, background: 'rgba(255,255,255,.06)', borderRadius: 2, position: 'relative' }}>
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 1, background: 'rgba(255,255,255,.12)' }} />
      <div style={{
        position: 'absolute', top: 0, bottom: 0, background: c, borderRadius: 2,
        left: v >= 0 ? '50%' : `${((v + 1) / 2) * 100}%`,
        width: v >= 0 ? `${(v / 2) * 100}%` : `${(Math.abs(v) / 2) * 100}%`,
        transition: 'width .7s ease',
      }} />
    </div>
  )
}

function AnomalyLog({ entities, anomalyMap }: { entities: EnrichedEntity[]; anomalyMap: Record<string, Anomaly[]> }) {
  const all = entities.flatMap(e => (anomalyMap[e.driverName] ?? []).map(a => ({ ...a, entity: e.driverName }))).sort((a, b) => b.magnitude - a.magnitude).slice(0, 10)
  if (!all.length) return <div style={{ fontSize: 11, color: 'var(--t3)' }}>No significant anomalies in this window.</div>
  const tC: Record<string, string> = { spike: '#22c55e', drop: '#ef4444', sentiment_reversal: '#f59e0b', silence: '#60a5fa', sentiment_spike: '#a855f7' }
  const sC: Record<string, string> = { low: '#6b7280', medium: '#f59e0b', high: '#ef4444' }
  return (
    <div style={{ display: 'grid', gap: 7 }}>
      {all.map((a, i) => {
        const c = col(a.entity), tc = tC[a.type] ?? '#6b7280', sc = sC[a.severity] ?? '#6b7280'
        return (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '3px 78px 1fr auto', gap: 10, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--b1)' }}>
            <div style={{ background: c, borderRadius: 2, alignSelf: 'stretch' }} />
            <div>
              <div style={{ fontFamily: 'var(--font-bebas)', fontSize: 11, color: c, letterSpacing: '.05em' }}>{a.entity}</div>
              <div style={{ fontSize: 8, color: 'var(--t3)' }}>{fmtDate(a.date)}</div>
            </div>
            <span style={{ fontSize: 9, color: 'var(--t2)', lineHeight: 1.5 }}>{a.description}</span>
            <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
              <Bdg c={tc}>{a.type.replace('_', ' ')}</Bdg>
              <Bdg c={sc}>{a.severity}</Bdg>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ComparisonTool({ entities, compareA, compareB, setCompareA, setCompareB, result }: {
  entities: EnrichedEntity[]; compareA: string | null; compareB: string | null
  setCompareA: (n: string | null) => void; setCompareB: (n: string | null) => void
  result: ComparisonResult | null
}) {
  const names = entities.map(e => e.driverName)
  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <ESel label="Entity A" value={compareA} opts={names} onChange={setCompareA} c={compareA ? col(compareA) : '#60a5fa'} />
        <span style={{ color: 'var(--t3)', fontSize: 13, paddingBottom: 7 }}>vs</span>
        <ESel label="Entity B" value={compareB} opts={names.filter(n => n !== compareA)} onChange={setCompareB} c={compareB ? col(compareB) : '#ef4444'} />
        {(compareA || compareB) && (
          <button onClick={() => { setCompareA(null); setCompareB(null) }} style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--b1)', background: 'transparent', color: 'var(--t2)', cursor: 'pointer', fontSize: 10, marginBottom: 1 }}>CLEAR</button>
        )}
      </div>
      {result ? (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 11, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--b1)', background: 'rgba(0,0,0,.15)' }}>
            <span style={{ fontSize: 10, color: 'var(--t2)' }}>{result.summary}</span>
            {result.winner !== 'tied' && <span style={{ fontFamily: 'var(--font-bebas)', fontSize: 13, color: col(result.winner) }}>{result.winner} LEADS</span>}
          </div>
          <div style={{ display: 'grid', gap: 5 }}>
            {result.dimensions.map((d: ComparisonDimension) => {
              const aWin = d.winner === result.entityA, bWin = d.winner === result.entityB
              const cA = col(result.entityA), cB = col(result.entityB)
              const aMax = Math.max(Math.abs(d.valueA), Math.abs(d.valueB), .001)
              const aW = (Math.abs(d.valueA) / aMax) * 44, bW = (Math.abs(d.valueB) / aMax) * 44
              return (
                <div key={d.label} style={{ display: 'grid', gridTemplateColumns: '64px 1fr 60px 1fr 64px', gap: 8, alignItems: 'center' }}>
                  <div style={{ textAlign: 'right', fontFamily: 'var(--font-bebas)', fontSize: 11, color: aWin ? cA : 'var(--t3)', opacity: aWin ? 1 : .5 }}>{d.valueA.toFixed(d.unit === '' ? 3 : 1)}{d.unit}</div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}><div style={{ height: 5, borderRadius: '3px 0 0 3px', background: aWin ? cA : hr(cA, .25), width: `${aW}%`, transition: 'width .7s ease' }} /></div>
                  <div style={{ textAlign: 'center', fontSize: 7.5, color: 'var(--t3)', letterSpacing: '.08em' }}>{d.label}</div>
                  <div style={{ display: 'flex', justifyContent: 'flex-start' }}><div style={{ height: 5, borderRadius: '0 3px 3px 0', background: bWin ? cB : hr(cB, .25), width: `${bW}%`, transition: 'width .7s ease' }} /></div>
                  <div style={{ fontFamily: 'var(--font-bebas)', fontSize: 11, color: bWin ? cB : 'var(--t3)', opacity: bWin ? 1 : .5 }}>{d.valueB.toFixed(d.unit === '' ? 3 : 1)}{d.unit}</div>
                </div>
              )
            })}
          </div>
        </div>
      ) : <p style={{ fontSize: 11, color: 'var(--t3)', margin: 0 }}>Select two entities to compare side-by-side.</p>}
    </div>
  )
}

function ESel({ label, value, opts, onChange, c }: { label: string; value: string | null; opts: string[]; onChange: (n: string | null) => void; c: string }) {
  return (
    <div>
      <div style={{ fontSize: 8, letterSpacing: '.12em', color: 'var(--t3)', marginBottom: 4 }}>{label}</div>
      <select value={value ?? ''} onChange={e => onChange(e.target.value || null)} style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(0,0,0,.4)', border: `1px solid ${value ? c : 'var(--b1)'}`, color: value ? c : 'var(--t2)', fontFamily: 'var(--font-mono)', fontSize: 10, cursor: 'pointer', minWidth: 132, appearance: 'none' }}>
        <option value="">Select…</option>
        {opts.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function IntelligencePage() {
  const [mainTab, setMainTab]   = useState<MainTab>('stories')
  const [windowMode, setWindowMode] = useState<WindowMode>('30')

  // Stories state
  const [stories, setStories]   = useState<Story[]>([])
  const [briefing, setBriefing] = useState<any>(null)
  const [storiesLoading, setStoriesLoading] = useState(true)

  // Intelligence state (shared between drivers/teams tabs)
  const [intelTab, setIntelTab] = useState<IntelTab>('driver')
  const [drivers, setDrivers]   = useState<SummaryEntity[]>([])
  const [teams, setTeams]       = useState<SummaryEntity[]>([])
  const [rawCon, setRawCon]     = useState<ControversyRaw[]>([])
  const [intelLoading, setIntelLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const [compareA, setCompareA] = useState<string | null>(null)
  const [compareB, setCompareB] = useState<string | null>(null)
  const [detailSection, setDetailSection] = useState<'trend' | 'sentiment' | 'controversy' | 'arc'>('trend')

  const currentRace = useMemo(() => getCurrentRace(), [])
  const days = useMemo(() => {
    if (windowMode === 'race' && currentRace) return raceWindowDays(currentRace.race)
    if (windowMode === '14') return 14
    return 30
  }, [windowMode, currentRace])

  // Fetch stories + briefing
  useEffect(() => {
    let mounted = true
    setStoriesLoading(true)
    Promise.all([
      fetch('/api/news/stories?hours=720&limit=80').then(r => r.ok ? r.json() : null),
      fetch('/api/intelligence/briefing').then(r => r.ok ? r.json() : null),
    ]).then(([storiesData, briefingData]) => {
      if (!mounted) return
      setStories(storiesData?.ok ? (storiesData.data ?? []) : [])
      setBriefing(briefingData?.ok ? (briefingData.briefing ?? null) : null)
    }).finally(() => { if (mounted) setStoriesLoading(false) })
    return () => { mounted = false }
  }, [])

  // Fetch intelligence data
  useEffect(() => {
    let mounted = true
    setIntelLoading(true)
    Promise.all([
      fetch('/api/intelligence/drivers?format=summary&type=driver').then(r => r.ok ? r.json() : null),
      fetch('/api/intelligence/drivers?format=summary&type=team').then(r => r.ok ? r.json() : null),
      fetch(`/api/intelligence/controversy?days=${days}`).then(r => r.ok ? r.json() : null),
    ]).then(([d, t, c]) => {
      if (!mounted) return
      setDrivers((d?.ok ? (d.data ?? d.drivers ?? []) : []).map(normSummary))
      setTeams((t?.ok  ? (t.data ?? t.drivers ?? []) : []).map(normSummary))
      setRawCon((c?.ok ? (c.data ?? []) : []).map(normCon))
    }).finally(() => { if (mounted) setIntelLoading(false) })
    return () => { mounted = false }
  }, [days])

  // Reset selection when tab changes
  useEffect(() => { setSelected(null); setCompareA(null); setCompareB(null) }, [intelTab])

  // When a driver tag is clicked in stories, switch to drivers tab and select
  const handleDriverTagClick = (name: string) => {
    setMainTab('drivers')
    setIntelTab('driver')
    setSelected(name)
  }

  // Enriched entities
  const list = intelTab === 'driver' ? drivers : teams
  const cMap = useMemo(() => Object.fromEntries(rawCon.map(c => [c.entityName.toUpperCase(), c])), [rawCon])

  const enriched = useMemo((): EnrichedEntity[] => {
    const ms = list.map(d => d.mentions ?? 0)
    const ss = list.map(d => d.sentimentAvg ?? 0)
    const ds = list.map(d => d.sentimentDelta ?? 0)
    const cs = list.map(d => cMap[d.driverName.toUpperCase()]?.score ?? 0)
    return list.map(e => {
      const cScore = cMap[e.driverName.toUpperCase()]?.score ?? 0
      const influence = Math.round(
        0.45 * nscore(ms, e.mentions ?? 0) +
        0.20 * nscore(ss, e.sentimentAvg ?? 0) +
        0.20 * nscore(ds, e.sentimentDelta ?? 0) +
        0.15 * nscore(cs, cScore)
      )
      const maxM = Math.max(...ms, 0)
      let pulse: EnrichedEntity['pulse'] = 'STABLE'
      if ((e.mentions ?? 0) >= maxM * 0.88) pulse = 'MOST DISCUSSED'
      if ((e.sentimentDelta ?? 0) > 0.12)  pulse = 'RISING'
      if ((e.sentimentDelta ?? 0) < -0.08) pulse = 'FALLING'
      if (cScore >= 40) pulse = 'CONTROVERSIAL'
      return { ...e, controversyScore: cScore, influenceScore: influence, narrativeGroup: classifyNarrative(e.topCluster), pulse }
    })
  }, [list, cMap])

  const top8 = useMemo(() => [...enriched].sort((a, b) => (b.mentions ?? 0) - (a.mentions ?? 0)).slice(0, 8), [enriched])
  const top4 = useMemo(() => top8.slice(0, 4), [top8])
  const tsMap = useBatchTs(intelTab, top8, days)
  const detailTs = useEntityTs(intelTab, selected, days)

  const sentProfs = useMemo(() => {
    const m: Record<string, SentimentProfile> = {}
    for (const e of top8) m[e.driverName] = computeSentimentProfile(e as any, tsMap[e.driverName] ?? [])
    return m
  }, [top8, tsMap])

  const conProfs = useMemo(() => {
    const m: Record<string, ControversyProfile> = {}
    for (const e of enriched) {
      const r = cMap[e.driverName.toUpperCase()]
      if (r) m[e.driverName] = computeControversyProfile(r.score, r.components, r.trend, r.delta)
    }
    return m
  }, [enriched, cMap])

  const trendSigs = useMemo(() => {
    const m: Record<string, TrendSignal> = {}
    for (const e of top8) m[e.driverName] = computeTrendSignal(tsMap[e.driverName] ?? [])
    return m
  }, [top8, tsMap])

  const anomalyMap = useMemo(() => {
    const m: Record<string, Anomaly[]> = {}
    for (const e of top8) m[e.driverName] = detectAnomalies(tsMap[e.driverName] ?? [])
    return m
  }, [top8, tsMap])

  const predSignals = useMemo(() =>
    top8.map(e => computePredictiveSignal(e as any, tsMap[e.driverName] ?? [])).sort((a, b) => b.preTrendScore - a.preTrendScore),
    [top8, tsMap]
  )

  const correlations = useMemo(() => computeCorrelationMatrix(top8 as any, tsMap).slice(0, 10), [top8, tsMap])

  const storyArcs = useMemo(() => {
    const m: Record<string, StoryArc> = {}
    for (const e of top8) m[e.driverName] = computeStoryArc(e as any, tsMap[e.driverName] ?? [], anomalyMap[e.driverName] ?? [])
    return m
  }, [top8, tsMap, anomalyMap])

  const comparison = useMemo((): ComparisonResult | null => {
    if (!compareA || !compareB) return null
    const a = enriched.find(e => e.driverName === compareA)
    const b = enriched.find(e => e.driverName === compareB)
    if (!a || !b) return null
    return compareEntities(
      a as any, b as any,
      cMap[a.driverName.toUpperCase()], cMap[b.driverName.toUpperCase()],
      sentProfs[a.driverName], sentProfs[b.driverName],
      trendSigs[a.driverName], trendSigs[b.driverName],
    )
  }, [compareA, compareB, enriched, cMap, sentProfs, trendSigs])

  const selEntity = useMemo(() => enriched.find(e => e.driverName === selected) ?? null, [enriched, selected])
  const totalMentions = useMemo(() => enriched.reduce((s, e) => s + (e.mentions ?? 0), 0), [enriched])
  const rising  = useMemo(() => [...enriched].sort((a, b) => (b.sentimentDelta ?? 0) - (a.sentimentDelta ?? 0))[0], [enriched])
  const hottest = useMemo(() => [...enriched].sort((a, b) => (b.controversyScore ?? 0) - (a.controversyScore ?? 0))[0], [enriched])

  // Stories processing
  const dedupedStories = useMemo(() => dedupeStories(stories), [stories])
  const driverNames = useMemo(() => drivers.map(d => d.driverName), [drivers])
  const driverSentimentMap = useMemo(() =>
    Object.fromEntries(drivers.map(d => [d.driverName.toUpperCase(), d])),
    [drivers]
  )
  const storyClusters = useMemo(() =>
    buildStoryClusters(dedupedStories, driverNames),
    [dedupedStories, driverNames]
  )
  const featuredStory = useMemo(() =>
    [...dedupedStories].sort((a, b) => safeNum(b.momentum_score) - safeNum(a.momentum_score))[0],
    [dedupedStories]
  )
  const breakingStories = useMemo(() => dedupedStories.filter(s => s.is_breaking), [dedupedStories])

  // KPIs
  const storyKpis = [
    { label: 'STORIES',     value: dedupedStories.length,              color: 'var(--blue)' },
    { label: 'BREAKING',    value: breakingStories.length,             color: 'var(--red)'  },
    { label: 'CLUSTERS',    value: storyClusters.length,               color: '#f59e0b'     },
    { label: 'DRIVERS ACTIVE', value: driverNames.length,              color: '#22c55e'     },
  ]

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', position: 'relative' }}>
      <style>{CSS}</style>
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', opacity: 0.52 }}>
        <BgCanvas />
      </div>
      <Header />
      <Ticker />

      <div style={{ position: 'relative', zIndex: 1, paddingTop: 'var(--header-h)' }}>
        <div className="pg">

          {/* ── Masthead ── */}
          <motion.header
            className="masthead"
            initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.42 }}
          >
            <div className="masthead-left">
              <div className="eyebrow">
                <div className="line" />
                <span>F1 BULLETIN INTELLIGENCE SYSTEM · 2026 SEASON</span>
              </div>
              <div className="hero-stack">
                <h1 className="masthead-title">INTELLIGENCE</h1>
                <p className="masthead-copy">
                  Stories, narratives and driver sentiment from across the F1 media landscape — all connected.
                </p>
              </div>

              {/* Main tabs */}
              <div className="tab-strip">
                <div className="tab-group">
                  {([
                    { key: 'stories',  label: 'STORIES',      count: dedupedStories.length },
                    { key: 'drivers',  label: 'DRIVERS',       count: drivers.length },
                    { key: 'teams',    label: 'CONSTRUCTORS',  count: teams.length },
                  ] as const).map(t => (
                    <button
                      key={t.key}
                      onClick={() => {
                        setMainTab(t.key)
                        if (t.key === 'drivers') setIntelTab('driver')
                        if (t.key === 'teams')   setIntelTab('team')
                      }}
                      className={`tab-btn${mainTab === t.key ? ' on' : ''}`}
                    >
                      {t.label}
                      <span className="tab-count">{t.count || '—'}</span>
                    </button>
                  ))}
                </div>

                <div className="tab-divider" />

                {/* Window selector — only for driver/team tabs */}
                {mainTab !== 'stories' && (
                  <div className="tab-group">
                    {(['race', '14', '30'] as WindowMode[]).map(w => {
                      const isRace = w === 'race'
                      const label = isRace
                        ? (currentRace?.live ? 'LIVE WINDOW' : 'RACE WINDOW')
                        : w === '14' ? '14 DAYS' : '30 DAYS'
                      const disabled = isRace && !currentRace
                      return (
                        <button
                          key={w}
                          onClick={() => { if (!disabled) setWindowMode(w) }}
                          className={`tab-btn${windowMode === w ? ' on' : ''}`}
                          style={{ opacity: disabled ? 0.35 : 1, cursor: disabled ? 'default' : 'pointer' }}
                        >
                          {label}
                          {isRace && currentRace && !currentRace.live && <span className="tab-count">{currentRace.daysUntil}d</span>}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Right: race pill + signals */}
            <div className="masthead-right">
              {currentRace && (
                <div className="race-pill">
                  <div className="race-flag">{currentRace.race.flag}</div>
                  <div>
                    <div className="race-kicker">
                      {currentRace.live ? 'LIVE WEEKEND' : 'NEXT RACE'} · R{currentRace.race.round}
                      {currentRace.race.sprint && <span className="race-sprint">SPRINT</span>}
                    </div>
                    <div className="race-name">{currentRace.race.shortName}</div>
                    <div className="race-meta">{currentRace.race.city} · {new Date(currentRace.race.race).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>
                  </div>
                </div>
              )}
              {!intelLoading && mainTab !== 'stories' && (
                <div className="headline-grid">
                  {[
                    rising  ? { label: 'RISING', e: rising,  val: sign(rising.sentimentDelta),                    c: '#22c55e' } : null,
                    hottest ? { label: 'HOT',    e: hottest, val: `${Math.round(hottest.controversyScore)}/100`,  c: '#f59e0b' } : null,
                  ].filter(Boolean).map((s: any) => (
                    <button key={s.label} className="headline-signal" onClick={() => setSelected(s.e.driverName)}>
                      <span className="hs-label">{s.label}</span>
                      <span className="hs-name" style={{ color: col(s.e.driverName) }}>{s.e.driverName}</span>
                      <span className="hs-val" style={{ color: s.c }}>{s.val}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.header>

          {/* ── STORIES TAB ── */}
          <AnimatePresence mode="wait">
            {mainTab === 'stories' && (
              <motion.div
                key="stories"
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
                style={{ display: 'grid', gap: 16 }}
              >
                {/* KPIs */}
                <div className="kpi-row">
                  {storyKpis.map(kpi => (
                    <KpiCard key={kpi.label} label={kpi.label} value={storiesLoading ? '—' : kpi.value} color={kpi.color} />
                  ))}
                </div>

                {/* Breaking banner */}
                {breakingStories.length > 0 && (
                  <div style={{
                    display: 'flex', gap: 8, flexWrap: 'wrap',
                    padding: '10px 14px',
                    border: '1px solid rgba(225,6,0,.3)',
                    borderRadius: 12,
                    background: 'rgba(225,6,0,.04)',
                    alignItems: 'center',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--red)', boxShadow: '0 0 6px var(--red)' }} />
                      <span style={{ fontSize: 8, fontFamily: 'var(--font-mono)', letterSpacing: '.18em', color: 'var(--red)' }}>
                        BREAKING · {breakingStories.length}
                      </span>
                    </div>
                    {breakingStories.slice(0, 3).map((s, i) => (
                      <span key={i} style={{ fontSize: 10, color: 'var(--t2)' }}>
                        {i > 0 && <span style={{ color: 'var(--t3)', marginRight: 8 }}>·</span>}
                        {s.latest_url
                          ? <a href={s.latest_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--t1)', textDecoration: 'none' }}>{s.story_title}</a>
                          : s.story_title}
                      </span>
                    ))}
                  </div>
                )}

                {/* Featured story */}
                {storiesLoading ? (
                  <div className="sk" style={{ height: 140, borderRadius: 18 }} />
                ) : featuredStory ? (
                  <FeaturedStory story={featuredStory} color="var(--red)" />
                ) : null}

                {/* Daily Briefing */}
                {!storiesLoading && briefing && (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr',
                    gap: 12,
                  }}>
                    {[
                      { label: 'TOP STORY',        value: briefing.top_story_summary, icon: '📰', color: 'var(--red)' },
                      { label: 'DRIVER SPOTLIGHT', value: briefing.driver_spotlight,  icon: '🏎️', color: '#f59e0b'  },
                      { label: 'WHAT TO WATCH',    value: briefing.what_to_watch,     icon: '👁',  color: '#60a5fa'  },
                    ].filter(s => s.value).map(s => (
                      <div key={s.label} style={{
                        border: `1px solid ${s.color}25`,
                        borderRadius: 14,
                        padding: '14px 16px',
                        background: `${s.color}06`,
                        position: 'relative', overflow: 'hidden',
                      }}>
                        <div style={{
                          position: 'absolute', top: 0, left: 0, right: 0,
                          height: 2, background: s.color, opacity: 0.5,
                        }} />
                        <div style={{
                          fontSize: 8, letterSpacing: '.16em',
                          color: s.color, marginBottom: 8,
                          fontFamily: 'var(--font-mono)',
                          display: 'flex', alignItems: 'center', gap: 6,
                        }}>
                          <span>{s.icon}</span>
                          {s.label}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--t2)', lineHeight: 1.65 }}>
                          {s.value}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Narrative clusters */}
                {storiesLoading ? (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {Array(4).fill(null).map((_, i) => <div key={i} className="sk" style={{ height: 80, borderRadius: 16 }} />)}
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 12 }}>
                    <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '.2em', color: 'var(--t3)' }}>
                      · Narrative Clusters · {storyClusters.length} active
                    </div>
                    {storyClusters.map(cluster => (
                      <StoryClusterPanel
                        key={cluster.label}
                        cluster={cluster}
                        driverSentiment={driverSentimentMap}
                        onDriverClick={handleDriverTagClick}
                      />
                    ))}
                    {storyClusters.length === 0 && (
                      <div style={{ padding: '32px', textAlign: 'center', border: '1px solid var(--b1)', borderRadius: 16, color: 'var(--t3)', fontSize: 12 }}>
                        No stories found. Pipeline may be paused.
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )}

            {/* ── DRIVERS / TEAMS TABS (Paddock Intelligence) ── */}
            {(mainTab === 'drivers' || mainTab === 'teams') && (
              <motion.div
                key="intelligence"
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
                style={{ display: 'grid', gap: 16 }}
              >
                {/* KPI row */}
                <div className="kpi-row">
                  {intelLoading ? Array(4).fill(null).map((_, i) => <div key={i} className="sk" style={{ height: 90, borderRadius: 20 }} />) : (
                    <>
                      <KpiCard label={intelTab === 'driver' ? 'TRACKED ENTITIES' : 'TRACKED CONSTRUCTORS'} value={enriched.length}                                                    color="#7c8aa8" />
                      <KpiCard label="MENTIONS IN WINDOW"                                                   value={totalMentions.toLocaleString()}                                     color="#f59e0b" />
                      <KpiCard label="POSITIVE SWING"                                                       value={enriched.filter(e => (e.sentimentDelta ?? 0) > 0.02).length}       color="#22c55e" sub="gaining tone" />
                      <KpiCard label="PRESSURE ACTIVE"                                                      value={enriched.filter(e => (e.controversyScore ?? 0) >= 35).length}      color="#ef4444" sub="watchlist" />
                    </>
                  )}
                </div>

                {/* Charts row */}
                <div className="row-2col-wide">
                  <motion.section className="card" whileHover={{ y: -2 }} transition={{ duration: 0.18 }}>
                    <SectionLabel>Momentum board · {days} day window</SectionLabel>
                    <MomentumBars entities={enriched} loading={intelLoading} />
                  </motion.section>
                  <motion.section className="card" whileHover={{ y: -2 }} transition={{ duration: 0.18 }}>
                    <SectionLabel>Trajectory · top 4</SectionLabel>
                    <OverlaidTrendChart entities={top4} seriesMap={tsMap} anomalyMap={anomalyMap} />
                  </motion.section>
                </div>

                {/* Table + detail pane */}
                <div className="row-main">
                  <motion.section className="card no-pad" layout>
                    <TableHead tab={intelTab} />
                    {intelLoading
                      ? Array(12).fill(null).map((_, i) => <RowSkeleton key={i} />)
                      : enriched.map((e, i) => (
                        <EntityRow
                          key={`${intelTab}-${e.driverName}`}
                          entity={e} rank={i + 1}
                          conRaw={cMap[e.driverName.toUpperCase()]}
                          trendSig={trendSigs[e.driverName]}
                          pred={predSignals.find(p => p.entityName === e.driverName)}
                          active={selected === e.driverName}
                          onSelect={() => setSelected(selected === e.driverName ? null : e.driverName)}
                        />
                      ))}
                    {!intelLoading && enriched.length === 0 && (
                      <div style={{ padding: '34px 20px', textAlign: 'center', color: 'var(--t2)', fontSize: 12 }}>No data yet.</div>
                    )}
                  </motion.section>
                  <aside className="detail-pane">
                    <AnimatePresence mode="wait" initial={false}>
                      {selEntity ? (
                        <motion.div key={selEntity.driverName} initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} transition={{ duration: 0.22 }}>
                          <EntityDetail
                            entity={selEntity} entityType={intelTab}
                            ts={detailTs.data} tsLoading={detailTs.loading}
                            conRaw={cMap[selEntity.driverName.toUpperCase()]}
                            sentProf={sentProfs[selEntity.driverName]}
                            conProf={conProfs[selEntity.driverName]}
                            trendSig={trendSigs[selEntity.driverName]}
                            anomalies={anomalyMap[selEntity.driverName] ?? []}
                            arc={storyArcs[selEntity.driverName]}
                            pred={predSignals.find(p => p.entityName === selEntity.driverName)}
                            section={detailSection} setSection={setDetailSection}
                            days={days} onClose={() => setSelected(null)}
                          />
                        </motion.div>
                      ) : (
                        <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                          <EmptyDetail />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </aside>
                </div>

                {/* Insights row */}
                <div className="row-insights">
                  <motion.section className="card" whileHover={{ y: -2 }} transition={{ duration: 0.18 }}>
                    <SectionLabel>Watchlist</SectionLabel>
                    <PredictiveSignalsViz signals={predSignals} />
                  </motion.section>
                  <motion.section className="card" whileHover={{ y: -2 }} transition={{ duration: 0.18 }}>
                    <SectionLabel>Pressure index</SectionLabel>
                    <ControversyViz entities={top8} profiles={conProfs} />
                  </motion.section>
                  <motion.section className="card" whileHover={{ y: -2 }} transition={{ duration: 0.18 }}>
                    <SectionLabel>Live anomalies</SectionLabel>
                    <AnomalyLog entities={top8} anomalyMap={anomalyMap} />
                  </motion.section>
                </div>

                {/* Bottom row */}
                <div className="row-bottom">
                  <motion.section className="card" whileHover={{ y: -2 }} transition={{ duration: 0.18 }}>
                    <SectionLabel>Correlation read</SectionLabel>
                    <CorrelationViz correlations={correlations} />
                  </motion.section>
                  <motion.section className="card" whileHover={{ y: -2 }} transition={{ duration: 0.18 }}>
                    <SectionLabel>Compare entities</SectionLabel>
                    <ComparisonTool
                      entities={enriched} compareA={compareA} compareB={compareB}
                      setCompareA={setCompareA} setCompareB={setCompareB} result={comparison}
                    />
                  </motion.section>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </div>
        <Footer />
      </div>
    </div>
  )
}

// ── CSS ───────────────────────────────────────────────────────────────────────

const CSS = `
  .pg{max-width:1440px;margin:0 auto;padding:24px 24px 88px;display:grid;gap:16px}
  .masthead{
    display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:26px;padding:28px;
    border:1px solid rgba(255,255,255,.08);border-radius:30px;
    background:
      radial-gradient(1000px 320px at 100% 0%, rgba(220,0,0,.12), transparent 42%),
      radial-gradient(520px 180px at 0% 0%, rgba(255,255,255,.05), transparent 40%),
      linear-gradient(180deg, rgba(255,255,255,.035), rgba(255,255,255,.012));
    box-shadow: inset 0 1px 0 rgba(255,255,255,.04), 0 24px 70px rgba(0,0,0,.30);
    backdrop-filter: blur(18px);
  }
  .masthead-left{display:flex;flex-direction:column;justify-content:space-between;gap:20px}
  .hero-stack{display:grid;gap:10px;max-width:760px}
  .masthead-title{font-family:var(--font-bebas);font-size:clamp(38px,5vw,72px);line-height:.92;letter-spacing:.05em;margin:0;color:var(--t1)}
  .masthead-copy{max-width:560px;margin:0;color:var(--t2);font-size:13px;line-height:1.8}
  .eyebrow{display:flex;align-items:center;gap:10px}
  .eyebrow .line{width:38px;height:1px;background:linear-gradient(90deg,var(--red),transparent)}
  .eyebrow span{font-size:9px;letter-spacing:.18em;color:var(--t3)}
  .tab-strip{display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding-top:14px;border-top:1px solid rgba(255,255,255,.08)}
  .tab-group{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
  .tab-divider{width:1px;height:20px;background:rgba(255,255,255,.08)}
  .tab-btn{padding:10px 14px;border-radius:999px;cursor:pointer;border:1px solid transparent;background:transparent;color:var(--t2);font-family:var(--font-mono);font-size:9px;letter-spacing:.14em;transition:all .18s;display:flex;align-items:center;gap:8px}
  .tab-btn:hover{background:rgba(255,255,255,.03);color:var(--t1);border-color:rgba(255,255,255,.08)}
  .tab-btn.on{background:rgba(255,255,255,.05);color:var(--t1);border-color:rgba(255,255,255,.12)}
  .tab-count{background:rgba(255,255,255,.05);color:var(--t3);padding:2px 7px;border-radius:999px;font-size:8px}
  .masthead-right{display:flex;flex-direction:column;justify-content:flex-end;gap:12px}
  .race-pill{display:flex;align-items:center;gap:12px;padding:14px;border-radius:18px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.025)}
  .race-flag{font-size:24px;line-height:1}
  .race-kicker{font-size:8px;letter-spacing:.15em;color:var(--t3);margin-bottom:2px}
  .race-sprint{margin-left:7px;color:#f59e0b}
  .race-name{font-family:var(--font-bebas);font-size:16px;line-height:1;letter-spacing:.06em;color:var(--t1)}
  .race-meta{font-size:9px;color:var(--t2);margin-top:2px}
  .headline-grid{display:grid;gap:10px}
  .headline-signal{display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:16px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.08);cursor:pointer;transition:all .18s;text-align:left}
  .headline-signal:hover{transform:translateY(-2px);background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.12)}
  .hs-label{font-size:8px;letter-spacing:.18em;color:var(--t3);min-width:54px}
  .hs-name{font-family:var(--font-bebas);font-size:14px;letter-spacing:.06em;flex:1}
  .hs-val{font-family:var(--font-mono);font-size:10px}
  .kpi-row{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
  .row-2col-wide{display:grid;grid-template-columns:1.15fr .95fr;gap:16px;align-items:start}
  .row-main{display:grid;grid-template-columns:minmax(0,1fr) 380px;gap:16px;align-items:start}
  .row-insights{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;align-items:start}
  .row-bottom{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}
  .card{border:1px solid rgba(255,255,255,.08);border-radius:24px;padding:18px 20px;background:linear-gradient(180deg,rgba(255,255,255,.03),rgba(255,255,255,.014));box-shadow:inset 0 1px 0 rgba(255,255,255,.04),0 18px 48px rgba(0,0,0,.22);backdrop-filter:blur(14px)}
  .card.no-pad{padding:0}
  .tbl-cols{grid-template-columns:28px 1fr 72px 88px 88px 50px 88px}
  .tbl-head{display:grid;gap:6px;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.018);font-size:8px;letter-spacing:.18em;color:var(--t3)}
  .tbl-row{display:grid;gap:6px;padding:11px 16px;align-items:center;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.05);border-left:2px solid transparent;transition:background .14s,border-color .14s}
  .tbl-row:hover{background:rgba(255,255,255,.025)}
  .tbl-row.on{background:linear-gradient(90deg,rgba(255,255,255,.045),rgba(255,255,255,.012))}
  .detail-pane{border:1px solid rgba(255,255,255,.08);border-radius:24px;position:sticky;top:calc(var(--header-h) + 18px);max-height:calc(100vh - var(--header-h) - 36px);overflow-y:auto;background:linear-gradient(180deg,rgba(255,255,255,.035),rgba(255,255,255,.014));box-shadow:inset 0 1px 0 rgba(255,255,255,.04),0 18px 48px rgba(0,0,0,.22);backdrop-filter:blur(16px)}
  .dtabs{display:flex;border-bottom:1px solid rgba(255,255,255,.07)}
  .dtab{flex:1;padding:11px 0;background:transparent;border:none;border-bottom:2px solid transparent;cursor:pointer;font-family:var(--font-mono);font-size:8px;letter-spacing:.14em;color:var(--t2);transition:all .15s}
  .dtab:hover{background:rgba(255,255,255,.02);color:var(--t1)}
  .dtab.on{color:var(--t1);border-bottom-color:var(--red)}
  .bdg{display:inline-flex;align-items:center;padding:3px 8px;border-radius:999px;font-size:8px;letter-spacing:.1em;border:1px solid transparent;white-space:nowrap}
  .sk{background:linear-gradient(90deg,var(--b1) 25%,rgba(255,255,255,.06) 50%,var(--b1) 75%);background-size:200% 100%;animation:sk 1.5s infinite;border-radius:8px}
  @keyframes sk{0%{background-position:200%}100%{background-position:-200%}}
  ::-webkit-scrollbar{width:6px;height:6px}
  ::-webkit-scrollbar-track{background:transparent}
  ::-webkit-scrollbar-thumb{background:rgba(255,255,255,.14);border-radius:999px}
  @media(max-width:1200px){.row-main,.row-2col-wide,.row-insights,.row-bottom{grid-template-columns:1fr!important}.detail-pane{position:static!important;max-height:none!important}}
  @media(max-width:920px){.kpi-row{grid-template-columns:1fr 1fr!important}.masthead{grid-template-columns:1fr!important}}
  @media(max-width:620px){.kpi-row,.row-insights,.row-bottom{grid-template-columns:1fr!important}.pg{padding:16px 14px 72px}.masthead{padding:20px 18px;border-radius:24px}.card,.detail-pane{border-radius:20px}.tab-strip{gap:10px}}
`