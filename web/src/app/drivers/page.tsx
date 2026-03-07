'use client'
// app/drivers/page.tsx

import { useEffect, useMemo, useState } from 'react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import BgCanvas from '@/components/BgCanvas'

const ENTITY_COLORS: Record<string, string> = {
  VERSTAPPEN: '#3671C6', PEREZ: '#3671C6',
  HAMILTON: '#DC0000', LECLERC: '#DC0000', SAINZ: '#DC0000',
  NORRIS: '#FF8000', PIASTRI: '#FF8000',
  RUSSELL: '#27F4D2', BOTTAS: '#27F4D2',
  ALONSO: '#358C75', STROLL: '#358C75',
  GASLY: '#BFD7E0', OCON: '#BFD7E0',
  ALBON: '#64C4FF',
  HULKENBERG: '#B6BABD', MAGNUSSEN: '#B6BABD',
  TSUNODA: '#6692FF', LAWSON: '#6692FF',
  ZHOU: '#52E252', BEARMAN: '#52E252',
  ANTONELLI: '#27F4D2',
  COLAPINTO: '#64C4FF',
  'RED BULL': '#3671C6',
  FERRARI: '#DC0000',
  MERCEDES: '#27F4D2',
  MCLAREN: '#FF8000',
  'ASTON MARTIN': '#358C75',
  ALPINE: '#BFD7E0',
  WILLIAMS: '#64C4FF',
  HAAS: '#B6BABD',
  SAUBER: '#52E252',
  'RACING BULLS': '#6692FF',
}

type Tab = 'driver' | 'team'

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

type TimeseriesPoint = {
  date: string
  mentions: number
  sentimentAvg: number
  positiveCount: number
  negativeCount: number
  neutralCount: number
}

type ControversyEntity = {
  entityName: string
  score: number
  label?: string
  trend?: string
  delta?: number
  components?: {
    sentiment?: number
    fia?: number
    spike?: number
    media?: number
  }
}

function normalizeSummaryRow(row: any): SummaryEntity {
  return {
    driverName:
      row?.driverName ??
      row?.driver_name ??
      row?.entityName ??
      row?.entity_name ??
      'UNKNOWN',
    mentions: Number(
      row?.mentions ??
        row?.mentionCount ??
        row?.mention_count ??
        row?.total_mentions_7d ??
        0
    ),
    sentimentAvg: Number(
      row?.sentimentAvg ??
        row?.sentiment_avg ??
        row?.sentiment_7d_avg ??
        0
    ),
    sentimentDelta: Number(
      row?.sentimentDelta ??
        row?.sentiment_delta ??
        row?.sentimentTrend ??
        row?.sentiment_trend ??
        0
    ),
    sentimentLabel:
      row?.sentimentLabel ??
      row?.sentiment_label ??
      row?.overall_label ??
      'neutral',
    positiveCount: Number(row?.positiveCount ?? row?.positive_count ?? 0),
    negativeCount: Number(row?.negativeCount ?? row?.negative_count ?? 0),
    neutralCount: Number(row?.neutralCount ?? row?.neutral_count ?? 0),
    topCluster: row?.topCluster ?? row?.top_cluster ?? null,
    lastDate: row?.lastDate ?? row?.last_mentioned ?? row?.date ?? null,
  }
}

function normalizeTimeseriesRow(row: any): TimeseriesPoint {
  return {
    date: row?.date ?? row?.signal_date ?? row?.day ?? '',
    mentions: Number(row?.mentions ?? row?.mentionCount ?? row?.mention_count ?? 0),
    sentimentAvg: Number(row?.sentimentAvg ?? row?.sentiment_avg ?? 0),
    positiveCount: Number(row?.positiveCount ?? row?.positive_count ?? 0),
    negativeCount: Number(row?.negativeCount ?? row?.negative_count ?? 0),
    neutralCount: Number(row?.neutralCount ?? row?.neutral_count ?? 0),
  }
}

