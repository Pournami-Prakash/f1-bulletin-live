'use client'
// components/ClusterFeed.tsx

import { useState } from 'react'

interface Props {
  clusters: any[]
  loading: boolean
  limit?: number
}

const PRIORITY_COLOR: Record<string, string> = {
  BREAKING: 'var(--red)',
  HIGH:     'var(--gold)',
  NORMAL:   'var(--blue)',
  LOW:      'var(--t3)',
}

const VELOCITY_ICON: Record<string, string> = {
  SURGING:  '🔥',
  BUILDING: '↑',
  STABLE:   '→',
  FADING:   '↓',
  DEAD:     '—',
}

export default function ClusterFeed({ clusters, loading, limit = 8 }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const display = loading
    ? Array(limit).fill(null)
    : clusters.slice(0, limit)

  return (
    <div style={{ marginTop: 26, display: 'flex', flexDirection: 'column', gap: 1 }}>
      {display.map((cluster, i) => (
        loading
          ? <ClusterSkeleton key={i} />
          : <ClusterRow
              key={cluster.clusterId}
              cluster={cluster}
              isOpen={expanded === cluster.clusterId}
              onToggle={() => setExpanded(
                expanded === cluster.clusterId ? null : cluster.clusterId
              )}
            />
      ))}
    </div>
  )
}

function ClusterRow({ cluster, isOpen, onToggle }: {
  cluster: any; isOpen: boolean; onToggle: () => void
}) {
  const accentColor = PRIORITY_COLOR[cluster.priority] || 'var(--blue)'
  const velIcon     = VELOCITY_ICON[cluster.velocityLabel] || '→'
  const sentColor   = cluster.sentimentLabel === 'positive' ? 'var(--green)'
    : cluster.sentimentLabel === 'negative' ? 'var(--red)' : 'var(--t3)'

  return (
    <div style={{
      border: '1px solid var(--b1)', borderRadius: 10,
      overflow: 'hidden', background: 'var(--card)',
      transition: 'border-color .2s',
    }}
      onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--b2)'}
      onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--b1)'}
    >
      {/* Tab */}
      <div
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 18px', cursor: 'pointer',
          borderBottom: isOpen ? '1px solid var(--b1)' : '1px solid transparent',
          transition: 'background .15s',
        }}
        onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--card-h)'}
        onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
      >
        {/* Expand icon */}
        <div style={{
          width: 26, height: 26, borderRadius: 5,
          border: '1px solid var(--b1)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          fontSize: 12, flexShrink: 0, background: 'var(--bg2)',
          transform: isOpen ? 'rotate(90deg)' : 'none',
          transition: 'transform .3s',
        }}>▶</div>

        {/* Priority badge */}
        <span className={`badge priority-${cluster.priority?.toLowerCase()}`}>
          {cluster.priority || 'NORMAL'}
        </span>

        {/* Cluster name */}
        <span style={{
          fontFamily: 'var(--font-bebas)', fontSize: 16,
          letterSpacing: '.06em', flex: 1,
        }}>
          {cluster.clusterName?.replace(/_/g, ' ')}
        </span>

        {/* Stats */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
          <span style={{ fontSize: 10, color: 'var(--t2)' }}>
            {cluster.articleCount} signals
          </span>
          <span style={{ fontSize: 12, color: sentColor }}>
            {velIcon}
          </span>
          <span className={`sentiment sentiment-${cluster.sentimentLabel || 'neutral'}`}>
            {cluster.sentimentLabel || 'neutral'}
          </span>
          {cluster.isSpike && (
            <span style={{
              fontSize: 9, letterSpacing: '.1em', padding: '2px 8px',
              borderRadius: 3, color: 'var(--red)',
              background: 'rgba(225,6,0,.12)',
              border: '1px solid rgba(225,6,0,.25)',
            }}>
              ⚡ SPIKE
            </span>
          )}
          <span style={{ fontSize: 10, color: 'var(--t3)' }}>
            {isOpen ? '▲' : '▼'}
          </span>
        </div>
      </div>

      {/* Body */}
      {isOpen && (
        <div style={{ padding: '18px 18px 18px 56px' }}>
          {cluster.summary ? (
            <p style={{ fontSize: 12, color: 'var(--t2)', lineHeight: 1.7, marginBottom: 14 }}>
              {cluster.summary}
            </p>
          ) : (
            <p style={{ fontSize: 11, color: 'var(--t3)', fontStyle: 'italic' }}>
              Summary generating...
            </p>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {cluster.momentumScore != null && (
              <MiniStat label="MOMENTUM" value={`${Math.round(cluster.momentumScore)}/100`} />
            )}
            {cluster.articlesLastHour != null && (
              <MiniStat label="LAST HOUR" value={`${cluster.articlesLastHour} signals`} />
            )}
            {cluster.sentimentAvg != null && (
              <MiniStat
                label="SENTIMENT"
                value={cluster.sentimentAvg > 0 ? `+${cluster.sentimentAvg.toFixed(2)}` : cluster.sentimentAvg.toFixed(2)}
              />
            )}
            {cluster.velocityLabel && (
              <MiniStat label="VELOCITY" value={cluster.velocityLabel} />
            )}
          </div>

          {/* Score bar */}
          <div className="score-bar" style={{ marginTop: 14 }}>
            <div className="score-fill" style={{
              width: `${cluster.momentumScore || 0}%`,
              background: accentColor,
            }} />
          </div>
        </div>
      )}
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      padding: '5px 12px', borderRadius: 6,
      border: '1px solid var(--b1)', background: 'var(--bg2)',
    }}>
      <div style={{ fontSize: 8, letterSpacing: '.12em', color: 'var(--t3)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 11, color: 'var(--t1)', fontFamily: 'var(--font-mono)' }}>{value}</div>
    </div>
  )
}

function ClusterSkeleton() {
  return (
    <div style={{
      border: '1px solid var(--b1)', borderRadius: 10,
      padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'center',
    }}>
      <div className="skeleton" style={{ width: 26, height: 26, borderRadius: 5, flexShrink: 0 }} />
      <div className="skeleton" style={{ width: 60, height: 18, borderRadius: 3 }} />
      <div className="skeleton" style={{ flex: 1, height: 18 }} />
      <div className="skeleton" style={{ width: 80, height: 18 }} />
    </div>
  )
}
