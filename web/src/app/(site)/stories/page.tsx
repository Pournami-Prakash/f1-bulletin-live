'use client'
// app/stories/page.tsx

import { useEffect, useMemo, useState } from 'react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import BgCanvas from '@/components/BgCanvas'

type StoryRow = {
  story_id?: string
  topic_cluster?: string
  story_title?: string
  latest_url?: string
  latest_source?: string
  latest_event_ts?: string
  first_seen_at?: string
  last_seen_at?: string
  events_count?: number
  sources_count?: number
  updates_count?: number
  max_priority_score?: number
  best_priority_tier?: string
  driver?: string | null
  heat_index?: number
  momentum_score?: number
  is_breaking?: boolean
  breaking_tier?: string | null
  merge_key?: string
}

type AlertRow = {
  clusterId?: string
  clusterName?: string
  zScore?: number
  resolved?: boolean
}

const PRIORITY_COLOR: Record<string, string> = {
  P0: 'var(--red)',
  P1: 'var(--gold)',
  P2: 'var(--blue)',
  P3: 'var(--t3)',
  BREAKING: 'var(--red)',
  HIGH: 'var(--gold)',
  NORMAL: 'var(--blue)',
  LOW: 'var(--t3)',
}

const VELOCITY_LABEL: Record<string, { icon: string; color: string }> = {
  SURGING: { icon: '🔥', color: 'var(--red)' },
  BUILDING: { icon: '↑', color: 'var(--green)' },
  STABLE: { icon: '→', color: 'var(--t3)' },
  FADING: { icon: '↓', color: 'var(--t3)' },
  DEAD: { icon: '—', color: 'var(--b2)' },
}

function formatSource(source?: string) {
  if (!source) return 'UNKNOWN'
  const s = source.toLowerCase()
  if (s.includes('reddit')) return 'REDDIT'
  if (s.includes('fia')) return 'OFFICIAL'
  if (s.includes('formula1')) return 'OFFICIAL'
  return 'NEWS'
}

function formatPriority(priority?: string, isBreaking?: boolean) {
  if (isBreaking) return 'P0'
  if (!priority) return 'P3'
  const p = priority.toUpperCase()
  if (['P0', 'P1', 'P2', 'P3'].includes(p)) return p
  if (p === 'BREAKING') return 'P0'
  if (p === 'HIGH') return 'P1'
  if (p === 'NORMAL') return 'P2'
  if (p === 'LOW') return 'P3'
  return 'P3'
}

function deriveVelocity(story: StoryRow): keyof typeof VELOCITY_LABEL {
  const momentum = Number(story.momentum_score ?? 0)
  const count24h = Number(story.events_count ?? 0)

  if (momentum >= 80 || count24h >= 8) return 'SURGING'
  if (momentum >= 45 || count24h >= 4) return 'BUILDING'
  if (momentum >= 20 || count24h >= 2) return 'STABLE'
  if (momentum > 0) return 'FADING'
  return 'DEAD'
}

