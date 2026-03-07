'use client'

import { useEffect, useMemo, useState } from 'react'
import BootScreen from '@/components/BootScreen'
import BgCanvas from '@/components/BgCanvas'
import Header from '@/components/Header'
import Ticker from '@/components/Ticker'
import Footer from '@/components/Footer'

type StoryCard = {
  title?: string
  story_title?: string
  source?: string
  latest_source?: string
  cluster?: string
  cluster_name?: string
  topic_cluster?: string
  priority?: string
  best_priority_tier?: string
  priority_tier?: string
  time?: string
  latest_event_ts?: string
  published_at?: string
  isBreaking?: boolean
  is_breaking?: boolean
  summary?: string
  latest_url?: string
  momentum_score?: number
  max_priority_score?: number
}

export default function HomePage() {
  const [booted, setBooted]   = useState(false)
  const [loading, setLoading] = useState(true)
  const [overview, setOverview] = useState<any>(null)
  const [weekend, setWeekend]   = useState<any>(null)
  const [briefing, setBriefing] = useState<any>(null)
  const [stories, setStories]   = useState<StoryCard[]>([])
  const [drivers, setDrivers]   = useState<any[]>([])

  useEffect(() => {
    let mounted = true
    Promise.all([
      fetch('/api/intelligence/overview').then(r => (r.ok ? r.json() : null)),
      fetch('/api/intelligence/weekend').then(r => (r.ok ? r.json() : null)),
      fetch('/api/intelligence/briefing').then(r => (r.ok ? r.json() : null)),
      fetch('/api/intelligence/drivers?format=summary&type=driver').then(r => (r.ok ? r.json() : null)),
      fetch('/api/stories?hours=720&limit=8').then(r => (r.ok ? r.json() : null)),
    ])
      .then(([ov, wk, br, dr, st]) => {
        if (!mounted) return
        if (ov?.ok) setOverview(ov.data ?? ov.intelligence ?? null)
        if (wk?.ok) setWeekend(wk)
        if (br?.ok) setBriefing(br.briefing ?? null)
        if (dr?.ok) setDrivers(dr.data ?? dr.drivers ?? [])
        if (st?.ok) setStories(st.data ?? [])
      })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  const currentState = weekend?.currentState ?? null
  const topStories   = useMemo(() => stories.slice(0, 6), [stories])
  const topDrivers   = useMemo(() => drivers.slice(0, 6), [drivers])

  const statCards = [
    { label: 'STORIES', value: stories.length,                    color: 'var(--blue)'   },
    { label: 'DRIVERS', value: drivers.length,                    color: 'var(--gold)'   },
    { label: 'SIGNALS', value: overview?.totalSignals ?? 0,       color: 'var(--red)'    },
    { label: 'ALERTS',  value: overview?.alerts?.length ?? 0,     color: 'var(--green)'  },
  ]

  return (
    <>
      {/* BgCanvas forced out of document flow — never affects layout */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
        <BgCanvas />
      </div>

      {/* BootScreen: keep in DOM until fully booted so exit animation completes */}
      {!booted && <BootScreen onEnter={() => setBooted(true)} />}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
          position: 'relative',
          zIndex: 1,
          opacity: booted ? 1 : 0,
          transition: 'opacity 0.6s ease 0.2s',
          pointerEvents: booted ? 'auto' : 'none',
        }}
      >
        <Header />
        <Ticker />

        <main
          style={{
            width: '100%',
            maxWidth: 1320,
            margin: '0 auto',
            padding: 'calc(var(--header-h) + 36px + 36px) 20px 64px', // header + ticker + breathing room
            display: 'grid',
            gap: 20,
          }}
        >
          {/* Hero */}
          <section
            style={{
              border: '1px solid var(--b1)',
              borderRadius: 18,
              background: 'rgba(0,0,0,.28)',
              padding: '24px 24px 22px',
            }}
          >
            <div className="eyebrow">
              <div className="line" />
              <span>LIVE F1 INTELLIGENCE TERMINAL</span>
            </div>

            <div
              style={{
                fontFamily: 'var(--font-bebas)',
                fontSize: 'clamp(40px, 7vw, 84px)',
                lineHeight: 0.95,
                letterSpacing: '.03em',
                marginTop: 10,
              }}
            >
              {briefing?.headline || 'REAL-TIME F1 STORY INTELLIGENCE'}
            </div>

            <p
              style={{
                color: 'var(--t2)',
                fontSize: 14,
                lineHeight: 1.7,
                maxWidth: 900,
                marginTop: 16,
                marginBottom: 0,
              }}
            >
              {briefing?.lead_paragraph ||
                'Snowflake-powered clustering, live event stream processing, and Neon-backed serving APIs for fast frontend reads.'}
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 18 }}>
              <Chip label={currentState?.isRaceWeek ? 'RACE WEEK' : 'OFF WEEK'} strong={Boolean(currentState?.isRaceWeek)} />
              <Chip label={`NEXT: ${currentState?.nextRace?.name || 'N/A'}`} />
              <Chip label={`DAYS: ${currentState?.daysUntilRace ?? '—'}`} />
              <Chip label={`SESSION: ${currentState?.sessions?.current || 'NONE'}`} />
            </div>
          </section>

          {/* Stats */}
          <section
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 14,
            }}
          >
            {statCards.map(card => (
              <div
                key={card.label}
                style={{
                  border: '1px solid var(--b1)',
                  borderRadius: 16,
                  background: 'rgba(0,0,0,.24)',
                  padding: '18px 18px 16px',
                }}
              >
                <div style={{ fontSize: 10, letterSpacing: '.14em', color: 'var(--t3)', marginBottom: 8 }}>
                  {card.label}
                </div>
                <div style={{ fontFamily: 'var(--font-bebas)', fontSize: 36, lineHeight: 1, color: card.color }}>
                  {loading ? '—' : card.value}
                </div>
              </div>
            ))}
          </section>

          {/* Main content */}
          <section
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1.45fr) minmax(320px, 0.9fr)',
              gap: 20,
            }}
          >
            {/* Left */}
            <div style={{ display: 'grid', gap: 20 }}>
              <Panel title="TOP STORIES">
                {loading ? (
                  <Muted>Loading stories…</Muted>
                ) : topStories.length === 0 ? (
                  <Muted>No stories available.</Muted>
                ) : (
                  <div style={{ display: 'grid', gap: 12 }}>
                    {topStories.map((story, idx) => {
                      const title    = story.story_title || story.title || 'Untitled story'
                      const cluster  = story.topic_cluster || story.cluster || story.cluster_name || 'GENERAL_F1'
                      const source   = story.latest_source || story.source || 'unknown'
                      const priority = story.best_priority_tier || story.priority_tier || story.priority || 'P3'
                      const isBreaking = Boolean(story.is_breaking ?? story.isBreaking)
                      const time     = story.latest_event_ts || story.time || story.published_at || ''
                      const momentum = Math.round(Number(story.momentum_score ?? story.max_priority_score ?? 0))

                      return (
                        <div
                          key={`${title}-${idx}`}
                          style={{
                            border: '1px solid var(--b1)',
                            borderRadius: 14,
                            padding: 14,
                            background: 'rgba(255,255,255,.02)',
                          }}
                        >
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                            <Chip label={priority} strong={priority === 'P0'} />
                            <Chip label={cluster} />
                            {isBreaking && <Chip label="BREAKING" strong />}
                          </div>
                          <div style={{ fontSize: 16, lineHeight: 1.4, color: 'var(--t1)', marginBottom: 8 }}>
                            {title}
                          </div>
                          <div
                            style={{
                              display: 'flex', justifyContent: 'space-between',
                              gap: 12, alignItems: 'center',
                              color: 'var(--t3)', fontSize: 11,
                            }}
                          >
                            <span>{source}</span>
                            <span>{time ? timeAgo(time) : '—'}</span>
                          </div>
                          <div style={{ height: 2, background: 'var(--b1)', borderRadius: 2, marginTop: 12 }}>
                            <div
                              style={{
                                width: `${Math.max(8, Math.min(100, momentum))}%`,
                                height: '100%', borderRadius: 2,
                                background: isBreaking ? 'var(--red)' : 'var(--blue)',
                              }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </Panel>

              <Panel title="DAILY BRIEFING">
                {briefing ? (
                  <div style={{ display: 'grid', gap: 14 }}>
                    <Info label="Top story"       value={briefing.top_story_summary} />
                    <Info label="Driver spotlight" value={briefing.driver_spotlight} />
                    <Info label="What to watch"   value={briefing.what_to_watch} />
                  </div>
                ) : (
                  <Muted>No briefing generated yet.</Muted>
                )}
              </Panel>
            </div>

            {/* Right */}
            <div style={{ display: 'grid', gap: 20 }}>
              <Panel title="DRIVER PULSE">
                {loading ? (
                  <Muted>Loading driver sentiment…</Muted>
                ) : topDrivers.length === 0 ? (
                  <Muted>No driver sentiment data yet.</Muted>
                ) : (
                  <div style={{ display: 'grid', gap: 12 }}>
                    {topDrivers.map((driver: any, idx) => {
                      const name     = driver.driverName || driver.driver_name || 'Unknown'
                      const mentions = driver.mentions ?? driver.mentionCount ?? driver.mention_count ?? 0
                      const avg      = Number(driver.sentimentAvg ?? driver.sentiment_avg ?? 0)
                      const label    = driver.sentimentLabel || driver.sentiment_label || 'neutral'
                      const color    = label === 'positive' ? 'var(--green)' : label === 'negative' ? 'var(--red)' : 'var(--t2)'

                      return (
                        <div
                          key={`${name}-${idx}`}
                          style={{
                            display: 'flex', justifyContent: 'space-between',
                            alignItems: 'center', gap: 12,
                            paddingBottom: 10, borderBottom: '1px solid var(--b1)',
                          }}
                        >
                          <div>
                            <div style={{ color: 'var(--t1)', fontSize: 15 }}>{name}</div>
                            <div style={{ color: 'var(--t3)', fontSize: 11 }}>{mentions} mentions</div>
                          </div>
                          <div style={{ color, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                            {avg > 0 ? '+' : ''}{avg.toFixed(3)}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </Panel>

              <Panel title="WEEKEND WATCH">
                {currentState ? (
                  <div style={{ display: 'grid', gap: 12 }}>
                    <Info label="Next race"        value={currentState.nextRace?.name} />
                    <Info label="Circuit"          value={currentState.nextRace?.circuit} />
                    <Info label="Location"
                      value={currentState.nextRace?.city
                        ? `${currentState.nextRace.city}, ${currentState.nextRace.country}`
                        : '—'}
                    />
                    <Info label="Current session"  value={currentState.sessions?.current || 'NONE'} />
                  </div>
                ) : (
                  <Muted>No weekend data available.</Muted>
                )}
              </Panel>
            </div>
          </section>
        </main>

        <Footer />
      </div>
    </>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        border: '1px solid var(--b1)',
        borderRadius: 18,
        background: 'rgba(0,0,0,.24)',
        padding: 18,
      }}
    >
      <div style={{ fontSize: 10, letterSpacing: '.15em', color: 'var(--t3)', marginBottom: 14 }}>
        {title}
      </div>
      {children}
    </section>
  )
}

function Chip({ label, strong = false }: { label: string; strong?: boolean }) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center',
        padding: '7px 11px', borderRadius: 999,
        border: `1px solid ${strong ? 'rgba(225,6,0,.4)' : 'var(--b1)'}`,
        color: strong ? 'var(--red)' : 'var(--t2)',
        background: strong ? 'rgba(225,6,0,.08)' : 'rgba(255,255,255,.02)',
        fontSize: 10, letterSpacing: '.12em',
      }}
    >
      {label}
    </span>
  )
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div style={{ fontSize: 9, letterSpacing: '.12em', color: 'var(--t3)', marginBottom: 4 }}>{label}</div>
      <div style={{ color: 'var(--t1)', fontSize: 14, lineHeight: 1.6 }}>{value || '—'}</div>
    </div>
  )
}

function Muted({ children }: { children: React.ReactNode }) {
  return <div style={{ color: 'var(--t2)', fontSize: 12 }}>{children}</div>
}

function timeAgo(value?: string) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  const diffMs  = Date.now() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1)  return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24)  return `${diffHr}h ago`
  return `${Math.floor(diffHr / 24)}d ago`
}