function normalizeControversyRow(row: any): ControversyEntity {
  return {
    entityName:
      row?.entityName ??
      row?.entity_name ??
      row?.name ??
      'UNKNOWN',
    score: Number(row?.score ?? row?.controversyScore ?? row?.controversy_score ?? 0),
    label: row?.label ?? row?.controversyLabel ?? row?.controversy_label,
    trend: row?.trend ?? row?.trendingDirection ?? row?.trending_direction,
    delta: Number(row?.delta ?? row?.scoreDelta ?? row?.score_delta ?? 0),
    components: {
      sentiment: Number(row?.components?.sentiment ?? row?.sentimentScore ?? row?.sentiment_score ?? 0),
      fia: Number(row?.components?.fia ?? row?.fiaScore ?? row?.fia_score ?? 0),
      spike: Number(row?.components?.spike ?? row?.spikeScore ?? row?.spike_score ?? 0),
      media: Number(row?.components?.media ?? row?.mediaScore ?? row?.media_score ?? 0),
    },
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function normalizeScore(values: number[], v: number) {
  const min = Math.min(...values, 0)
  const max = Math.max(...values, 1)
  if (max === min) return 50
  return ((v - min) / (max - min)) * 100
}

function formatClusterName(value?: string | null) {
  if (!value) return 'GENERAL NARRATIVE'
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function classifyNarrative(cluster?: string | null) {
  const c = (cluster || '').toLowerCase()
  if (c.includes('driver')) return 'DRIVER'
  if (c.includes('team')) return 'TEAM'
  if (c.includes('fia') || c.includes('regulation') || c.includes('rule')) return 'REGULATION'
  if (c.includes('technical') || c.includes('engine') || c.includes('power') || c.includes('floor') || c.includes('upgrade')) return 'TECH'
  if (c.includes('race') || c.includes('pace') || c.includes('run') || c.includes('qualifying')) return 'PACE'
  return 'GENERAL'
}

function timeAgo(value?: string | null) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  const diffMs = Date.now() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  return `${Math.floor(diffHr / 24)}d ago`
}

function useEntityTimeseries(tab: Tab, entityName: string | null) {
  const [data, setData] = useState<TimeseriesPoint[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!entityName) {
      setData([])
      return
    }

    let mounted = true
    setLoading(true)

    fetch(
      `/api/intelligence/drivers?format=timeseries&type=${tab}&driver=${encodeURIComponent(entityName)}&days=30`
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!mounted) return
        if (d?.ok) setData((d.data ?? []).map(normalizeTimeseriesRow))
        else setData([])
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [tab, entityName])

  return { data, loading }
}

export default function DriversPage() {
  const [tab, setTab] = useState<Tab>('driver')
  const [drivers, setDrivers] = useState<SummaryEntity[]>([])
  const [teams, setTeams] = useState<SummaryEntity[]>([])
  const [controversy, setControversy] = useState<ControversyEntity[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)

  const detailTimeseries = useEntityTimeseries(tab, selected)

  useEffect(() => {
    let mounted = true

    Promise.all([
      fetch('/api/intelligence/drivers?format=summary&type=driver').then(r => (r.ok ? r.json() : null)),
      fetch('/api/intelligence/drivers?format=summary&type=team').then(r => (r.ok ? r.json() : null)),
      fetch('/api/intelligence/controversy?days=30').then(r => (r.ok ? r.json() : null)),
    ])
      .then(([d, t, c]) => {
        if (!mounted) return
        setDrivers((d?.ok ? (d.data ?? d.drivers ?? []) : []).map(normalizeSummaryRow))
        setTeams((t?.ok ? (t.data ?? t.drivers ?? []) : []).map(normalizeSummaryRow))
        setControversy((c?.ok ? (c.data ?? []) : []).map(normalizeControversyRow))
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    setSelected(null)
  }, [tab])

  const list = tab === 'driver' ? drivers : teams

  const controversyMap = useMemo(
    () => Object.fromEntries(controversy.map((c) => [c.entityName.toUpperCase(), c])),
    [controversy]
  )

  const enrichedList = useMemo(() => {
    const mentionValues = list.map((d) => d.mentions ?? 0)
    const sentimentValues = list.map((d) => d.sentimentAvg ?? 0)
    const deltaValues = list.map((d) => d.sentimentDelta ?? 0)
    const controversyValues = list.map((d) => controversyMap[d.driverName.toUpperCase()]?.score ?? 0)

    return list.map((entity) => {
      const controversyScore = controversyMap[entity.driverName.toUpperCase()]?.score ?? 0
      const mentionScore = normalizeScore(mentionValues, entity.mentions ?? 0)
      const sentimentScore = normalizeScore(sentimentValues, entity.sentimentAvg ?? 0)
      const deltaScore = normalizeScore(deltaValues, entity.sentimentDelta ?? 0)
      const controversyNorm = normalizeScore(controversyValues, controversyScore)

      const influence =
        0.45 * mentionScore +
        0.20 * sentimentScore +
        0.20 * deltaScore +
        0.15 * controversyNorm

      let pulse: 'RISING' | 'FALLING' | 'CONTROVERSIAL' | 'MOST DISCUSSED' | 'STABLE' = 'STABLE'
      if ((entity.mentions ?? 0) >= Math.max(...mentionValues, 0) * 0.88) pulse = 'MOST DISCUSSED'
      if ((entity.sentimentDelta ?? 0) > 0.12) pulse = 'RISING'
      if ((entity.sentimentDelta ?? 0) < -0.08) pulse = 'FALLING'
      if (controversyScore >= 40) pulse = 'CONTROVERSIAL'

      return {
        ...entity,
        controversyScore,
        influenceScore: Math.round(influence),
        narrativeGroup: classifyNarrative(entity.topCluster),
        pulse,
      }
    })
  }, [list, controversyMap])

  const kpis = useMemo(() => {
    const activeList = enrichedList
    return [
      {
        label: tab === 'driver' ? 'ENTITIES TRACKED' : 'CONSTRUCTORS TRACKED',
        value: activeList.length,
        color: 'var(--blue)',
      },
      {
        label: 'TOTAL MENTIONS',
        value: activeList.reduce((sum, d) => sum + (d.mentions ?? 0), 0),
        color: 'var(--gold)',
      },
      {
        label: 'POSITIVE TREND',
        value: activeList.filter((d) => (d.sentimentDelta ?? 0) > 0.02).length,
        color: 'var(--green)',
      },
      {
        label: 'CONTROVERSY ACTIVE',
        value: activeList.filter((d) => (d.controversyScore ?? 0) >= 35).length,
        color: 'var(--red)',
      },
    ]
  }, [tab, enrichedList])

  const pulseCards = useMemo(() => {
    const rising = [...enrichedList].sort((a, b) => (b.sentimentDelta ?? 0) - (a.sentimentDelta ?? 0))[0]
    const falling = [...enrichedList].sort((a, b) => (a.sentimentDelta ?? 0) - (b.sentimentDelta ?? 0))[0]
    const controversial = [...enrichedList].sort((a, b) => (b.controversyScore ?? 0) - (a.controversyScore ?? 0))[0]
    const discussed = [...enrichedList].sort((a, b) => (b.mentions ?? 0) - (a.mentions ?? 0))[0]

    return [
      rising && { label: 'RISING', entity: rising, accent: 'var(--green)', note: `${sign(rising.sentimentDelta)} recent delta` },
      falling && { label: 'FALLING', entity: falling, accent: 'var(--red)', note: `${sign(falling.sentimentDelta)} recent delta` },
      controversial && { label: 'CONTROVERSIAL', entity: controversial, accent: 'var(--gold)', note: `${Math.round(controversial.controversyScore ?? 0)}/100 controversy` },
      discussed && { label: 'MOST DISCUSSED', entity: discussed, accent: 'var(--blue)', note: `${discussed.mentions} mentions` },
    ].filter(Boolean) as { label: string; entity: any; accent: string; note: string }[]
  }, [enrichedList])

  const selectedEntity = useMemo(
    () => enrichedList.find((e) => e.driverName === selected) ?? null,
    [enrichedList, selected]
  )

  const topForTrends = useMemo(
    () => [...enrichedList].sort((a, b) => (b.mentions ?? 0) - (a.mentions ?? 0)).slice(0, 4),
    [enrichedList]
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', position: 'relative' }}>
      <style>{`
        .drivers-grid-2{display:grid;grid-template-columns:1.15fr .85fr;gap:18px}
        .drivers-grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
        .drivers-grid-4{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
        .drivers-main-grid{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:20px;align-items:start}
        .drivers-pulse-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
        @media (max-width: 1150px){
          .drivers-main-grid,.drivers-grid-2,.drivers-grid-3,.drivers-pulse-grid{grid-template-columns:1fr!important}
        }
        @media (max-width: 900px){
          .drivers-grid-4{grid-template-columns:repeat(2,1fr)!important}
        }
        @media (max-width: 640px){
          .drivers-grid-4{grid-template-columns:1fr!important}
          .drivers-table-head,.drivers-row{grid-template-columns:28px 1fr 72px 80px 80px 50px 80px!important}
        }
      `}</style>

      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
        <BgCanvas />
      </div>

      <Header />

      <div style={{ position: 'relative', zIndex: 1, paddingTop: 'var(--header-h)' }}>
        <div style={{ maxWidth: 1460, margin: '0 auto', padding: '24px 20px 64px' }}>
          <section
            style={{
              border: '1px solid var(--b1)',
              borderRadius: 18,
              background: 'rgba(0,0,0,.24)',
              padding: '22px 22px 18px',
              marginBottom: 18,
              backgroundImage: 'linear-gradient(180deg, rgba(225,6,0,.05), transparent)',
            }}
          >
            <div className="eyebrow">
              <div className="line" />
              <span>30-DAY SERVING WINDOW · SENTIMENT + MENTIONS + CONTROVERSY</span>
            </div>

            <div
              style={{
                fontFamily: 'var(--font-bebas)',
                fontSize: 'clamp(34px, 5vw, 64px)',
                letterSpacing: '.03em',
                lineHeight: 1,
                marginBottom: 18,
              }}
            >
              ENTITY INTELLIGENCE
            </div>

            <div style={{ display: 'flex', gap: 0 }}>
              {(['driver', 'team'] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    padding: '10px 24px',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    letterSpacing: '.12em',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: tab === t ? '2px solid var(--red)' : '2px solid transparent',
                    color: tab === t ? 'var(--t1)' : 'var(--t2)',
                    transition: 'all .2s',
                  }}
                >
                  {t === 'driver' ? 'DRIVERS' : 'CONSTRUCTORS'}
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: 9,
                      color: tab === t ? 'var(--red)' : 'var(--t3)',
                    }}
                  >
                    {loading ? '—' : t === 'driver' ? drivers.length : teams.length}
                  </span>
                </button>
              ))}
            </div>
          </section>

          {/* 1. DRIVER PULSE */}
          <section style={{ marginBottom: 18 }}>
            <SectionTitle title="DRIVER PULSE" subtitle="Fastest signal scan across momentum, sentiment, and controversy" />
            <div className="drivers-pulse-grid">
              {pulseCards.map((item) => (
                <PulseCard key={item.label} item={item} />
              ))}
            </div>
          </section>

          {/* KPI */}
          <section className="drivers-grid-4" style={{ marginBottom: 18 }}>
            {kpis.map((kpi) => (
              <MetricCard key={kpi.label} label={kpi.label} value={loading ? '—' : kpi.value} color={kpi.color} />
            ))}
          </section>

          {/* 2 + 3 */}
          <section className="drivers-grid-2" style={{ marginBottom: 18 }}>
            <Panel title="SENTIMENT DISTRIBUTION">
              <SentimentDistribution entities={enrichedList} />
            </Panel>
            <Panel title="DRIVER MOMENTUM">
              <MomentumChart entities={enrichedList} />
            </Panel>
          </section>

          {/* 9 + 5 */}
          <section className="drivers-grid-2" style={{ marginBottom: 18 }}>
            <Panel title="INFLUENCE SCORE">
              <InfluenceScore entities={enrichedList} onSelect={setSelected} selected={selected} />
            </Panel>
            <Panel title="TOP STORYLINE PER ENTITY">
              <TopStorylines entities={enrichedList} onSelect={setSelected} />
            </Panel>
          </section>

          {/* 6 + 8 */}
          <section className="drivers-grid-2" style={{ marginBottom: 18 }}>
            <Panel title="SENTIMENT TREND LINES">
              <TrendLines tab={tab} entities={topForTrends} />
            </Panel>
            <Panel title="MENTIONS HEATMAP">
              <MentionsHeatmap tab={tab} entities={topForTrends} />
            </Panel>
          </section>

          {/* leaderboard + detail */}
          <main className="drivers-main-grid" style={{ marginBottom: 18 }}>
            <section
              style={{
                border: '1px solid var(--b1)',
                borderRadius: 16,
                overflow: 'hidden',
                background: 'rgba(0,0,0,.24)',
              }}
            >
              <div
                className="drivers-table-head"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '32px 1fr 80px 100px 100px 80px 100px',
                  gap: 8,
                  padding: '12px 16px',
                  fontSize: 8,
                  letterSpacing: '.14em',
                  color: 'var(--t3)',
                  borderBottom: '1px solid var(--b1)',
                }}
              >
                <span>#</span>
                <span>{tab === 'driver' ? 'DRIVER' : 'CONSTRUCTOR'}</span>
                <span style={{ textAlign: 'right' }}>MENTIONS</span>
                <span style={{ textAlign: 'right' }}>SENTIMENT</span>
                <span style={{ textAlign: 'right' }}>Δ RECENT</span>
                <span style={{ textAlign: 'center' }}>TREND</span>
                <span style={{ textAlign: 'right' }}>CONTROVERSY</span>
              </div>

              {loading
                ? Array(12).fill(null).map((_, i) => <RowSkeleton key={i} />)
                : enrichedList.map((entity, i) => (
                    <EntityRow
                      key={`${tab}-${entity.driverName}`}
                      entity={entity}
                      rank={i + 1}
                      controversy={controversyMap[entity.driverName.toUpperCase()]}
                      isSelected={selected === entity.driverName}
                      onSelect={() =>
                        setSelected(selected === entity.driverName ? null : entity.driverName)
                      }
                    />
                  ))}

              {!loading && enrichedList.length === 0 && (
                <div style={{ padding: 32, textAlign: 'center', fontSize: 12, color: 'var(--t2)' }}>
                  {tab === 'team' ? 'No constructor sentiment data yet.' : 'No driver sentiment data yet.'}
                </div>
              )}
            </section>

            <aside
              style={{
                border: '1px solid var(--b1)',
                borderRadius: 14,
                overflow: 'hidden',
                background: 'var(--card)',
                position: 'sticky',
                top: 'calc(var(--header-h) + 20px)',
                minHeight: 320,
              }}
            >
              {selectedEntity ? (
                <EntityDetail
                  entityName={selectedEntity.driverName}
                  entityType={tab}
                  timeseries={detailTimeseries.data}
                  loading={detailTimeseries.loading}
                  controversy={controversyMap[selectedEntity.driverName.toUpperCase()]}
                  influenceScore={selectedEntity.influenceScore}
                  storyline={selectedEntity.topCluster}
                  onClose={() => setSelected(null)}
                />
              ) : (
                <EmptyDetail />
              )}
            </aside>
          </main>

          {/* 4 + 10 */}
          <section className="drivers-grid-2" style={{ marginBottom: 18 }}>
            <Panel title="CONTROVERSY RADAR">
              <ControversyRadar
                entity={selectedEntity ?? enrichedList[0]}
                controversy={selectedEntity ? controversyMap[selectedEntity.driverName.toUpperCase()] : controversyMap[enrichedList[0]?.driverName?.toUpperCase() ?? '']}
              />
            </Panel>
            <Panel title="DRIVER NETWORK GRAPH">
              <DriverNetworkGraph entities={enrichedList} onSelect={setSelected} selected={selected} />
            </Panel>
          </section>

          {/* 7 */}
          <section style={{ marginBottom: 18 }}>
            <Panel title="DRIVER NARRATIVE CLUSTERS">
              <NarrativeClusters entities={enrichedList} onSelect={setSelected} />
            </Panel>
          </section>
        </div>

        <Footer />
      </div>
    </div>
  )
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, letterSpacing: '.14em', color: 'var(--t3)', marginBottom: 4 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 12, color: 'var(--t2)' }}>{subtitle}</div>}
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        border: '1px solid var(--b1)',
        borderRadius: 16,
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

function MetricCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div
      style={{
        border: '1px solid var(--b1)',
        borderRadius: 16,
        background: 'rgba(0,0,0,.24)',
        padding: '18px 18px 16px',
      }}
    >
      <div style={{ fontSize: 10, letterSpacing: '.14em', color: 'var(--t3)', marginBottom: 8 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-bebas)', fontSize: 36, lineHeight: 1, color }}>{value}</div>
    </div>
  )
}

function PulseCard({
  item,
}: {
  item: { label: string; entity: any; accent: string; note: string }
}) {
  const color = ENTITY_COLORS[item.entity.driverName.toUpperCase()] || item.accent
  return (
    <div
      style={{
        border: '1px solid var(--b1)',
        borderRadius: 14,
        background: 'rgba(0,0,0,.24)',
        padding: 16,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, ${color}10, transparent 50%)`, pointerEvents: 'none' }} />
      <div style={{ fontSize: 9, letterSpacing: '.14em', color: item.accent, marginBottom: 10 }}>{item.label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{ width: 4, height: 28, borderRadius: 2, background: color }} />
        <div style={{ fontFamily: 'var(--font-bebas)', fontSize: 22, letterSpacing: '.05em', color: 'var(--t1)' }}>
          {item.entity.driverName}
        </div>
      </div>
      <div style={{ color: 'var(--t2)', fontSize: 12 }}>{item.note}</div>
      <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <MiniChip label={`${item.entity.mentions} mentions`} />
        <MiniChip label={`${sign(item.entity.sentimentAvg)}`} />
        {item.entity.controversyScore > 0 && <MiniChip label={`${Math.round(item.entity.controversyScore)}/100 controversy`} />}
      </div>
    </div>
  )
}

function MiniChip({ label }: { label: string }) {
  return (
    <span
      style={{
        padding: '5px 8px',
        borderRadius: 999,
        border: '1px solid var(--b1)',
        color: 'var(--t2)',
        background: 'rgba(255,255,255,.02)',
        fontSize: 10,
      }}
    >
      {label}
    </span>
  )
}

function SentimentDistribution({ entities }: { entities: any[] }) {
  const positive = entities.filter((e) => e.sentimentLabel === 'positive').length
  const neutral = entities.filter((e) => e.sentimentLabel === 'neutral').length
  const negative = entities.filter((e) => e.sentimentLabel === 'negative').length
  const total = Math.max(positive + neutral + negative, 1)

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ height: 18, borderRadius: 999, overflow: 'hidden', display: 'flex', background: 'var(--b1)' }}>
        <div style={{ width: `${(positive / total) * 100}%`, background: 'var(--green)' }} />
        <div style={{ width: `${(neutral / total) * 100}%`, background: 'var(--t3)' }} />
        <div style={{ width: `${(negative / total) * 100}%`, background: 'var(--red)' }} />
      </div>

      <div className="drivers-grid-3">
        <DistStat label="POSITIVE" value={positive} color="var(--green)" />
        <DistStat label="NEUTRAL" value={neutral} color="var(--t2)" />
        <DistStat label="NEGATIVE" value={negative} color="var(--red)" />
      </div>
    </div>
  )
}

function DistStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ border: '1px solid var(--b1)', borderRadius: 10, padding: '12px 14px', background: 'var(--bg2)' }}>
      <div style={{ fontSize: 9, letterSpacing: '.12em', color: 'var(--t3)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-bebas)', fontSize: 28, color }}>{value}</div>
    </div>
  )
}

function MomentumChart({ entities }: { entities: any[] }) {
  const top = [...entities].sort((a, b) => (b.mentions ?? 0) - (a.mentions ?? 0)).slice(0, 8)
  const max = Math.max(...top.map((e) => e.mentions ?? 0), 1)

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {top.map((e) => {
        const color = ENTITY_COLORS[e.driverName.toUpperCase()] || 'var(--blue)'
        return (
          <div key={e.driverName} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 54px', gap: 12, alignItems: 'center' }}>
            <div style={{ fontSize: 12, color: 'var(--t1)' }}>{e.driverName}</div>
            <div style={{ height: 10, borderRadius: 999, background: 'var(--b1)', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${((e.mentions ?? 0) / max) * 100}%`,
                  height: '100%',
                  background: color,
                  borderRadius: 999,
                }}
              />
            </div>
            <div style={{ textAlign: 'right', fontFamily: 'var(--font-bebas)', fontSize: 20, color }}>{e.mentions}</div>
          </div>
        )
      })}
    </div>
  )
}