export default function StoriesPage() {
  const [stories, setStories] = useState<StoryRow[]>([])
  const [alerts, setAlerts] = useState<AlertRow[]>([])
  const [loading, setLoading] = useState(true)
  const [priority, setPriority] = useState<string>('all')
  const [sortBy, setSortBy] = useState<'momentum' | 'recent' | 'sentiment'>('momentum')
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    Promise.all([
      fetch('/api/stories?hours=720&limit=100').then(r => (r.ok ? r.json() : null)),
      fetch('/api/intelligence/alerts?hours=24').then(r => (r.ok ? r.json() : null)),
    ])
      .then(([storiesRes, alertsRes]) => {
        if (!mounted) return
        setStories(storiesRes?.ok ? storiesRes.data ?? [] : [])
        setAlerts(alertsRes?.ok ? alertsRes.data ?? [] : [])
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [])

  const normalizedStories = useMemo(() => {
    return stories.map((story) => {
      const priorityLabel = formatPriority(story.best_priority_tier, story.is_breaking)
      const velocityLabel = deriveVelocity(story)
      const sourceTag = formatSource(story.latest_source)

      return {
        ...story,
        clusterId: story.story_id || story.merge_key || story.story_title || Math.random().toString(),
        clusterName: story.topic_cluster || 'GENERAL_F1',
        priority: priorityLabel,
        velocityLabel,
        sourceTag,
        articleCount: Number(story.events_count ?? 0),
        articlesLastHour: Number(story.updates_count ?? 0),
        articles24h: Number(story.events_count ?? 0),
        articles72h: Number(story.sources_count ?? 0),
        sentimentAvg: Number(story.heat_index ?? 0) / 100,
        sentimentLabel:
          Number(story.heat_index ?? 0) >= 60
            ? 'negative'
            : Number(story.heat_index ?? 0) >= 30
              ? 'neutral'
              : 'positive',
        momentumScore: Number(story.momentum_score ?? 0),
        summary: story.latest_source
          ? `Latest from ${story.latest_source}. ${story.sources_count ?? 0} source(s), ${story.events_count ?? 0} event(s) in this storyline.`
          : `Story cluster with ${story.events_count ?? 0} event(s).`,
      }
    })
  }, [stories])

  const filtered = useMemo(() => {
    const base = normalizedStories.filter((c) => priority === 'all' || c.priority === priority)

    return [...base].sort((a, b) => {
      if (sortBy === 'momentum') return (b.momentumScore ?? 0) - (a.momentumScore ?? 0)
      if (sortBy === 'recent') {
        return new Date(b.latest_event_ts ?? 0).getTime() - new Date(a.latest_event_ts ?? 0).getTime()
      }
      if (sortBy === 'sentiment') return Math.abs(b.sentimentAvg ?? 0) - Math.abs(a.sentimentAvg ?? 0)
      return 0
    })
  }, [normalizedStories, priority, sortBy])

  const kpis = useMemo(() => {
    return [
      {
        label: 'TOTAL STORIES',
        value: normalizedStories.length,
        color: 'var(--blue)',
      },
      {
        label: 'BREAKING P0',
        value: normalizedStories.filter((c) => c.priority === 'P0').length,
        color: 'var(--red)',
      },
      {
        label: 'ACTIVE SPIKES',
        value: alerts.filter((a) => !a.resolved).length,
        color: 'var(--gold)',
      },
      {
        label: 'SURGING NOW',
        value: normalizedStories.filter((c) => c.velocityLabel === 'SURGING').length,
        color: 'var(--green)',
      },
    ]
  }, [normalizedStories, alerts])

  const activeAlerts = alerts.filter((a) => !a.resolved)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', position: 'relative' }}>
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
        <BgCanvas />
      </div>

      <Header />

      <div style={{ position: 'relative', zIndex: 1, paddingTop: 'var(--header-h)' }}>
        <div
          style={{
            maxWidth: 1440,
            margin: '0 auto',
            padding: '24px 20px 64px',
          }}
        >
          <section
            style={{
              border: '1px solid var(--b1)',
              borderRadius: 18,
              background: 'rgba(0,0,0,.24)',
              padding: '22px 22px 18px',
              marginBottom: 18,
            }}
          >
            <div style={{ fontSize: 10, letterSpacing: '.15em', color: 'var(--t3)', marginBottom: 10 }}>
              STORY INTELLIGENCE FEED
            </div>
            <div
              style={{
                fontFamily: 'var(--font-bebas)',
                fontSize: 'clamp(34px, 6vw, 72px)',
                lineHeight: 0.95,
                letterSpacing: '.03em',
                marginBottom: 12,
              }}
            >
              STORIES
            </div>
            <div style={{ color: 'var(--t2)', fontSize: 13, lineHeight: 1.7, maxWidth: 860 }}>
              Clustered F1 narratives ranked by momentum, recency, and sentiment signal strength.
            </div>
          </section>

          <section
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 14,
              marginBottom: 18,
            }}
          >
            {kpis.map((kpi) => (
              <div
                key={kpi.label}
                style={{
                  border: '1px solid var(--b1)',
                  borderRadius: 16,
                  background: 'rgba(0,0,0,.24)',
                  padding: '18px 18px 16px',
                }}
              >
                <div style={{ fontSize: 10, letterSpacing: '.14em', color: 'var(--t3)', marginBottom: 8 }}>
                  {kpi.label}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-bebas)',
                    fontSize: 36,
                    lineHeight: 1,
                    color: kpi.color,
                  }}
                >
                  {loading ? '—' : kpi.value}
                </div>
              </div>
            ))}
          </section>

          {activeAlerts.length > 0 && (
            <section
              style={{
                display: 'flex',
                gap: 8,
                flexWrap: 'wrap',
                marginBottom: 18,
              }}
            >
              {activeAlerts.map((alert: any, idx: number) => (
                <div
                  key={alert.clusterId || alert.clusterName || idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '7px 12px',
                    borderRadius: 8,
                    background: 'rgba(225,6,0,.1)',
                    border: '1px solid rgba(225,6,0,.25)',
                    fontSize: 10,
                  }}
                >
                  <span style={{ color: 'var(--red)' }}>⚡</span>
                  <span style={{ color: 'var(--red)', letterSpacing: '.06em' }}>SPIKE</span>
                  <span style={{ color: 'var(--t1)' }}>
                    {(alert.clusterName || 'UNKNOWN').replace(/_/g, ' ')}
                  </span>
                  <span style={{ color: 'var(--t3)' }}>
                    z={typeof alert.zScore === 'number' ? alert.zScore.toFixed(1) : '—'}
                  </span>
                </div>
              ))}
            </section>
          )}

          <section
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
              padding: '14px 16px',
              border: '1px solid var(--b1)',
              borderRadius: 14,
              background: 'rgba(0,0,0,.24)',
              marginBottom: 18,
            }}
          >
            <span style={{ fontSize: 9, letterSpacing: '.14em', color: 'var(--t3)' }}>PRIORITY</span>
            {['all', 'P0', 'P1', 'P2', 'P3'].map((p) => (
              <button
                key={p}
                onClick={() => setPriority(p)}
                style={{
                  padding: '4px 12px',
                  borderRadius: 5,
                  cursor: 'pointer',
                  fontSize: 9,
                  letterSpacing: '.1em',
                  fontFamily: 'var(--font-mono)',
                  border: '1px solid',
                  borderColor: priority === p ? (PRIORITY_COLOR[p] || 'var(--red)') : 'var(--b1)',
                  background: priority === p ? ((PRIORITY_COLOR[p] || 'var(--red)') + '18') : 'transparent',
                  color: priority === p ? (PRIORITY_COLOR[p] || 'var(--red)') : 'var(--t2)',
                  transition: 'all .2s',
                }}
              >
                {p.toUpperCase()}
              </button>
            ))}

            <div style={{ width: 1, height: 16, background: 'var(--b2)', margin: '0 4px' }} />

            <span style={{ fontSize: 9, letterSpacing: '.14em', color: 'var(--t3)' }}>SORT</span>
            {[
              { key: 'momentum', label: 'MOMENTUM' },
              { key: 'recent', label: 'RECENT' },
              { key: 'sentiment', label: 'SENTIMENT' },
            ].map((s) => (
              <button
                key={s.key}
                onClick={() => setSortBy(s.key as 'momentum' | 'recent' | 'sentiment')}
                style={{
                  padding: '4px 12px',
                  borderRadius: 5,
                  cursor: 'pointer',
                  fontSize: 9,
                  letterSpacing: '.1em',
                  fontFamily: 'var(--font-mono)',
                  border: `1px solid ${sortBy === s.key ? 'var(--blue)' : 'var(--b1)'}`,
                  background: sortBy === s.key ? 'rgba(56,189,248,.1)' : 'transparent',
                  color: sortBy === s.key ? 'var(--blue)' : 'var(--t2)',
                  transition: 'all .2s',
                }}
              >
                {s.label}
              </button>
            ))}

            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--t3)' }}>
              {filtered.length} stories
            </span>
          </section>

          <main style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {loading
              ? Array(8)
                  .fill(null)
                  .map((_, i) => <StorySkeleton key={i} />)
              : filtered.map((cluster) => (
                  <StoryCard
                    key={cluster.clusterId}
                    cluster={cluster}
                    isOpen={expanded === cluster.clusterId}
                    onToggle={() =>
                      setExpanded(expanded === cluster.clusterId ? null : cluster.clusterId)
                    }
                  />
                ))}

            {!loading && filtered.length === 0 && (
              <div
                style={{
                  padding: 40,
                  textAlign: 'center',
                  color: 'var(--t2)',
                  fontSize: 12,
                  border: '1px solid var(--b1)',
                  borderRadius: 12,
                }}
              >
                No stories match this filter.
              </div>
            )}
          </main>
        </div>

        <Footer />
      </div>
    </div>
  )
}

