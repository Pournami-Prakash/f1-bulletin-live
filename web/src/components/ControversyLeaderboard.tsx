'use client'
// components/ControversyLeaderboard.tsx

import { useEffect, useState } from 'react'

interface Props { loading?: boolean }

export default function ControversyLeaderboard({ loading }: Props) {
  const [data, setData]       = useState<any[]>([])
  const [fetching, setFetching] = useState(true)
  const [filter, setFilter]   = useState<'all' | 'driver' | 'team'>('all')

  useEffect(() => {
    fetch('/api/intelligence/controversy?days=1')
      .then(r => r.json())
      .then(d => { if (d.ok) setData(d.data) })
      .finally(() => setFetching(false))
  }, [])

  if (loading || fetching) return <ControversySkeleton />
  if (!data.length) {
    return (
      <div style={{
        marginTop: 26, padding: 32, border: '1px solid var(--b1)',
        borderRadius: 14, color: 'var(--t2)', fontSize: 12, textAlign: 'center',
      }}>
        Controversy index populates after pipeline runs with FIA + sentiment data.
      </div>
    )
  }

  const filtered = filter === 'all' ? data : data.filter(d => d.entityType === filter)

  return (
    <div style={{ marginTop: 26 }}>
      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {(['all','driver','team'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '5px 14px', borderRadius: 6, cursor: 'pointer',
            fontSize: 10, letterSpacing: '.1em',
            fontFamily: 'var(--font-mono)',
            border: '1px solid',
            borderColor: filter === f ? 'var(--red)' : 'var(--b1)',
            background: filter === f ? 'rgba(225,6,0,.12)' : 'var(--card)',
            color: filter === f ? 'var(--red)' : 'var(--t2)',
            transition: 'all .2s',
          }}>
            {f.toUpperCase()}
          </button>
        ))}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: 10,
      }}>
        {filtered.slice(0, 8).map((entity, i) => (
          <ControversyCard key={entity.entityName} entity={entity} rank={i + 1} />
        ))}
      </div>
    </div>
  )
}

function ControversyCard({ entity, rank }: { entity: any; rank: number }) {
  const labelColor = entity.label === 'HIGH' ? 'var(--red)'
    : entity.label === 'MEDIUM' ? 'var(--gold)'
    : entity.label === 'LOW' ? 'var(--blue)' : 'var(--t3)'

  const trendIcon = entity.trend === 'rising' ? '↑' : entity.trend === 'falling' ? '↓' : '→'
  const trendColor = entity.trend === 'rising' ? 'var(--red)'
    : entity.trend === 'falling' ? 'var(--green)' : 'var(--t3)'

  return (
    <div style={{
      border: '1px solid var(--b1)', borderRadius: 10,
      padding: '16px', background: 'var(--card)',
      transition: 'border-color .2s',
    }}
      onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = labelColor + '60'}
      onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--b1)'}
    >
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'flex-start', marginBottom: 12,
      }}>
        <div>
          <div style={{
            fontFamily: 'var(--font-bebas)',
            fontSize: 16, letterSpacing: '.06em',
          }}>
            #{rank} {entity.entityName}
          </div>
          <div style={{ fontSize: 9, color: 'var(--t3)', letterSpacing: '.1em' }}>
            {entity.entityType?.toUpperCase()}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{
            fontFamily: 'var(--font-bebas)',
            fontSize: 28, lineHeight: 1, color: labelColor,
          }}>
            {Math.round(entity.score || 0)}
          </div>
          <div style={{ fontSize: 8, color: 'var(--t3)', letterSpacing: '.1em' }}>/ 100</div>
        </div>
      </div>

      {/* Label + trend */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <span style={{
          fontSize: 9, letterSpacing: '.1em', padding: '2px 8px',
          borderRadius: 3, color: labelColor,
          background: labelColor + '18',
          border: `1px solid ${labelColor}35`,
        }}>
          {entity.label}
        </span>
        <span style={{ fontSize: 13, color: trendColor }}>{trendIcon}</span>
        {entity.delta !== 0 && entity.delta != null && (
          <span style={{ fontSize: 10, color: trendColor, alignSelf: 'center' }}>
            {entity.delta > 0 ? '+' : ''}{entity.delta?.toFixed(1)}
          </span>
        )}
      </div>

      {/* Component breakdown */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {[
          { l: 'SENTIMENT',  v: entity.components?.sentiment, c: 'var(--red)' },
          { l: 'FIA',        v: entity.components?.fia,       c: 'var(--gold)' },
          { l: 'SPIKE',      v: entity.components?.spike,     c: 'var(--blue)' },
          { l: 'MEDIA',      v: entity.components?.media,     c: 'var(--purple)' },
        ].map(comp => (
          <div key={comp.l}>
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              marginBottom: 2, fontSize: 8, color: 'var(--t3)', letterSpacing: '.1em',
            }}>
              <span>{comp.l}</span>
              <span>{Math.round(comp.v || 0)}</span>
            </div>
            <div style={{ height: 2, background: 'var(--b1)', borderRadius: 2 }}>
              <div style={{
                height: '100%', borderRadius: 2, background: comp.c,
                width: `${comp.v || 0}%`,
                transition: 'width 0.8s ease',
              }} />
            </div>
          </div>
        ))}
      </div>

      {entity.detail?.topCluster && (
        <div style={{
          marginTop: 10, fontSize: 9, color: 'var(--t3)',
          borderTop: '1px solid var(--b1)', paddingTop: 8,
        }}>
          TOP CLUSTER: {entity.detail.topCluster?.replace(/_/g, ' ')}
        </div>
      )}
    </div>
  )
}

function ControversySkeleton() {
  return (
    <div style={{
      marginTop: 26,
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
      gap: 10,
    }}>
      {Array(6).fill(null).map((_, i) => (
        <div key={i} style={{
          border: '1px solid var(--b1)', borderRadius: 10, padding: 16,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <div className="skeleton" style={{ height: 20, width: 120 }} />
            <div className="skeleton" style={{ height: 30, width: 50 }} />
          </div>
          {[0,1,2,3].map(j => (
            <div key={j} style={{ marginBottom: 8 }}>
              <div className="skeleton" style={{ height: 6, width: '100%' }} />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
