'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import Ticker from '@/components/Ticker'
import Footer from '@/components/Footer'
import BgCanvas from '@/components/BgCanvas'

// ── Types ─────────────────────────────────────────────────────────────────────

type DriverInfo = {
  driverId?: string
  givenName?: string
  familyName?: string
  permanentNumber?: string
  nationality?: string
  dateOfBirth?: string
}

type CareerStats = {
  races: number
  wins: number
  poles: number
  points: number
  seasons: number
  championships: number
  teams: string[]
}

type SeasonResult = {
  race: string
  round: string
  position: string
  points: string
  grid: string
  status: string
  constructor: string
  date: string
}

type CurrentSeason = {
  year: number
  races: number
  wins: number
  podiums: number
  points: number
  results: SeasonResult[]
}

type TimeseriesPoint = {
  date: string
  mentions: number
  sentimentAvg: number
  positiveCount: number
  negativeCount: number
  neutralCount: number
}

type SentimentSummary = {
  driverName?: string
  mentions?: number
  sentimentAvg?: number
  sentimentDelta?: number
  positive?: number
  neutral?: number
  negative?: number
  topCluster?: string
}

type Story = {
  story_id?: string | number
  story_title?: string
  is_breaking?: boolean
  best_priority_tier?: string
  momentum_score?: number
  latest_event_ts?: string
  latest_source?: string
  latest_url?: string
  url?: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TEAM_COLORS: Record<string, string> = {
  'Red Bull Racing': '#3671C6',
  Mercedes: '#27F4D2',
  Ferrari: '#E8002D',
  McLaren: '#FF8000',
  'Aston Martin': '#229971',
  Alpine: '#FF87BC',
  Williams: '#64C4FF',
  'Haas F1 Team': '#B6BABD',
  'Kick Sauber': '#52E252',
  RB: '#6692FF',
  'Racing Bulls': '#6692FF',
  Cadillac: '#CC0000',
  Audi: '#F50537',
}

function teamColorByName(name: string): string {
  if (!name) return '#888888'
  for (const [key, val] of Object.entries(TEAM_COLORS)) {
    if (name.toLowerCase().includes(key.toLowerCase())) return val
  }
  return '#888888'
}

const CDN = 'https://media.formula1.com/image/upload/c_fill,w_720/q_auto/d_common:f1:2026:fallback:driver:2026fallbackdriverright.webp/v1740000000/common/f1/2026'

const DRIVER_IMAGES: Record<string, string> = {
  albon:      `${CDN}/williams/alealb01/2026williamsalealb01right.webp`,
  alonso:     `${CDN}/astonmartin/feralo01/2026astonmartinferalo01right.webp`,
  antonelli:  `${CDN}/mercedes/andant01/2026mercedesandant01right.webp`,
  bearman:    `${CDN}/haasf1team/olibea01/2026haasf1teamolibea01right.webp`,
  bottas:     `${CDN}/cadillac/valbot01/2026cadillacvalbot01right.webp`,
  colapinto:  `${CDN}/alpine/fracol01/2026alpinefracol01right.webp`,
  gasly:      `${CDN}/alpine/piegas01/2026alpinepiegas01right.webp`,
  hadjar:     `${CDN}/redbullracing/isahad01/2026redbullracingisahad01right.webp`,
  hamilton:   `${CDN}/ferrari/lewham01/2026ferrarilewham01right.webp`,
  hulkenberg: `${CDN}/audi/nichul01/2026audinichul01right.webp`,
  lawson:     `${CDN}/racingbulls/lialaw01/2026racingbullslialaw01right.webp`,
  leclerc:    `${CDN}/ferrari/chalec01/2026ferrarichalec01right.webp`,
  norris:     `${CDN}/mclaren/lannor01/2026mclarenlannor01right.webp`,
  ocon:       `${CDN}/haasf1team/estoco01/2026haasf1teamestoco01right.webp`,
  piastri:    `${CDN}/mclaren/oscpia01/2026mclarenoscpia01right.webp`,
  russell:    `${CDN}/mercedes/georus01/2026mercedesgeorus01right.webp`,
  sainz:      `${CDN}/williams/carsai01/2026williamscarsai01right.webp`,
  stroll:     `${CDN}/astonmartin/lanstr01/2026astonmartinlanstr01right.webp`,
  tsunoda:    `${CDN}/racingbulls/yuktsu01/2026racingbullsyuktsu01right.webp`,
  verstappen: `${CDN}/redbullracing/maxver01/2026redbullracingmaxver01right.webp`,
  bortoleto:  `${CDN}/audi/gabbor01/2026audigabbor01right.webp`,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeNum(v: unknown, fallback = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function timeAgo(value: string) {
  const d = new Date(value)
  if (isNaN(d.getTime())) return value
  const diffMs = Date.now() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  return `${Math.floor(diffHr / 24)}d ago`
}

function positionColor(pos: string) {
  const n = parseInt(pos)
  if (n === 1) return '#F59E0B'
  if (n <= 3) return '#CD7F32'
  if (n <= 10) return '#27F4D2'
  return 'var(--t3)'
}

function positionBg(pos: string) {
  const n = parseInt(pos)
  if (n === 1) return 'rgba(245,158,11,.15)'
  if (n <= 3) return 'rgba(205,127,50,.12)'
  if (n <= 10) return 'rgba(39,244,210,.08)'
  return 'rgba(255,255,255,.04)'
}

function getSourceType(source?: string) {
  const s = String(source ?? '').toLowerCase()
  if (s.includes('reddit')) return 'reddit'
  if (s.includes('fia') || s.includes('official')) return 'official'
  return 'news'
}

function inferNarrative(title: string) {
  const t = title.toLowerCase()
  if (t.includes('pole') || t.includes('qualifying')) return 'Qualifying'
  if (t.includes('win') || t.includes('victory') || t.includes('podium')) return 'Race Result'
  if (t.includes('championship') || t.includes('title') || t.includes('rival')) return 'Championship'
  if (t.includes('upgrade') || t.includes('car') || t.includes('engine')) return 'Technical'
  if (t.includes('contract') || t.includes('team') || t.includes('seat')) return 'Team News'
  return 'Coverage'
}

function dedupeStories(stories: Story[]): Story[] {
  const seen = new Set<string>()
  return stories.filter(s => {
    const title = (s.story_title ?? '').toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim()
    // Use first 60 chars as fingerprint to catch near-duplicates with slightly different endings
    const key = title.slice(0, 60)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function storyHref(story: Story): string | null {
  return story.latest_url ?? story.url ?? null
}

// ── SVG Sentiment Chart ───────────────────────────────────────────────────────

function SentimentChart({
  data,
  color,
  loading,
}: {
  data: TimeseriesPoint[]
  color: string
  loading: boolean
}) {
  const W = 600
  const H = 120
  const PADDING = { top: 12, bottom: 20, left: 8, right: 8 }

  const sorted = useMemo(
    () => [...data].sort((a, b) => a.date.localeCompare(b.date)),
    [data]
  )

  if (loading) {
    return (
      <div style={{ height: H + 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 9,
          letterSpacing: '.2em', color: 'var(--t3)',
        }}>
          LOADING SIGNAL...
        </div>
      </div>
    )
  }

  if (sorted.length < 2) {
    return (
      <div style={{ height: H + 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--t3)' }}>
          INSUFFICIENT DATA
        </div>
      </div>
    )
  }

  const sentVals = sorted.map(d => d.sentimentAvg)
  const menVals  = sorted.map(d => d.mentions)
  const sMin = Math.min(...sentVals)
  const sMax = Math.max(...sentVals)
  const sRange = Math.max(sMax - sMin, 0.001)
  const mMax = Math.max(...menVals, 1)

  const chartW = W - PADDING.left - PADDING.right
  const chartH = H - PADDING.top - PADDING.bottom

  const sx = (i: number) => PADDING.left + (i / (sorted.length - 1)) * chartW
  const sy = (v: number) => PADDING.top + chartH - ((v - sMin) / sRange) * chartH

  const sentPath = sorted
    .map((d, i) => `${i === 0 ? 'M' : 'L'}${sx(i).toFixed(1)},${sy(d.sentimentAvg).toFixed(1)}`)
    .join(' ')

  const areaPath = `${sentPath} L${sx(sorted.length - 1).toFixed(1)},${(PADDING.top + chartH).toFixed(1)} L${PADDING.left.toFixed(1)},${(PADDING.top + chartH).toFixed(1)} Z`

  // Zero line
  const zeroY = sy(0)
  const showZero = zeroY > PADDING.top && zeroY < PADDING.top + chartH

  // Last value
  const lastVal = sentVals[sentVals.length - 1]
  const lastX = sx(sorted.length - 1)
  const lastY = sy(lastVal)

  // Date labels — first and last
  const firstDate = new Date(sorted[0].date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  const lastDate  = new Date(sorted[sorted.length - 1].date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

  return (
    <div>
      <svg
        width="100%"
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ overflow: 'visible' }}
      >
        <defs>
          <linearGradient id={`sg-${color.replace('#', '')}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
          {/* Negative gradient */}
          <linearGradient id={`sg-neg-${color.replace('#', '')}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#E10600" stopOpacity="0.02" />
            <stop offset="100%" stopColor="#E10600" stopOpacity="0.18" />
          </linearGradient>
        </defs>

        {/* Zero baseline */}
        {showZero && (
          <line
            x1={PADDING.left} y1={zeroY}
            x2={W - PADDING.right} y2={zeroY}
            stroke="rgba(255,255,255,.12)"
            strokeDasharray="3 4"
            strokeWidth="1"
          />
        )}

        {/* Area fill */}
        <path d={areaPath} fill={`url(#sg-${color.replace('#', '')})`} />

        {/* Mention volume as subtle background bars */}
        {sorted.map((d, i) => {
          const barH = (d.mentions / mMax) * (chartH * 0.3)
          const barW = Math.max(2, (chartW / sorted.length) * 0.6)
          return (
            <rect
              key={i}
              x={sx(i) - barW / 2}
              y={PADDING.top + chartH - barH}
              width={barW}
              height={barH}
              fill={color}
              opacity={0.08}
              rx={1}
            />
          )
        })}

        {/* Main line */}
        <path
          d={sentPath}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Dots at key points */}
        {sorted.map((d, i) => {
          const isFirst = i === 0
          const isLast = i === sorted.length - 1
          const isPeak = d.sentimentAvg === sMax && !isFirst && !isLast
          const isValley = d.sentimentAvg === sMin && !isFirst && !isLast
          if (!isFirst && !isLast && !isPeak && !isValley) return null
          const dotColor = isPeak ? '#4ADE80' : isValley ? '#E10600' : color
          return (
            <circle
              key={i}
              cx={sx(i)}
              cy={sy(d.sentimentAvg)}
              r={isLast ? 4 : 3}
              fill={dotColor}
              stroke="rgba(0,0,0,.6)"
              strokeWidth="1.5"
            />
          )
        })}

        {/* Last value label */}
        <text
          x={lastX + 8}
          y={lastY + 4}
          fill={lastVal >= 0 ? '#4ADE80' : '#E10600'}
          fontSize="10"
          fontFamily="var(--font-mono)"
        >
          {lastVal >= 0 ? '+' : ''}{lastVal.toFixed(3)}
        </text>
      </svg>

      {/* X axis labels */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginTop: 4,
        paddingLeft: PADDING.left,
        paddingRight: PADDING.right,
      }}>
        <span style={{ fontSize: 9, color: 'var(--t3)', fontFamily: 'var(--font-mono)' }}>
          {firstDate}
        </span>
        <span style={{ fontSize: 9, color: 'var(--t3)', fontFamily: 'var(--font-mono)' }}>
          {lastDate}
        </span>
      </div>
    </div>
  )
}

// ── Race result tiles ─────────────────────────────────────────────────────────

function ResultTiles({ results }: { results: SeasonResult[] }) {
  if (!results?.length) return (
    <div style={{ fontSize: 11, color: 'var(--t3)', fontFamily: 'var(--font-mono)' }}>
      No results yet
    </div>
  )

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {results.map((r, i) => {
        const n = parseInt(r.position)
        const valid = Number.isFinite(n)
        return (
          <div key={i} style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
          }}>
            <div style={{
              width: 44, height: 44,
              borderRadius: 10,
              border: `1px solid ${valid ? positionColor(r.position) : 'var(--b1)'}44`,
              background: valid ? positionBg(r.position) : 'rgba(255,255,255,.03)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-bebas)',
              fontSize: valid ? 20 : 14,
              color: valid ? positionColor(r.position) : 'var(--t3)',
              letterSpacing: '.02em',
            }}>
              {valid ? `P${n}` : 'DNF'}
            </div>
            <div style={{
              fontSize: 8, color: 'var(--t3)',
              fontFamily: 'var(--font-mono)',
              textAlign: 'center',
              maxWidth: 44,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {r.race.replace(' Grand Prix', '').replace(' GP', '')}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Career stat strip ─────────────────────────────────────────────────────────

function CareerStrip({ career, color }: { career: CareerStats; color: string }) {
  const stats = [
    { label: 'RACES',   value: career.races,   accent: color },
    { label: 'WINS',    value: career.wins,    accent: '#F59E0B' },
    { label: 'POLES',   value: career.poles,   accent: '#A78BFA' },
    { label: 'POINTS',  value: career.points.toLocaleString(), accent: color },
    { label: 'SEASONS', value: career.seasons, accent: 'var(--t2)' },
    { label: 'TITLES',  value: career.championships, accent: '#F59E0B' },
  ]

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${stats.length}, 1fr)`,
      borderRadius: 16,
      overflow: 'hidden',
      border: '1px solid var(--b1)',
    }}>
      {stats.map((s, i) => (
        <div key={s.label} style={{
          padding: '18px 16px',
          background: i % 2 === 0 ? 'rgba(255,255,255,.02)' : 'rgba(0,0,0,.2)',
          borderRight: i < stats.length - 1 ? '1px solid var(--b1)' : 'none',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Accent top bar */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0,
            height: 2, background: s.accent, opacity: 0.7,
          }} />
          <div style={{
            fontSize: 8, letterSpacing: '.18em',
            color: 'var(--t3)', marginBottom: 8,
          }}>
            {s.label}
          </div>
          <div style={{
            fontFamily: 'var(--font-bebas)',
            fontSize: 32, lineHeight: 1,
            color: s.accent,
          }}>
            {s.value}
          </div>
          {/* Win rate for wins */}
          {s.label === 'WINS' && career.races > 0 && (
            <div style={{
              fontSize: 9, color: 'var(--t3)',
              marginTop: 4,
            }}>
              {((career.wins / career.races) * 100).toFixed(1)}% rate
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Readable cluster labels ───────────────────────────────────────────────────

function readableCluster(cluster: string): string {
  const map: Record<string, string> = {
    DRIVER_NEWS:   'Driver News',
    TEAM_NEWS:     'Team News',
    RACE_RESULT:   'Race Result',
    QUALIFYING:    'Qualifying',
    TECHNICAL:     'Technical',
    GENERAL_F1:    'General F1',
    CHAMPIONSHIP:  'Championship',
    REGULATION:    'Regulation',
    FIA:           'FIA / Stewards',
    TRANSFERS:     'Driver Market',
    RACE_PACE:     'Race Pace',
    STRATEGY:      'Strategy',
  }
  return map[cluster] ?? cluster.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// ── Story card ────────────────────────────────────────────────────────────────

function StoryCard({ story, color }: { story: Story; color: string }) {
  const srcType = getSourceType(story.latest_source)
  const srcColor = srcType === 'reddit' ? '#FF6314' : srcType === 'official' ? '#27F4D2' : 'var(--blue)'
  const narrative = inferNarrative(story.story_title ?? '')
  const momentum = Math.min(100, safeNum(story.momentum_score))
  const time = story.latest_event_ts ? timeAgo(story.latest_event_ts) : '—'
  const isBreaking = story.is_breaking
  const href = story.latest_url ?? story.url ?? null

  const inner = (
    <div style={{
      border: `1px solid ${isBreaking ? 'rgba(225,6,0,.35)' : 'var(--b1)'}`,
      borderRadius: 14,
      background: isBreaking ? 'rgba(225,6,0,.04)' : 'rgba(255,255,255,.018)',
      padding: '14px 16px',
      display: 'flex', flexDirection: 'column', gap: 10,
      position: 'relative', overflow: 'hidden',
      minHeight: 110,
      cursor: href ? 'pointer' : 'default',
      transition: 'border-color .15s ease',
    }}>
      {/* Left accent */}
      <div style={{
        position: 'absolute', top: 0, left: 0, bottom: 0,
        width: 2,
        background: isBreaking ? 'var(--red)' : color,
        opacity: 0.7,
      }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 10 }}>
        <span style={{
          fontSize: 8, color: color,
          fontFamily: 'var(--font-mono)', letterSpacing: '.12em',
          background: `${color}15`, padding: '2px 7px', borderRadius: 4,
          border: `1px solid ${color}30`,
        }}>
          {narrative.toUpperCase()}
        </span>
        <span style={{
          fontSize: 8, color: srcColor,
          fontFamily: 'var(--font-mono)', letterSpacing: '.1em',
          background: `${srcColor}12`, padding: '2px 7px', borderRadius: 4,
          border: `1px solid ${srcColor}30`,
        }}>
          {srcType.toUpperCase()}
        </span>
        {isBreaking && (
          <span style={{
            fontSize: 8, color: 'var(--red)',
            fontFamily: 'var(--font-mono)', letterSpacing: '.1em',
            background: 'rgba(225,6,0,.1)', padding: '2px 7px', borderRadius: 4,
            border: '1px solid rgba(225,6,0,.35)',
          }}>
            BREAKING
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--t3)' }}>{time}</span>
      </div>

      <div style={{
        fontSize: 12.5, color: 'var(--t1)',
        lineHeight: 1.5, paddingLeft: 10, paddingRight: 6,
        display: '-webkit-box',
        WebkitLineClamp: 3,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      } as CSSProperties}>
        {story.story_title}
        {href && (
          <span style={{ marginLeft: 5, fontSize: 10, color, opacity: 0.6 }}>↗</span>
        )}
      </div>

      <div style={{
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between',
        paddingLeft: 10, marginTop: 'auto',
      }}>
        <span style={{ fontSize: 9, color: 'var(--t3)' }}>{story.latest_source}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 40, height: 2, background: 'var(--b1)', borderRadius: 2 }}>
            <div style={{
              height: '100%', width: `${momentum}%`,
              background: isBreaking ? 'var(--red)' : color,
              borderRadius: 2,
            }} />
          </div>
          <span style={{ fontSize: 8, color: 'var(--t3)', fontFamily: 'var(--font-mono)' }}>
            {momentum}
          </span>
        </div>
      </div>
    </div>
  )

  if (!href) return inner

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
    >
      {inner}
    </a>
  )
}

// ── Coverage Intelligence ─────────────────────────────────────────────────────

type NarrativeCluster = {
    label: string
    stories: Story[]
    avgMomentum: number
    srcCounts: Record<string, number>
  }
  
  function buildClusters(stories: Story[]): NarrativeCluster[] {
    const map = new Map<string, Story[]>()
    for (const s of stories) {
      const label = inferNarrative(s.story_title ?? '')
      if (!map.has(label)) map.set(label, [])
      map.get(label)!.push(s)
    }
    return Array.from(map.entries())
      .map(([label, clusterStories]) => {
        const sorted = [...clusterStories].sort(
          (a, b) => safeNum(b.momentum_score) - safeNum(a.momentum_score)
        )
        const avgMomentum = Math.round(
          clusterStories.reduce((s, st) => s + safeNum(st.momentum_score), 0) /
          clusterStories.length
        )
        const srcCounts: Record<string, number> = {}
        for (const st of clusterStories) {
          const t = getSourceType(st.latest_source)
          srcCounts[t] = (srcCounts[t] ?? 0) + 1
        }
        return { label, stories: sorted, avgMomentum, srcCounts }
      })
      .sort((a, b) => {
        if (b.stories.length !== a.stories.length) return b.stories.length - a.stories.length
        return b.avgMomentum - a.avgMomentum
      })
  }
  
  function FeaturedStory({ story, color }: { story: Story; color: string }) {
    const href = story.latest_url ?? story.url ?? null
    const srcType = getSourceType(story.latest_source)
    const srcColor = srcType === 'reddit' ? '#FF6314' : srcType === 'official' ? '#27F4D2' : 'var(--blue)'
    const time = story.latest_event_ts ? timeAgo(story.latest_event_ts) : '—'
    const momentum = Math.min(100, safeNum(story.momentum_score))
    const narrative = inferNarrative(story.story_title ?? '')
  
    const inner = (
      <div style={{
        border: `1px solid ${color}40`,
        borderRadius: 18,
        background: `linear-gradient(135deg, ${color}10, rgba(0,0,0,.4))`,
        padding: '24px 28px',
        position: 'relative',
        overflow: 'hidden',
        cursor: href ? 'pointer' : 'default',
      }}>
        {/* Ambient glow */}
        <div style={{
          position: 'absolute', top: -40, right: -40,
          width: 220, height: 220, borderRadius: '50%',
          background: `radial-gradient(circle, ${color}15, transparent 65%)`,
          pointerEvents: 'none',
        }} />
        {/* Top accent */}
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
          }}>
            LEAD STORY
          </span>
          <span style={{
            padding: '3px 9px', borderRadius: 5,
            background: `${color}15`,
            border: `1px solid ${color}30`,
            fontSize: 8, color,
            fontFamily: 'var(--font-mono)', letterSpacing: '.12em',
          }}>
            {narrative.toUpperCase()}
          </span>
          <span style={{
            padding: '3px 9px', borderRadius: 5,
            background: `${srcColor}10`,
            border: `1px solid ${srcColor}30`,
            fontSize: 8, color: srcColor,
            fontFamily: 'var(--font-mono)', letterSpacing: '.1em',
          }}>
            {srcType.toUpperCase()}
          </span>
          <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--t3)' }}>{time}</span>
        </div>
  
        <div style={{
          fontSize: 18, lineHeight: 1.45,
          color: 'var(--t1)', marginBottom: 16,
          maxWidth: 760, position: 'relative', zIndex: 1,
        }}>
          {story.story_title}
          {href && <span style={{ marginLeft: 8, fontSize: 13, color, opacity: 0.6 }}>↗</span>}
        </div>
  
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 10, color: 'var(--t3)' }}>{story.latest_source}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 8, color: 'var(--t3)', fontFamily: 'var(--font-mono)' }}>
              MOMENTUM
            </span>
            <div style={{ width: 60, height: 2, background: 'var(--b1)', borderRadius: 2 }}>
              <div style={{
                height: '100%', width: `${momentum}%`,
                background: color, borderRadius: 2,
              }} />
            </div>
            <span style={{ fontSize: 8, color, fontFamily: 'var(--font-mono)' }}>{momentum}</span>
          </div>
        </div>
      </div>
    )
  
    if (!href) return inner
    return (
      <a href={href} target="_blank" rel="noopener noreferrer"
        style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
        {inner}
      </a>
    )
  }
  
  function ClusterSection({
    cluster,
    color,
  }: {
    cluster: NarrativeCluster
    color: string
  }) {
    const [expanded, setExpanded] = useState(false)
    const lead = cluster.stories[0]
    const rest = cluster.stories.slice(1)
    const srcColor = (src: string) =>
      src === 'reddit' ? '#FF6314' : src === 'official' ? '#27F4D2' : 'var(--blue)'
  
    return (
      <div style={{
        border: '1px solid var(--b1)',
        borderRadius: 16,
        overflow: 'hidden',
        background: 'rgba(0,0,0,.2)',
      }}>
        {/* Cluster header */}
        <div style={{
          padding: '14px 18px',
          borderBottom: '1px solid var(--b1)',
          background: 'rgba(255,255,255,.02)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{
            width: 3, height: 16, borderRadius: 2,
            background: color, flexShrink: 0,
          }} />
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 10,
            color, letterSpacing: '.12em',
          }}>
            {cluster.label.toUpperCase()}
          </span>
          <span style={{
            fontSize: 9, color: 'var(--t3)',
            fontFamily: 'var(--font-mono)',
          }}>
            {cluster.stories.length} {cluster.stories.length === 1 ? 'story' : 'stories'}
          </span>
  
          {/* Source pills */}
          <div style={{ display: 'flex', gap: 5 }}>
            {Object.entries(cluster.srcCounts).map(([src, count]) => (
              <span key={src} style={{
                padding: '1px 6px', borderRadius: 3,
                fontSize: 7, color: srcColor(src),
                background: `${srcColor(src)}12`,
                border: `1px solid ${srcColor(src)}25`,
                fontFamily: 'var(--font-mono)',
              }}>
                {src} {count}
              </span>
            ))}
          </div>
  
          {/* Momentum */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 36, height: 2, background: 'var(--b1)', borderRadius: 2 }}>
              <div style={{
                height: '100%',
                width: `${Math.min(100, cluster.avgMomentum)}%`,
                background: color, borderRadius: 2,
              }} />
            </div>
            <span style={{ fontSize: 8, color: 'var(--t3)', fontFamily: 'var(--font-mono)' }}>
              {cluster.avgMomentum}
            </span>
          </div>
        </div>
  
        {/* Lead story */}
        {lead && <LeadRow story={lead} color={color} />}
  
        {/* Expandable rest */}
        {rest.length > 0 && (
          <>
            {expanded && rest.map((s, i) => (
              <LeadRow key={s.story_id ?? i} story={s} color={color} dim />
            ))}
            <button
              onClick={() => setExpanded(e => !e)}
              style={{
                width: '100%', padding: '10px 18px',
                background: 'transparent',
                border: 'none', borderTop: '1px solid var(--b1)',
                color: 'var(--t3)', cursor: 'pointer',
                fontSize: 9, fontFamily: 'var(--font-mono)',
                letterSpacing: '.12em', textAlign: 'left',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <span style={{
                display: 'inline-block',
                transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform .2s ease',
              }}>›</span>
              {expanded ? 'SHOW LESS' : `${rest.length} MORE ${rest.length === 1 ? 'STORY' : 'STORIES'}`}
            </button>
          </>
        )}
      </div>
    )
  }
  
  function LeadRow({ story, color, dim }: { story: Story; color: string; dim?: boolean }) {
    const href = story.latest_url ?? story.url ?? null
    const srcType = getSourceType(story.latest_source)
    const srcColor = srcType === 'reddit' ? '#FF6314' : srcType === 'official' ? '#27F4D2' : 'var(--blue)'
    const time = story.latest_event_ts ? timeAgo(story.latest_event_ts) : '—'
    const momentum = Math.min(100, safeNum(story.momentum_score))
  
    const inner = (
      <div style={{
        padding: '12px 18px',
        borderBottom: '1px solid var(--b1)',
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: 16, alignItems: 'center',
        background: dim ? 'transparent' : 'rgba(255,255,255,.015)',
        cursor: href ? 'pointer' : 'default',
        opacity: dim ? 0.75 : 1,
        transition: 'opacity .15s',
      }}>
        <div>
          <div style={{
            fontSize: 12.5, color: 'var(--t1)',
            lineHeight: 1.45, marginBottom: 5,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          } as React.CSSProperties}>
            {story.story_title}
            {href && <span style={{ marginLeft: 5, fontSize: 10, color, opacity: 0.5 }}>↗</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              fontSize: 8, color: srcColor,
              fontFamily: 'var(--font-mono)',
              background: `${srcColor}10`,
              padding: '1px 6px', borderRadius: 3,
              border: `1px solid ${srcColor}25`,
            }}>
              {srcType.toUpperCase()}
            </span>
            <span style={{ fontSize: 9, color: 'var(--t3)' }}>{story.latest_source}</span>
            <span style={{ fontSize: 9, color: 'var(--t3)' }}>{time}</span>
            {story.is_breaking && (
              <span style={{
                fontSize: 8, color: 'var(--red)',
                fontFamily: 'var(--font-mono)',
                background: 'rgba(225,6,0,.08)',
                padding: '1px 6px', borderRadius: 3,
                border: '1px solid rgba(225,6,0,.3)',
              }}>
                BREAKING
              </span>
            )}
          </div>
        </div>
        {/* Momentum bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
          <div style={{ width: 32, height: 2, background: 'var(--b1)', borderRadius: 2 }}>
            <div style={{
              height: '100%', width: `${momentum}%`,
              background: story.is_breaking ? 'var(--red)' : color,
              borderRadius: 2,
            }} />
          </div>
          <span style={{
            fontSize: 8, color: 'var(--t3)',
            fontFamily: 'var(--font-mono)', minWidth: 20,
          }}>
            {momentum}
          </span>
        </div>
      </div>
    )
  
    if (!href) return inner
    return (
      <a href={href} target="_blank" rel="noopener noreferrer"
        style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
        {inner}
      </a>
    )
  }
  
  function CoverageIntelligence({
    stories,
    timeseries,
    color,
  }: {
    stories: Story[]
    timeseries: TimeseriesPoint[]
    color: string
  }) {
    const now = Date.now()
    const sevenDays = 7 * 24 * 60 * 60 * 1000
  
    // Velocity
    const recent7 = timeseries.filter(d => now - new Date(d.date).getTime() <= sevenDays)
    const prev7   = timeseries.filter(d => {
      const age = now - new Date(d.date).getTime()
      return age > sevenDays && age <= sevenDays * 2
    })
    const recentMentions = recent7.reduce((s, d) => s + d.mentions, 0)
    const prevMentions   = prev7.reduce((s, d) => s + d.mentions, 0)
    const velocityPct    = prevMentions > 0
      ? Math.round(((recentMentions - prevMentions) / prevMentions) * 100)
      : null
    const velocityDir   = velocityPct === null ? 'flat' : velocityPct > 5 ? 'up' : velocityPct < -5 ? 'down' : 'flat'
    const velocityColor = velocityDir === 'up' ? '#4ADE80' : velocityDir === 'down' ? '#E10600' : 'var(--t3)'
  
    // Clamp velocity display — -100% reads as broken when pipeline is paused
    const velocityDisplay = velocityPct === null ? '—'
      : velocityPct <= -99 ? '— (no recent data)'
      : `${velocityPct > 0 ? '+' : ''}${velocityPct}%`
  
    // Source breakdown
    const srcCounts = { news: 0, reddit: 0, official: 0 }
    for (const s of stories) {
      const t = getSourceType(s.latest_source) as keyof typeof srcCounts
      srcCounts[t] = (srcCounts[t] ?? 0) + 1
    }
    const total = stories.length || 1
  
    // Story timeline by day
    const byDay = new Map<string, number>()
    for (const s of stories) {
      if (!s.latest_event_ts) continue
      const day = s.latest_event_ts.slice(0, 10)
      byDay.set(day, (byDay.get(day) ?? 0) + 1)
    }
    const timelineDays = Array.from(byDay.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-14)
    const maxDayCount = Math.max(...timelineDays.map(d => d[1]), 1)
  
    // Featured story — highest momentum overall
    const featuredStory = [...stories].sort(
      (a, b) => safeNum(b.momentum_score) - safeNum(a.momentum_score)
    )[0]
  
    // Narrative clusters — exclude featured story to avoid duplication
    const remainingStories = stories.filter(
      s => s.story_id !== featuredStory?.story_id
    )
    const clusters = buildClusters(remainingStories)
  
    return (
      <div style={{ display: 'grid', gap: 22 }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{
            fontSize: 9, fontFamily: 'var(--font-mono)',
            letterSpacing: '.2em', color: 'var(--t3)',
          }}>
            · Coverage Intelligence · {stories.length} stories
          </div>
          {clusters.length > 0 && (
            <span style={{
              fontSize: 9, fontFamily: 'var(--font-mono)',
              color: 'var(--t3)',
            }}>
              {clusters.length} narrative clusters
            </span>
          )}
        </div>
  
        {/* ── Metrics row ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 14 }}>
  
          {/* Velocity */}
          <div style={{
            border: '1px solid var(--b1)', borderRadius: 16,
            background: 'rgba(0,0,0,.24)', padding: '16px 18px',
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ fontSize: 8, letterSpacing: '.16em', color: 'var(--t3)', marginBottom: 10 }}>
              COVERAGE VELOCITY
            </div>
            <div style={{
              fontFamily: velocityPct !== null && Math.abs(velocityPct) < 99 ? 'var(--font-bebas)' : 'var(--font-mono)',
              fontSize: velocityPct !== null && Math.abs(velocityPct) < 99 ? 42 : 13,
              lineHeight: 1, color: velocityColor,
            }}>
              {velocityDisplay}
            </div>
            <div style={{
              fontSize: 9, fontFamily: 'var(--font-mono)',
              color: velocityColor, marginTop: 4, letterSpacing: '.08em',
            }}>
              {velocityDir === 'up' ? '↑ more coverage this week'
                : velocityDir === 'down' && velocityPct !== null && velocityPct > -99 ? '↓ coverage declining'
                : velocityPct === null || velocityPct <= -99 ? 'pipeline data pending'
                : '→ steady coverage'}
            </div>
            <div style={{ fontSize: 8, color: 'var(--t3)', marginTop: 6 }}>
              {recentMentions} mentions last 7d
              {prevMentions > 0 && velocityPct !== null && velocityPct > -99 && ` vs ${prevMentions} prior`}
            </div>
            <div style={{
              position: 'absolute', bottom: -20, right: -20,
              width: 80, height: 80, borderRadius: '50%',
              background: `radial-gradient(circle, ${velocityColor}20, transparent 70%)`,
              pointerEvents: 'none',
            }} />
          </div>
  
          {/* Source breakdown */}
          <div style={{
            border: '1px solid var(--b1)', borderRadius: 16,
            background: 'rgba(0,0,0,.24)', padding: '16px 18px',
          }}>
            <div style={{ fontSize: 8, letterSpacing: '.16em', color: 'var(--t3)', marginBottom: 14 }}>
              SOURCE MIX
            </div>
            <div style={{
              height: 8, borderRadius: 4, overflow: 'hidden',
              display: 'flex', gap: 1, marginBottom: 12,
              background: 'var(--b1)',
            }}>
              {srcCounts.news > 0 && (
                <div style={{ width: `${(srcCounts.news / total) * 100}%`, background: 'var(--blue)' }} />
              )}
              {srcCounts.reddit > 0 && (
                <div style={{ width: `${(srcCounts.reddit / total) * 100}%`, background: '#FF6314' }} />
              )}
              {srcCounts.official > 0 && (
                <div style={{ width: `${(srcCounts.official / total) * 100}%`, background: '#27F4D2' }} />
              )}
            </div>
            <div style={{ display: 'grid', gap: 7 }}>
              {[
                { l: 'News',     v: srcCounts.news,     c: 'var(--blue)' },
                { l: 'Reddit',   v: srcCounts.reddit,   c: '#FF6314' },
                { l: 'Official', v: srcCounts.official, c: '#27F4D2' },
              ].filter(s => s.v > 0).map(s => {
                const pct = Math.round((s.v / total) * 100)
                return (
                  <div key={s.l} style={{
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 6, height: 6, borderRadius: 2, background: s.c }} />
                      <span style={{ fontSize: 9, color: 'var(--t2)' }}>{s.l}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 40, height: 2, background: 'var(--b1)', borderRadius: 2 }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: s.c, borderRadius: 2 }} />
                      </div>
                      <span style={{
                        fontSize: 9, color: s.c,
                        fontFamily: 'var(--font-mono)', minWidth: 20, textAlign: 'right',
                      }}>
                        {s.v}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
  
          {/* Story timeline */}
          <div style={{
            border: '1px solid var(--b1)', borderRadius: 16,
            background: 'rgba(0,0,0,.24)', padding: '16px 18px',
          }}>
            <div style={{ fontSize: 8, letterSpacing: '.16em', color: 'var(--t3)', marginBottom: 14 }}>
              COVERAGE TIMELINE · LAST 14 DAYS
            </div>
            {timelineDays.length > 0 ? (
              <>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 48 }}>
                  {timelineDays.map(([day, count]) => {
                    const h = Math.max(4, (count / maxDayCount) * 48)
                    const isToday = day === new Date().toISOString().slice(0, 10)
                    return (
                      <div
                        key={day}
                        title={`${new Date(day + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}: ${count} stories`}
                        style={{
                          flex: 1, height: h, borderRadius: 3,
                          background: isToday ? color : `${color}55`,
                          minWidth: 6,
                        }}
                      />
                    )
                  })}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                  {[0, Math.floor(timelineDays.length / 2), timelineDays.length - 1]
                    .filter(i => timelineDays[i])
                    .map((i, idx) => (
                      <span key={`${i}-${idx}`} style={{
                        fontSize: 8, color: 'var(--t3)',
                        fontFamily: 'var(--font-mono)',
                      }}>
                        {new Date(timelineDays[i][0] + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </span>
                    ))}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 11, color: 'var(--t3)' }}>No timeline data</div>
            )}
          </div>
        </div>
  
        {/* ── Featured story ── */}
        {featuredStory && (
          <FeaturedStory story={featuredStory} color={color} />
        )}
  
        {/* ── Narrative clusters ── */}
        {clusters.length > 0 && (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{
              fontSize: 8, letterSpacing: '.16em',
              color: 'var(--t3)',
            }}>
              NARRATIVE CLUSTERS
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {clusters.map(cluster => (
                <ClusterSection
                  key={cluster.label}
                  cluster={cluster}
                  color={color}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DriverProfilePage() {
  const params = useParams()
  const driverId = params?.driverId as string

  const [racing, setRacing]       = useState<any>(null)
  const [sentiment, setSentiment] = useState<SentimentSummary | null>(null)
  const [timeseries, setTimeseries] = useState<TimeseriesPoint[]>([])
  const [stories, setStories]     = useState<Story[]>([])
  const [loading, setLoading]     = useState(true)
  const [tsLoading, setTsLoading] = useState(true)
  const [imgFailed, setImgFailed] = useState(false)

  useEffect(() => {
    if (!driverId) return
    let mounted = true
    setLoading(true)
    setTsLoading(true)
    setImgFailed(false)

    async function load() {
      try {
        // Step 1: get racing data and driver name
        const racingRes  = await fetch(`/api/racing/driver/${driverId}`)
        const racingData = racingRes.ok ? await racingRes.json() : null
        if (!mounted) return

        const safeRacing = racingData?.ok ? racingData : null
        setRacing(safeRacing)

        const fullName = safeRacing?.driver
          ? `${safeRacing.driver.givenName ?? ''} ${safeRacing.driver.familyName ?? ''}`.trim()
          : driverId.charAt(0).toUpperCase() + driverId.slice(1)

        // Step 2: sentiment summary + stories in parallel
        const [sentRes, storiesRes] = await Promise.all([
          fetch(`/api/intelligence/drivers?format=summary&type=driver`),
          fetch(`/api/news/stories?q=${encodeURIComponent(fullName)}&hours=720&limit=10`),
        ])

        const sentData   = sentRes.ok   ? await sentRes.json()   : null
        const storiesData = storiesRes.ok ? await storiesRes.json() : null
        if (!mounted) return

        // Find matching driver in sentiment data
        if (sentData?.ok) {
          const norm = fullName.toLowerCase()
          const match = (sentData.data ?? []).find((d: SentimentSummary) => {
            const c = String(d.driverName ?? '').toLowerCase()
            return c === norm || c.includes(norm) || norm.includes(c) || c.includes(driverId.toLowerCase())
          })
          setSentiment(match ?? null)

          // Step 3: timeseries for this driver
          if (match?.driverName) {
            fetch(`/api/intelligence/drivers?format=timeseries&type=driver&driver=${encodeURIComponent(match.driverName)}&days=30`)
              .then(r => r.ok ? r.json() : null)
              .then(d => {
                if (mounted) {
                  setTimeseries(d?.ok ? (d.data ?? []).map((r: any) => ({
                    date: r.date ?? r.signal_date ?? '',
                    mentions: safeNum(r.mention_count ?? r.mentions),
                    sentimentAvg: safeNum(r.sentiment_avg ?? r.sentimentAvg),
                    positiveCount: safeNum(r.positive_count ?? r.positiveCount),
                    negativeCount: safeNum(r.negative_count ?? r.negativeCount),
                    neutralCount: safeNum(r.neutral_count ?? r.neutralCount),
                  })) : [])
                  setTsLoading(false)
                }
              })
          } else {
            setTsLoading(false)
          }
        } else {
          setTsLoading(false)
        }

        setStories(storiesData?.ok ? (storiesData.data ?? []) : [])
      } catch (err) {
        console.error('[driver page]', err)
        if (mounted) { setRacing(null); setSentiment(null); setStories([]) }
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => { mounted = false }
  }, [driverId])

  const driverInfo    = racing?.driver
  const career        = racing?.career
  const currentSeason = racing?.currentSeason
  const imgUrl        = DRIVER_IMAGES[driverId?.toLowerCase()]

  const currentTeam = currentSeason?.results?.[0]?.constructor ?? career?.teams?.[career?.teams?.length - 1] ?? ''
  const color       = teamColorByName(currentTeam)
  const fullName    = driverInfo
    ? `${driverInfo.givenName ?? ''} ${driverInfo.familyName ?? ''}`.trim()
    : driverId?.charAt(0).toUpperCase() + driverId?.slice(1)

  // Sentiment chart stats
  const latestSent  = timeseries.length ? timeseries[timeseries.length - 1]?.sentimentAvg : null
  const peakSent    = timeseries.length ? Math.max(...timeseries.map(d => d.sentimentAvg)) : null
  const totalMentions = timeseries.reduce((s, d) => s + d.mentions, 0)

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
        <BgCanvas />
      </div>

      {/* Ambient color wash behind everything */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        background: `radial-gradient(ellipse 80% 50% at 50% -10%, ${color}12, transparent 70%)`,
        transition: 'background 1s ease',
      }} />

      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', position: 'relative', zIndex: 1 }}>
        <Header />
        <Ticker />

        <main style={{
          width: '100%', maxWidth: 1200,
          margin: '0 auto',
          padding: 'calc(var(--header-h) + 36px + 36px) 24px 80px',
          display: 'grid', gap: 28,
        }}>

          {/* Back */}
          <Link href="/standings" style={{
            fontSize: 9, fontFamily: 'var(--font-mono)',
            letterSpacing: '.18em', color: 'var(--t3)',
            textDecoration: 'none',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            ← STANDINGS
          </Link>

          {/* ══════════════════════════════════════════════
              HERO — Full bleed cinematic driver panel
          ══════════════════════════════════════════════ */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 340px',
            minHeight: 360,
            borderRadius: 22,
            overflow: 'hidden',
            border: `1px solid ${color}40`,
            position: 'relative',
            background: `linear-gradient(125deg, rgba(0,0,0,.9) 0%, ${color}20 60%, rgba(0,0,0,.7) 100%)`,
            boxShadow: `0 0 80px ${color}18, 0 0 200px ${color}08`,
          }}>
            {/* Top color bar */}
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0,
              height: 3, background: `linear-gradient(90deg, ${color}, ${color}44)`,
              zIndex: 3,
            }} />

            {/* Subtle grid texture */}
            <div style={{
              position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
              backgroundImage: `linear-gradient(${color}06 1px, transparent 1px), linear-gradient(90deg, ${color}06 1px, transparent 1px)`,
              backgroundSize: '40px 40px',
            }} />

            {/* Left content */}
            <div style={{
              padding: '48px 48px 40px',
              display: 'flex', flexDirection: 'column',
              justifyContent: 'flex-end', position: 'relative', zIndex: 2,
            }}>
              {loading ? (
                <div style={{ display: 'grid', gap: 12 }}>
                  {[260, 160, 100].map((w, i) => (
                    <div key={i} className="skeleton" style={{ height: i === 0 ? 72 : 18, width: w, borderRadius: 6 }} />
                  ))}
                </div>
              ) : (
                <>
                  <div className="eyebrow" style={{ marginBottom: 16 }}>
                    <div className="line" />
                    <span>Driver Intelligence · 2026 Season</span>
                  </div>

                  {/* Name — massive */}
                  <div style={{
                    fontFamily: 'var(--font-bebas)',
                    fontSize: 'clamp(52px, 7vw, 90px)',
                    lineHeight: 0.85,
                    letterSpacing: '.02em',
                    color: 'var(--t1)',
                    marginBottom: 20,
                  }}>
                    {driverInfo?.givenName && (
                      <div style={{ fontSize: '0.55em', color: 'var(--t2)', marginBottom: 4 }}>
                        {driverInfo.givenName.toUpperCase()}
                      </div>
                    )}
                    {(driverInfo?.familyName ?? fullName).toUpperCase()}
                  </div>

                  {/* Meta row */}
                  <div style={{
                    display: 'flex', alignItems: 'center',
                    gap: 20, marginBottom: 24, flexWrap: 'wrap',
                  }}>
                    {driverInfo?.permanentNumber && (
                      <div style={{
                        display: 'flex', alignItems: 'baseline', gap: 5,
                      }}>
                        <span style={{
                          fontSize: 9, fontFamily: 'var(--font-mono)',
                          color: 'var(--t3)', letterSpacing: '.18em',
                        }}>
                          NO.
                        </span>
                        <span style={{
                          fontFamily: 'var(--font-bebas)', fontSize: 36,
                          color, lineHeight: 1,
                          textShadow: `0 0 24px ${color}60`,
                        }}>
                          {driverInfo.permanentNumber}
                        </span>
                      </div>
                    )}
                    {driverInfo?.nationality && (
                      <div style={{
                        fontSize: 10, color: 'var(--t2)',
                        fontFamily: 'var(--font-mono)', letterSpacing: '.12em',
                        padding: '3px 10px',
                        border: '1px solid var(--b1)',
                        borderRadius: 4,
                      }}>
                        {driverInfo.nationality.toUpperCase()}
                      </div>
                    )}
                    {driverInfo?.dateOfBirth && (
                      <div style={{
                        fontSize: 10, color: 'var(--t3)',
                        fontFamily: 'var(--font-mono)', letterSpacing: '.08em',
                      }}>
                        b. {new Date(driverInfo.dateOfBirth).getFullYear()}
                      </div>
                    )}
                  </div>

                  {/* Team pill */}
                  {currentTeam && (
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: 10,
                      padding: '8px 16px', borderRadius: 24,
                      border: `1px solid ${color}55`,
                      background: `${color}18`,
                      alignSelf: 'flex-start',
                    }}>
                      <div style={{
                        width: 10, height: 10, borderRadius: '50%',
                        background: color,
                        boxShadow: `0 0 8px ${color}`,
                      }} />
                      <span style={{
                        fontSize: 11, fontFamily: 'var(--font-mono)',
                        color, letterSpacing: '.1em',
                      }}>
                        {currentTeam.toUpperCase()}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Right — driver photo */}
            <div style={{ position: 'relative', overflow: 'hidden' }}>
              {!imgFailed && imgUrl ? (
                <img
                  src={imgUrl}
                  alt={fullName}
                  onError={() => setImgFailed(true)}
                  style={{
                    position: 'absolute', inset: 0,
                    width: '100%', height: '100%',
                    objectFit: 'cover', objectPosition: 'top center',
                  }}
                />
              ) : (
                <div style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--font-bebas)', fontSize: 100,
                  color, opacity: 0.15,
                }}>
                  {driverId?.slice(0, 2).toUpperCase()}
                </div>
              )}
              {/* Fade left */}
              <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(to right, rgba(0,0,0,.85), transparent 35%)',
              }} />
              {/* Number watermark */}
              <div style={{
                position: 'absolute', bottom: -20, right: -10,
                fontFamily: 'var(--font-bebas)', fontSize: 200,
                lineHeight: 1, color, opacity: 0.07,
                pointerEvents: 'none', userSelect: 'none',
                letterSpacing: '-0.05em',
              }}>
                {driverInfo?.permanentNumber ?? ''}
              </div>
            </div>
          </div>

          {/* ══════════════════════════════════════════════
              CAREER STAT STRIP
          ══════════════════════════════════════════════ */}
          <div>
            <div style={{
              fontSize: 9, fontFamily: 'var(--font-mono)',
              letterSpacing: '.22em', color: 'var(--t3)', marginBottom: 12,
            }}>
              · Career Statistics
            </div>
            {loading ? (
              <div className="skeleton" style={{ height: 88, borderRadius: 16 }} />
            ) : career ? (
              <CareerStrip career={career} color={color} />
            ) : (
              <div style={{ color: 'var(--t3)', fontSize: 12 }}>Unavailable.</div>
            )}
          </div>

          {/* ══════════════════════════════════════════════
              TWO COLUMN: CURRENT SEASON + INTELLIGENCE
          ══════════════════════════════════════════════ */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.1fr', gap: 20 }}>

            {/* Current season */}
            <div style={{
              border: '1px solid var(--b1)', borderRadius: 18,
              background: 'rgba(0,0,0,.28)', padding: '20px 22px',
              display: 'grid', gap: 20, alignContent: 'start',
            }}>
              <div style={{
                fontSize: 9, fontFamily: 'var(--font-mono)',
                letterSpacing: '.2em', color: 'var(--t3)',
              }}>
                · 2026 Season
              </div>

              {loading ? (
                <div style={{ display: 'grid', gap: 10 }}>
                  {Array(3).fill(null).map((_, i) => (
                    <div key={i} className="skeleton" style={{ height: 16 }} />
                  ))}
                </div>
              ) : currentSeason ? (
                <>
                  {/* Season KPIs */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                    {[
                      { l: 'RACES',   v: currentSeason.races,              c: color },
                      { l: 'WINS',    v: currentSeason.wins,               c: '#F59E0B' },
                      { l: 'PODIUMS', v: safeNum(currentSeason.podiums),   c: '#CD7F32' },
                      { l: 'PTS',     v: Math.round(currentSeason.points), c: color },
                    ].map(s => (
                      <div key={s.l} style={{
                        textAlign: 'center', padding: '12px 8px',
                        borderRadius: 10,
                        border: '1px solid var(--b1)',
                        background: `${s.c}08`,
                      }}>
                        <div style={{ fontSize: 8, letterSpacing: '.14em', color: 'var(--t3)', marginBottom: 4 }}>
                          {s.l}
                        </div>
                        <div style={{
                          fontFamily: 'var(--font-bebas)', fontSize: 28,
                          color: s.c, lineHeight: 1,
                        }}>
                          {s.v}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Result tiles */}
                  <div>
                    <div style={{
                      fontSize: 8, letterSpacing: '.16em',
                      color: 'var(--t3)', marginBottom: 12,
                    }}>
                      RACE RESULTS
                    </div>
                    <ResultTiles results={currentSeason.results ?? []} />
                  </div>
                </>
              ) : (
                <div style={{ color: 'var(--t3)', fontSize: 12 }}>No data.</div>
              )}
            </div>

            {/* News Intelligence */}
            <div style={{
              border: `1px solid ${color}25`,
              borderRadius: 18,
              background: `linear-gradient(145deg, ${color}08, rgba(0,0,0,.3))`,
              padding: '20px 22px',
              display: 'grid', gap: 20, alignContent: 'start',
              position: 'relative', overflow: 'hidden',
            }}>
              {/* Ambient glow */}
              <div style={{
                position: 'absolute', top: -40, right: -40,
                width: 200, height: 200, borderRadius: '50%',
                background: `radial-gradient(circle, ${color}15, transparent 70%)`,
                pointerEvents: 'none',
              }} />

              <div style={{
                display: 'flex', alignItems: 'center',
                justifyContent: 'space-between', position: 'relative', zIndex: 1,
              }}>
                <div style={{
                  fontSize: 9, fontFamily: 'var(--font-mono)',
                  letterSpacing: '.2em', color: 'var(--t3)',
                }}>
                  · Snowflake Intelligence · 30d
                </div>
                {sentiment && (
                  <span style={{
                    padding: '3px 10px', borderRadius: 20,
                    fontSize: 8, fontFamily: 'var(--font-mono)',
                    letterSpacing: '.12em',
                    color: safeNum(sentiment.sentimentAvg) > 0.15 ? '#4ADE80'
                      : safeNum(sentiment.sentimentAvg) < -0.15 ? 'var(--red)' : 'var(--t2)',
                    border: `1px solid ${safeNum(sentiment.sentimentAvg) > 0.15 ? '#4ADE80'
                      : safeNum(sentiment.sentimentAvg) < -0.15 ? 'var(--red)' : 'var(--t3)'}44`,
                    background: `${safeNum(sentiment.sentimentAvg) > 0.15 ? '#4ADE80'
                      : safeNum(sentiment.sentimentAvg) < -0.15 ? '#E10600' : '#888'}10`,
                  }}>
                    {safeNum(sentiment.sentimentAvg) > 0.15 ? 'POSITIVE'
                      : safeNum(sentiment.sentimentAvg) < -0.15 ? 'NEGATIVE' : 'NEUTRAL'}
                  </span>
                )}
              </div>

              {loading ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  {Array(3).fill(null).map((_, i) => (
                    <div key={i} className="skeleton" style={{ height: 14 }} />
                  ))}
                </div>
              ) : sentiment ? (
                <div style={{ display: 'grid', gap: 16, position: 'relative', zIndex: 1 }}>

                  {/* Big sentiment number */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 8, letterSpacing: '.14em', color: 'var(--t3)', marginBottom: 6 }}>
                        SENTIMENT SCORE
                      </div>
                      <div style={{
                        fontFamily: 'var(--font-bebas)', fontSize: 48, lineHeight: 1,
                        color: safeNum(sentiment.sentimentAvg) > 0 ? '#4ADE80' : 'var(--red)',
                        textShadow: `0 0 30px ${safeNum(sentiment.sentimentAvg) > 0 ? '#4ADE8060' : '#E1060060'}`,
                      }}>
                        {safeNum(sentiment.sentimentAvg) > 0 ? '+' : ''}
                        {safeNum(sentiment.sentimentAvg).toFixed(3)}
                      </div>
                      <div style={{
                        fontSize: 9, fontFamily: 'var(--font-mono)',
                        color: safeNum(sentiment.sentimentDelta) > 0 ? '#4ADE80'
                          : safeNum(sentiment.sentimentDelta) < 0 ? 'var(--red)' : 'var(--t3)',
                        marginTop: 4,
                      }}>
                        {safeNum(sentiment.sentimentDelta) > 0 ? '↑ +' : safeNum(sentiment.sentimentDelta) < 0 ? '↓ ' : '→ '}
                        {safeNum(sentiment.sentimentDelta).toFixed(3)} recent
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 8, letterSpacing: '.14em', color: 'var(--t3)', marginBottom: 6 }}>
                        MENTIONS
                      </div>
                      <div style={{
                        fontFamily: 'var(--font-bebas)', fontSize: 48, lineHeight: 1,
                        color,
                      }}>
                        {safeNum(sentiment.mentions)}
                      </div>
                      <div style={{
                        fontSize: 9, color: 'var(--t3)',
                        fontFamily: 'var(--font-mono)', marginTop: 4,
                      }}>
                        in 30 days
                      </div>
                    </div>
                  </div>

                  {/* Sentiment composition bar */}
                  <div>
                    <div style={{ fontSize: 8, letterSpacing: '.14em', color: 'var(--t3)', marginBottom: 8 }}>
                      SENTIMENT COMPOSITION
                    </div>
                    <div style={{
                      height: 8, borderRadius: 4, overflow: 'hidden',
                      display: 'flex', gap: 1,
                      background: 'var(--b1)',
                    }}>
                      {(() => {
                        const pos = safeNum(sentiment.positive)
                        const neu = safeNum(sentiment.neutral)
                        const neg = safeNum(sentiment.negative)
                        const tot = pos + neu + neg || 1
                        return (
                          <>
                            <div style={{ width: `${(pos/tot)*100}%`, background: '#4ADE80', transition: 'width .8s ease' }} />
                            <div style={{ width: `${(neu/tot)*100}%`, background: 'rgba(255,255,255,.2)', transition: 'width .8s ease' }} />
                            <div style={{ width: `${(neg/tot)*100}%`, background: '#E10600', transition: 'width .8s ease' }} />
                          </>
                        )
                      })()}
                    </div>
                    <div style={{ display: 'flex', gap: 14, marginTop: 6 }}>
                      {[
                        { l: 'POS', v: sentiment.positive,  c: '#4ADE80' },
                        { l: 'NEU', v: sentiment.neutral,   c: 'var(--t3)' },
                        { l: 'NEG', v: sentiment.negative,  c: '#E10600' },
                      ].map(b => {
                        const tot = safeNum(sentiment.positive) + safeNum(sentiment.neutral) + safeNum(sentiment.negative) || 1
                        return (
                          <div key={b.l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <div style={{ width: 6, height: 6, borderRadius: 2, background: b.c }} />
                            <span style={{ fontSize: 8, color: 'var(--t3)' }}>
                              {b.l} <span style={{ color: b.c }}>{Math.round(safeNum(b.v) / tot * 100)}%</span>
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Top narrative */}
                  {sentiment.topCluster && (
                    <div>
                      <div style={{ fontSize: 8, letterSpacing: '.14em', color: 'var(--t3)', marginBottom: 6 }}>
                        DOMINANT NARRATIVE
                      </div>
                      <div style={{
                        padding: '8px 12px', borderRadius: 8,
                        border: `1px solid ${color}30`,
                        background: `${color}10`,
                        fontSize: 10, color,
                        fontFamily: 'var(--font-mono)', letterSpacing: '.1em',
                      }}>
                        {readableCluster(sentiment.topCluster)}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ color: 'var(--t3)', fontSize: 12 }}>
                  Pipeline paused — no intelligence data.
                </div>
              )}
            </div>
          </div>

          {/* ══════════════════════════════════════════════
              SENTIMENT TIMELINE CHART (from Snowflake)
          ══════════════════════════════════════════════ */}
          <div style={{
            border: `1px solid ${color}25`,
            borderRadius: 18,
            background: 'rgba(0,0,0,.28)',
            padding: '22px 24px',
            position: 'relative', overflow: 'hidden',
          }}>
            {/* Subtle ambient */}
            <div style={{
              position: 'absolute', bottom: -30, left: '30%',
              width: 300, height: 150, borderRadius: '50%',
              background: `radial-gradient(circle, ${color}10, transparent 70%)`,
              pointerEvents: 'none',
            }} />

            <div style={{
              display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', marginBottom: 20,
            }}>
              <div>
                <div style={{
                  fontSize: 9, fontFamily: 'var(--font-mono)',
                  letterSpacing: '.2em', color: 'var(--t3)', marginBottom: 4,
                }}>
                  · Sentiment Signal · 30 Day Trend
                </div>
                <div style={{
                  fontSize: 10, color: 'var(--t2)',
                  fontFamily: 'var(--font-mono)',
                }}>
                  Snowflake Cortex NLP · Updated hourly
                </div>
              </div>
              {/* Chart legend */}
              {!tsLoading && timeseries.length > 0 && (
                <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                  {[
                    { label: 'Sentiment', color },
                    { label: 'Peak',      color: '#4ADE80' },
                    { label: 'Valley',    color: '#E10600' },
                    { label: 'Volume',    color: `${color}55` },
                  ].map(l => (
                    <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{ width: 14, height: 2, background: l.color, borderRadius: 1 }} />
                      <span style={{ fontSize: 9, color: 'var(--t3)' }}>{l.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <SentimentChart data={timeseries} color={color} loading={tsLoading} />

            {/* Chart stats below */}
            {!tsLoading && timeseries.length > 0 && (
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 10, marginTop: 20,
                paddingTop: 16, borderTop: '1px solid var(--b1)',
              }}>
                {[
                  { l: 'CURRENT',      v: latestSent != null ? `${latestSent >= 0 ? '+' : ''}${latestSent.toFixed(3)}` : '—',
                    c: latestSent != null ? (latestSent >= 0 ? '#4ADE80' : '#E10600') : 'var(--t2)' },
                  { l: 'PEAK (30D)',   v: peakSent != null ? `+${peakSent.toFixed(3)}` : '—',  c: '#4ADE80' },
                  { l: 'TOTAL MENTIONS', v: totalMentions.toLocaleString(), c: color },
                  { l: 'DATA POINTS',  v: timeseries.length,               c: 'var(--t2)' },
                ].map(s => (
                  <div key={s.l} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 8, letterSpacing: '.14em', color: 'var(--t3)', marginBottom: 4 }}>
                      {s.l}
                    </div>
                    <div style={{
                      fontFamily: 'var(--font-bebas)', fontSize: 20,
                      color: s.c, lineHeight: 1,
                    }}>
                      {s.v}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ══════════════════════════════════════════════
              COVERAGE INTELLIGENCE
          ══════════════════════════════════════════════ */}
          {!loading && stories.length > 0 && (
            <CoverageIntelligence
              stories={dedupeStories(stories)}
              timeseries={timeseries}
              color={color}
            />
          )}

          {!loading && stories.length === 0 && (
            <div style={{
              padding: '40px', textAlign: 'center',
              border: '1px solid var(--b1)', borderRadius: 16,
              color: 'var(--t3)', fontSize: 12,
            }}>
              No recent coverage found.
            </div>
          )}

        </main>
        <Footer />
      </div>
    </>
  )
}