function StoryCard({
  cluster,
  isOpen,
  onToggle,
}: {
  cluster: any
  isOpen: boolean
  onToggle: () => void
}) {
  const accentColor = PRIORITY_COLOR[cluster.priority] || 'var(--blue)'
  const vel = VELOCITY_LABEL[cluster.velocityLabel] || VELOCITY_LABEL.STABLE

  return (
    <div
      style={{
        border: '1px solid var(--b1)',
        borderRadius: 12,
        overflow: 'hidden',
        background: 'var(--card)',
        transition: 'border-color .2s',
      }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.borderColor = accentColor + '50')}
      onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.borderColor = 'var(--b1)')}
    >
      <div style={{ height: 2, background: accentColor }} />

      <div
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '16px 20px',
          cursor: 'pointer',
        }}
      >
        <span
          style={{
            fontSize: 8,
            letterSpacing: '.12em',
            padding: '3px 9px',
            borderRadius: 3,
            color: accentColor,
            background: accentColor + '18',
            border: `1px solid ${accentColor}35`,
            flexShrink: 0,
          }}
        >
          {cluster.priority}
        </span>

        <span
          style={{
            fontFamily: 'var(--font-bebas)',
            fontSize: 18,
            letterSpacing: '.06em',
            flex: 1,
          }}
        >
          {(cluster.story_title || cluster.clusterName || 'UNTITLED STORY').replace(/_/g, ' ')}
        </span>

        <span style={{ fontSize: 14, color: vel.color, flexShrink: 0 }}>{vel.icon}</span>

        <span style={{ fontSize: 10, color: 'var(--t2)', flexShrink: 0 }}>
          {cluster.articleCount} events
        </span>

        <span
          style={{
            fontSize: 9,
            padding: '2px 8px',
            borderRadius: 20,
            flexShrink: 0,
            color:
              cluster.sentimentLabel === 'positive'
                ? 'var(--green)'
                : cluster.sentimentLabel === 'negative'
                  ? 'var(--red)'
                  : 'var(--t3)',
            background:
              cluster.sentimentLabel === 'positive'
                ? 'rgba(74,222,128,.1)'
                : cluster.sentimentLabel === 'negative'
                  ? 'rgba(225,6,0,.1)'
                  : 'rgba(255,255,255,.04)',
          }}
        >
          {(cluster.sentimentLabel || 'neutral').toUpperCase()}
        </span>

        {cluster.is_breaking && (
          <span
            style={{
              fontSize: 8,
              padding: '2px 8px',
              borderRadius: 3,
              color: 'var(--red)',
              background: 'rgba(225,6,0,.12)',
              border: '1px solid rgba(225,6,0,.25)',
              flexShrink: 0,
            }}
          >
            BREAKING
          </span>
        )}

        <span style={{ color: 'var(--t3)', fontSize: 10, flexShrink: 0 }}>
          {isOpen ? '▲' : '▼'}
        </span>
      </div>

      {isOpen && (
        <div style={{ padding: '0 20px 20px 20px', borderTop: '1px solid var(--b1)' }}>
          <p style={{ fontSize: 12, color: 'var(--t2)', lineHeight: 1.7, padding: '16px 0 12px' }}>
            {cluster.summary || 'No summary available for this story yet.'}
          </p>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {[
              { l: 'MOMENTUM', v: `${Math.round(cluster.momentumScore || 0)}/100` },
              { l: 'SOURCES', v: `${cluster.sources_count ?? 0}` },
              { l: 'EVENTS', v: `${cluster.events_count ?? 0}` },
              { l: 'UPDATES', v: `${cluster.updates_count ?? 0}` },
              { l: 'LATEST', v: timeAgo(cluster.latest_event_ts) },
            ].map((stat) => (
              <div
                key={stat.l}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--b1)',
                  background: 'var(--bg2)',
                }}
              >
                <div
                  style={{
                    fontSize: 8,
                    letterSpacing: '.12em',
                    color: 'var(--t3)',
                    marginBottom: 2,
                  }}
                >
                  {stat.l}
                </div>
                <div style={{ fontSize: 11, color: 'var(--t1)' }}>{stat.v}</div>
              </div>
            ))}
          </div>

          {cluster.latest_url && (
            <div style={{ marginTop: 14 }}>
              <a
                href={cluster.latest_url}
                target="_blank"
                rel="noreferrer"
                style={{
                  color: accentColor,
                  fontSize: 11,
                  textDecoration: 'none',
                  letterSpacing: '.06em',
                }}
              >
                OPEN SOURCE ↗
              </a>
            </div>
          )}

          <div style={{ height: 2, background: 'var(--b1)', borderRadius: 2, marginTop: 14 }}>
            <div
              style={{
                height: '100%',
                background: accentColor,
                borderRadius: 2,
                width: `${Math.max(0, Math.min(100, cluster.momentumScore || 0))}%`,
                transition: 'width .8s ease',
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function StorySkeleton() {
  return (
    <div
      style={{
        border: '1px solid var(--b1)',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      <div style={{ height: 2, background: 'var(--b2)' }} />
      <div style={{ display: 'flex', gap: 14, padding: '16px 20px', alignItems: 'center' }}>
        <div className="skeleton" style={{ width: 70, height: 20, borderRadius: 3 }} />
        <div className="skeleton" style={{ flex: 1, height: 20 }} />
        <div className="skeleton" style={{ width: 80, height: 20 }} />
      </div>
    </div>
  )
}

function timeAgo(value?: string) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value

  const diffMs = Date.now() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  return `${diffDay}d ago`
}