function InfluenceScore({
  entities,
  onSelect,
  selected,
}: {
  entities: any[]
  onSelect: (name: string) => void
  selected: string | null
}) {
  const top = [...entities].sort((a, b) => (b.influenceScore ?? 0) - (a.influenceScore ?? 0)).slice(0, 8)
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {top.map((e, idx) => {
        const color = ENTITY_COLORS[e.driverName.toUpperCase()] || 'var(--blue)'
        const active = selected === e.driverName
        return (
          <button
            key={e.driverName}
            onClick={() => onSelect(e.driverName)}
            style={{
              display: 'grid',
              gridTemplateColumns: '28px 1fr 76px',
              gap: 10,
              alignItems: 'center',
              padding: '10px 12px',
              borderRadius: 10,
              border: `1px solid ${active ? color : 'var(--b1)'}`,
              background: active ? `${color}12` : 'rgba(255,255,255,.02)',
              cursor: 'pointer',
              textAlign: 'left',
              color: 'inherit',
            }}
          >
            <span style={{ color: 'var(--t3)', fontSize: 11 }}>{idx + 1}</span>
            <span style={{ color: 'var(--t1)', fontSize: 13 }}>{e.driverName}</span>
            <span style={{ textAlign: 'right', fontFamily: 'var(--font-bebas)', fontSize: 24, color }}>
              {e.influenceScore}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function TopStorylines({ entities, onSelect }: { entities: any[]; onSelect: (name: string) => void }) {
  const top = [...entities].sort((a, b) => (b.mentions ?? 0) - (a.mentions ?? 0)).slice(0, 6)

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {top.map((e) => {
        const color = ENTITY_COLORS[e.driverName.toUpperCase()] || 'var(--blue)'
        return (
          <button
            key={e.driverName}
            onClick={() => onSelect(e.driverName)}
            style={{
              border: '1px solid var(--b1)',
              borderRadius: 12,
              background: 'rgba(255,255,255,.02)',
              padding: 12,
              cursor: 'pointer',
              textAlign: 'left',
              color: 'inherit',
            }}
          >
            <div style={{ fontSize: 10, letterSpacing: '.12em', color, marginBottom: 8 }}>{e.driverName}</div>
            <div style={{ color: 'var(--t1)', fontSize: 14, lineHeight: 1.5 }}>{formatClusterName(e.topCluster)}</div>
          </button>
        )
      })}
    </div>
  )
}

function TrendLines({ tab, entities }: { tab: Tab; entities: any[] }) {
  const [seriesMap, setSeriesMap] = useState<Record<string, TimeseriesPoint[]>>({})

  useEffect(() => {
    let mounted = true
    Promise.all(
      entities.map((e) =>
        fetch(`/api/intelligence/drivers?format=timeseries&type=${tab}&driver=${encodeURIComponent(e.driverName)}&days=30`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => [e.driverName, d?.ok ? (d.data ?? []).map(normalizeTimeseriesRow) : []] as const)
      )
    ).then((results) => {
      if (!mounted) return
      setSeriesMap(Object.fromEntries(results))
    })

    return () => {
      mounted = false
    }
  }, [tab, entities])

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {entities.map((e) => (
        <MiniTrend key={e.driverName} entity={e} data={seriesMap[e.driverName] ?? []} />
      ))}
    </div>
  )
}

function MiniTrend({ entity, data }: { entity: any; data: TimeseriesPoint[] }) {
  const color = ENTITY_COLORS[entity.driverName.toUpperCase()] || 'var(--blue)'
  const max = Math.max(...data.map((d) => d.sentimentAvg), 0.25)
  const min = Math.min(...data.map((d) => d.sentimentAvg), -0.25)

  const points = data
    .map((d, i) => {
      const x = (i / Math.max(data.length - 1, 1)) * 180
      const y = 40 - (((d.sentimentAvg - min) / Math.max(max - min, 0.0001)) * 32)
      return `${x},${y}`
    })
    .join(' ')

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 70px', gap: 12, alignItems: 'center' }}>
      <div>
        <div style={{ color: 'var(--t1)', fontSize: 13 }}>{entity.driverName}</div>
        <div style={{ fontSize: 10, color: 'var(--t3)' }}>{entity.sentimentDelta > 0 ? 'Rising' : entity.sentimentDelta < 0 ? 'Falling' : 'Stable'}</div>
      </div>
      <div style={{ height: 44, borderRadius: 8, background: 'rgba(255,255,255,.02)', border: '1px solid var(--b1)', padding: '2px 6px' }}>
        {data.length > 1 ? (
          <svg width="100%" height="38" viewBox="0 0 180 40" preserveAspectRatio="none">
            <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <div style={{ fontSize: 10, color: 'var(--t3)', display: 'flex', alignItems: 'center', height: '100%' }}>No trend data</div>
        )}
      </div>
      <div style={{ textAlign: 'right', color: entity.sentimentDelta > 0 ? 'var(--green)' : entity.sentimentDelta < 0 ? 'var(--red)' : 'var(--t3)', fontSize: 12 }}>
        {sign(entity.sentimentDelta)}
      </div>
    </div>
  )
}

function MentionsHeatmap({ tab, entities }: { tab: Tab; entities: any[] }) {
  const [seriesMap, setSeriesMap] = useState<Record<string, TimeseriesPoint[]>>({})

  useEffect(() => {
    let mounted = true
    Promise.all(
      entities.map((e) =>
        fetch(`/api/intelligence/drivers?format=timeseries&type=${tab}&driver=${encodeURIComponent(e.driverName)}&days=14`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => [e.driverName, d?.ok ? (d.data ?? []).map(normalizeTimeseriesRow).slice(-7) : []] as const)
      )
    ).then((results) => {
      if (!mounted) return
      setSeriesMap(Object.fromEntries(results))
    })
    return () => {
      mounted = false
    }
  }, [tab, entities])

  const allValues = Object.values(seriesMap).flat().map((d) => d.mentions)
  const max = Math.max(...allValues, 1)

  const dates = Object.values(seriesMap)[0]?.map((d) =>
    new Date(d.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  ) ?? []

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: 420 }}>
        {dates.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '110px repeat(7, 1fr)', gap: 6, marginBottom: 8 }}>
            <div />
            {dates.map((d) => (
              <div key={d} style={{ textAlign: 'center', fontSize: 9, color: 'var(--t3)' }}>{d}</div>
            ))}
          </div>
        )}
        <div style={{ display: 'grid', gap: 8 }}>
          {entities.map((e) => {
            const row = seriesMap[e.driverName] ?? []
            return (
              <div key={e.driverName} style={{ display: 'grid', gridTemplateColumns: '110px repeat(7, 1fr)', gap: 6, alignItems: 'center' }}>
                <div style={{ color: 'var(--t1)', fontSize: 12 }}>{e.driverName}</div>
                {Array.from({ length: 7 }).map((_, i) => {
                  const value = row[i]?.mentions ?? 0
                  const color = ENTITY_COLORS[e.driverName.toUpperCase()] || 'var(--blue)'
                  const alpha = clamp(value / max, 0.08, 1)
                  return (
                    <div
                      key={i}
                      title={`${e.driverName}: ${value} mentions`}
                      style={{
                        height: 24,
                        borderRadius: 6,
                        border: '1px solid var(--b1)',
                        background: value > 0 ? hexToRgba(color, alpha) : 'rgba(255,255,255,.02)',
                      }}
                    />
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function ControversyRadar({
  entity,
  controversy,
}: {
  entity?: any
  controversy?: ControversyEntity
}) {
  if (!entity || !controversy) {
    return <div style={{ color: 'var(--t2)', fontSize: 12 }}>Select an entity to view controversy radar.</div>
  }

  const color = ENTITY_COLORS[entity.driverName.toUpperCase()] || 'var(--blue)'
  const values = [
    controversy?.components?.sentiment ?? 0,
    controversy?.components?.fia ?? 0,
    controversy?.components?.spike ?? 0,
    controversy?.components?.media ?? 0,
  ]
  const labels = ['SENTIMENT', 'FIA', 'SPIKE', 'MEDIA']
  const cx = 120
  const cy = 110
  const r = 70

  const pts = values
    .map((v, i) => {
      const angle = (-90 + i * 90) * (Math.PI / 180)
      const rr = (clamp(v, 0, 100) / 100) * r
      const x = cx + Math.cos(angle) * rr
      const y = cy + Math.sin(angle) * rr
      return `${x},${y}`
    })
    .join(' ')

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10, letterSpacing: '.12em', color, marginBottom: 6 }}>{entity.driverName}</div>
        <div style={{ color: 'var(--t2)', fontSize: 12 }}>Composite controversy signature</div>
      </div>

      <svg width="100%" height="240" viewBox="0 0 240 220">
        {[0.25, 0.5, 0.75, 1].map((scale) => (
          <polygon
            key={scale}
            points={labels
              .map((_, i) => {
                const angle = (-90 + i * 90) * (Math.PI / 180)
                const rr = r * scale
                const x = cx + Math.cos(angle) * rr
                const y = cy + Math.sin(angle) * rr
                return `${x},${y}`
              })
              .join(' ')}
            fill="none"
            stroke="rgba(255,255,255,.12)"
            strokeWidth="1"
          />
        ))}
        {labels.map((label, i) => {
          const angle = (-90 + i * 90) * (Math.PI / 180)
          const x = cx + Math.cos(angle) * (r + 22)
          const y = cy + Math.sin(angle) * (r + 22)
          return (
            <g key={label}>
              <line x1={cx} y1={cy} x2={cx + Math.cos(angle) * r} y2={cy + Math.sin(angle) * r} stroke="rgba(255,255,255,.12)" />
              <text x={x} y={y} textAnchor="middle" fontSize="9" fill="rgba(255,255,255,.55)">{label}</text>
            </g>
          )
        })}
        <polygon points={pts} fill={hexToRgba(color, 0.22)} stroke={color} strokeWidth="2" />
      </svg>

      <div className="drivers-grid-4">
        {labels.map((l, idx) => (
          <div key={l} style={{ border: '1px solid var(--b1)', borderRadius: 10, padding: '10px 12px', background: 'var(--bg2)' }}>
            <div style={{ fontSize: 8, letterSpacing: '.12em', color: 'var(--t3)', marginBottom: 4 }}>{l}</div>
            <div style={{ fontFamily: 'var(--font-bebas)', fontSize: 22, color }}>{Math.round(values[idx])}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function NarrativeClusters({ entities, onSelect }: { entities: any[]; onSelect: (name: string) => void }) {
  const grouped = entities.reduce<Record<string, any[]>>((acc, e) => {
    const key = e.narrativeGroup || 'GENERAL'
    acc[key] ||= []
    acc[key].push(e)
    return acc
  }, {})

  return (
    <div className="drivers-grid-3">
      {Object.entries(grouped).map(([group, items]) => (
        <div
          key={group}
          style={{
            border: '1px solid var(--b1)',
            borderRadius: 12,
            background: 'rgba(255,255,255,.02)',
            padding: 14,
          }}
        >
          <div style={{ fontSize: 10, letterSpacing: '.14em', color: 'var(--t3)', marginBottom: 12 }}>{group}</div>
          <div style={{ display: 'grid', gap: 10 }}>
            {items.slice(0, 4).map((e) => (
              <button
                key={e.driverName}
                onClick={() => onSelect(e.driverName)}
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  color: 'inherit',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{ width: 4, height: 30, borderRadius: 2, background: ENTITY_COLORS[e.driverName.toUpperCase()] || 'var(--blue)', flexShrink: 0 }} />
                <div>
                  <div style={{ color: 'var(--t1)', fontSize: 13, marginBottom: 2 }}>{e.driverName}</div>
                  <div style={{ color: 'var(--t2)', fontSize: 11, lineHeight: 1.5 }}>{formatClusterName(e.topCluster)}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function DriverNetworkGraph({
  entities,
  onSelect,
  selected,
}: {
  entities: any[]
  onSelect: (name: string) => void
  selected: string | null
}) {
  const top = [...entities].sort((a, b) => (b.influenceScore ?? 0) - (a.influenceScore ?? 0)).slice(0, 6)
  const center = top[0]
  const others = top.slice(1)
  const centerX = 180
  const centerY = 110
  const radius = 80

  return (
    <div>
      <div style={{ color: 'var(--t2)', fontSize: 12, marginBottom: 12 }}>
        Shared narrative links across highest-influence entities
      </div>
      <svg width="100%" height="240" viewBox="0 0 360 220">
        {center && others.map((e, i) => {
          const angle = (i / Math.max(others.length, 1)) * Math.PI * 2 - Math.PI / 2
          const x = centerX + Math.cos(angle) * radius
          const y = centerY + Math.sin(angle) * radius
          const shared = classifyNarrative(center.topCluster) === classifyNarrative(e.topCluster)
          const color = ENTITY_COLORS[e.driverName.toUpperCase()] || 'var(--blue)'

          return (
            <g key={e.driverName}>
              <line
                x1={centerX}
                y1={centerY}
                x2={x}
                y2={y}
                stroke={shared ? color : 'rgba(255,255,255,.16)'}
                strokeWidth={shared ? 2 : 1}
              />
              <circle
                cx={x}
                cy={y}
                r={selected === e.driverName ? 16 : 13}
                fill={hexToRgba(color, 0.22)}
                stroke={color}
                strokeWidth="2"
                style={{ cursor: 'pointer' }}
                onClick={() => onSelect(e.driverName)}
              />
              <text x={x} y={y + 30} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,.7)">
                {e.driverName}
              </text>
            </g>
          )
        })}
        {center && (
          <g>
            <circle
              cx={centerX}
              cy={centerY}
              r={selected === center.driverName ? 20 : 18}
              fill={hexToRgba(ENTITY_COLORS[center.driverName.toUpperCase()] || '#38bdf8', 0.28)}
              stroke={ENTITY_COLORS[center.driverName.toUpperCase()] || '#38bdf8'}
              strokeWidth="2.5"
              style={{ cursor: 'pointer' }}
              onClick={() => onSelect(center.driverName)}
            />
            <text x={centerX} y={centerY + 36} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,.8)">
              {center.driverName}
            </text>
          </g>
        )}
      </svg>
    </div>
  )
}

function EntityRow({
  entity,
  rank,
  controversy,
  isSelected,
  onSelect,
}: {
  entity: any
  rank: number
  controversy?: ControversyEntity
  isSelected: boolean
  onSelect: () => void
}) {
  const color = ENTITY_COLORS[entity.driverName.toUpperCase()] || 'var(--t3)'
  const sentColor =
    entity.sentimentLabel === 'positive'
      ? 'var(--green)'
      : entity.sentimentLabel === 'negative'
        ? 'var(--red)'
        : 'var(--t2)'

  const delta = entity.sentimentDelta ?? 0
  const deltaColor = delta > 0.02 ? 'var(--green)' : delta < -0.02 ? 'var(--red)' : 'var(--t3)'
  const arrow = delta > 0.02 ? '↑' : delta < -0.02 ? '↓' : '→'

  const conScore = controversy?.score ?? 0
  const conColor =
    conScore >= 65
      ? 'var(--red)'
      : conScore >= 35
        ? 'var(--gold)'
        : conScore >= 10
          ? 'var(--blue)'
          : 'var(--t3)'

  return (
    <div
      className="drivers-row"
      onClick={onSelect}
      style={{
        display: 'grid',
        gridTemplateColumns: '32px 1fr 80px 100px 100px 80px 100px',
        gap: 8,
        padding: '12px 16px',
        borderBottom: '1px solid var(--b1)',
        cursor: 'pointer',
        alignItems: 'center',
        background: isSelected ? 'rgba(225,6,0,.06)' : 'transparent',
        borderLeft: isSelected ? `2px solid ${color}` : '2px solid transparent',
        transition: 'all .15s',
      }}
      onMouseEnter={(e) => {
        if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'var(--card-h)'
      }}
      onMouseLeave={(e) => {
        if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'transparent'
      }}
    >
      <span style={{ fontSize: 11, color: 'var(--t3)', fontFamily: 'var(--font-bebas)' }}>{rank}</span>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 3, height: 24, background: color, borderRadius: 2, flexShrink: 0 }} />
        <span style={{ fontFamily: 'var(--font-bebas)', fontSize: 15, letterSpacing: '.06em' }}>{entity.driverName}</span>
      </div>

      <span style={{ textAlign: 'right', fontFamily: 'var(--font-bebas)', fontSize: 18 }}>{entity.mentions ?? 0}</span>

      <div style={{ textAlign: 'right' }}>
        <span style={{ fontSize: 11, color: sentColor }}>
          {(entity.sentimentAvg ?? 0) > 0 ? '+' : ''}
          {Number(entity.sentimentAvg ?? 0).toFixed(3)}
        </span>
      </div>

      <div style={{ textAlign: 'right' }}>
        <span style={{ fontSize: 11, color: deltaColor }}>
          {delta > 0 ? '+' : ''}
          {delta.toFixed(3)}
        </span>
      </div>

      <div style={{ textAlign: 'center', fontSize: 16, color: deltaColor }}>{arrow}</div>

      <div style={{ textAlign: 'right' }}>
        {conScore > 0 ? (
          <span style={{ fontFamily: 'var(--font-bebas)', fontSize: 16, color: conColor }}>
            {Math.round(conScore)}
            <span style={{ fontSize: 9, color: 'var(--t3)', marginLeft: 2 }}>/100</span>
          </span>
        ) : (
          <span style={{ color: 'var(--t3)', fontSize: 10 }}>—</span>
        )}
      </div>
    </div>
  )
}

function EntityDetail({
  entityName,
  entityType,
  timeseries,
  loading,
  controversy,
  influenceScore,
  storyline,
  onClose,
}: {
  entityName: string
  entityType: Tab
  timeseries: TimeseriesPoint[]
  loading: boolean
  controversy?: ControversyEntity
  influenceScore?: number
  storyline?: string | null
  onClose: () => void
}) {
  const color = ENTITY_COLORS[entityName.toUpperCase()] || 'var(--blue)'
  const maxM = Math.max(...timeseries.map((d) => d.mentions ?? 0), 1)

  const pts = timeseries
    .map((d, i) => {
      const x = (i / Math.max(timeseries.length - 1, 1)) * 240
      const y = 60 - ((d.mentions ?? 0) / maxM) * 50
      return `${x},${y}`
    })
    .join(' ')

  return (
    <div>
      <div
        style={{
          padding: '16px 20px',
          background: color + '18',
          borderBottom: '1px solid var(--b1)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <div style={{ fontSize: 9, letterSpacing: '.14em', color: 'var(--t2)', marginBottom: 3 }}>
            {entityType === 'team' ? 'CONSTRUCTOR' : 'DRIVER'} INTELLIGENCE
          </div>
          <div style={{ fontFamily: 'var(--font-bebas)', fontSize: 22, letterSpacing: '.08em', color }}>
            {entityName}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: '1px solid var(--b1)',
            color: 'var(--t2)',
            width: 28,
            height: 28,
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          ×
        </button>
      </div>

      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--b1)' }}>
        <div style={{ fontSize: 9, letterSpacing: '.14em', color: 'var(--t3)', marginBottom: 8 }}>
          CURRENT SNAPSHOT
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <DetailMiniStat label="INFLUENCE" value={influenceScore ? `${influenceScore}/100` : '—'} color={color} />
          <DetailMiniStat label="STORYLINE" value={formatClusterName(storyline)} />
        </div>
      </div>

      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--b1)' }}>
        <div style={{ fontSize: 9, letterSpacing: '.14em', color: 'var(--t3)', marginBottom: 8 }}>
          30-DAY MENTION TREND
        </div>
        {loading ? (
          <div className="skeleton" style={{ height: 60, borderRadius: 4 }} />
        ) : timeseries.length > 1 ? (
          <svg width="100%" height="72" viewBox="0 0 240 72" style={{ overflow: 'visible' }}>
            <polyline
              points={pts}
              fill="none"
              stroke={color}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {[0, timeseries.length - 1].map((i) => (
              <text
                key={i}
                x={i === 0 ? 0 : 240}
                y={72}
                fontSize="8"
                fill="rgba(255,255,255,.3)"
                textAnchor={i === 0 ? 'start' : 'end'}
              >
                {new Date(timeseries[i].date).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                })}
              </text>
            ))}
          </svg>
        ) : (
          <div style={{ fontSize: 10, color: 'var(--t3)' }}>No timeseries data yet</div>
        )}
      </div>

      {timeseries.length > 0 && (
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--b1)' }}>
          <div style={{ fontSize: 9, letterSpacing: '.14em', color: 'var(--t3)', marginBottom: 10 }}>
            SENTIMENT BREAKDOWN
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
            {[
              {
                l: 'POSITIVE',
                v: timeseries.reduce((s, d) => s + (d.positiveCount ?? 0), 0),
                c: 'var(--green)',
              },
              {
                l: 'NEUTRAL',
                v: timeseries.reduce((s, d) => s + (d.neutralCount ?? 0), 0),
                c: 'var(--t2)',
              },
              {
                l: 'NEGATIVE',
                v: timeseries.reduce((s, d) => s + (d.negativeCount ?? 0), 0),
                c: 'var(--red)',
              },
            ].map((s) => (
              <div
                key={s.l}
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--b1)',
                  background: 'var(--bg2)',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontFamily: 'var(--font-bebas)', fontSize: 22, color: s.c }}>{s.v}</div>
                <div style={{ fontSize: 8, letterSpacing: '.1em', color: 'var(--t3)', marginTop: 2 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(controversy?.score ?? 0) > 0 && (
        <div style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: 9, letterSpacing: '.14em', color: 'var(--t3)', marginBottom: 10 }}>
            CONTROVERSY INDEX
          </div>
          {[
            { l: 'SENTIMENT', v: controversy?.components?.sentiment, c: 'var(--red)' },
            { l: 'FIA', v: controversy?.components?.fia, c: 'var(--gold)' },
            { l: 'SPIKE', v: controversy?.components?.spike, c: 'var(--blue)' },
            { l: 'MEDIA', v: controversy?.components?.media, c: 'var(--purple)' },
          ].map((comp) => (
            <div key={comp.l} style={{ marginBottom: 8 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 8,
                  color: 'var(--t3)',
                  letterSpacing: '.1em',
                  marginBottom: 3,
                }}
              >
                <span>{comp.l}</span>
                <span>{Math.round(comp.v || 0)}/100</span>
              </div>
              <div style={{ height: 3, background: 'var(--b1)', borderRadius: 2 }}>
                <div
                  style={{
                    height: '100%',
                    borderRadius: 2,
                    background: comp.c,
                    width: `${comp.v || 0}%`,
                    transition: 'width .8s ease',
                  }}
                />
              </div>
            </div>
          ))}
          <div
            style={{
              marginTop: 12,
              padding: '8px 12px',
              background: 'var(--bg2)',
              borderRadius: 6,
              border: '1px solid var(--b1)',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span style={{ fontSize: 10, color: 'var(--t2)' }}>COMPOSITE SCORE</span>
            <span
              style={{
                fontFamily: 'var(--font-bebas)',
                fontSize: 18,
                color:
                  (controversy?.score ?? 0) >= 65
                    ? 'var(--red)'
                    : (controversy?.score ?? 0) >= 35
                      ? 'var(--gold)'
                      : 'var(--blue)',
              }}
            >
              {Math.round(controversy?.score ?? 0)}/100
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

function DetailMiniStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ border: '1px solid var(--b1)', borderRadius: 8, padding: '10px 12px', background: 'var(--bg2)' }}>
      <div style={{ fontSize: 8, letterSpacing: '.12em', color: 'var(--t3)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 12, lineHeight: 1.5, color: color || 'var(--t1)' }}>{value}</div>
    </div>
  )
}

function EmptyDetail() {
  return (
    <div style={{ padding: 24, color: 'var(--t2)', fontSize: 12, lineHeight: 1.7 }}>
      Select a driver or constructor to open the intelligence panel. This drawer shows trend lines, sentiment breakdown, storyline, and controversy structure.
    </div>
  )
}

function RowSkeleton() {
  return (
    <div
      className="drivers-row"
      style={{
        display: 'grid',
        gridTemplateColumns: '32px 1fr 80px 100px 100px 80px 100px',
        gap: 8,
        padding: '12px 16px',
        borderBottom: '1px solid var(--b1)',
        alignItems: 'center',
      }}
    >
      {[20, 200, 40, 60, 50, 20, 40].map((w, i) => (
        <div
          key={i}
          className="skeleton"
          style={{
            height: 14,
            width: w,
            justifySelf: i === 0 ? 'start' : i === 1 ? 'stretch' : i === 5 ? 'center' : 'end',
          }}
        />
      ))}
    </div>
  )
}

function sign(value?: number) {
  const v = Number(value ?? 0)
  return `${v > 0 ? '+' : ''}${v.toFixed(3)}`
}

function hexToRgba(hex: string, alpha: number) {
  if (!hex.startsWith('#')) return `rgba(56,189,248,${alpha})`
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const bigint = parseInt(h, 16)
  const r = (bigint >> 16) & 255
  const g = (bigint >> 8) & 255
  const b = bigint & 255
  return `rgba(${r},${g},${b},${alpha})`
}