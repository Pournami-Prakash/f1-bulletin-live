'use client'
// components/StatsGrid.tsx

import { useEffect, useRef } from 'react'

interface Props {
  overview: any
  loading: boolean
}

export default function StatsGrid({ overview, loading }: Props) {
  const refs = useRef<(HTMLDivElement | null)[]>([])

  const stats = [
    {
      value: overview?.pipeline?.totalSignals ?? 0,
      label: 'SIGNALS TODAY',
      sub: `↑ ${overview?.pipeline?.articlesLastHour ?? 0} new this hour`,
      color: 'var(--red)',
    },
    {
      value: overview?.clusters?.filter((c: any) => c.priority === 'BREAKING').length ?? 0,
      label: 'BREAKING P0',
      sub: `across ${overview?.clusters?.length ?? 0} clusters`,
      color: 'var(--gold)',
    },
    {
      value: 6,
      label: 'LIVE SOURCES',
      sub: 'RSS · Reddit · Official',
      color: 'var(--blue)',
    },
    {
      value: 24,
      label: 'RACES IN 2026',
      sub: 'opener Melbourne Mar 16',
      color: 'var(--green)',
    },
  ]

  // Count-up animation
  useEffect(() => {
    if (loading) return
    refs.current.forEach((el, i) => {
      if (!el) return
      const target = stats[i].value
      if (!target) return
      const dur = 1100, step = 14
      const inc = target / (dur / step)
      let v = 0
      const iv = setInterval(() => {
        v = Math.min(v + inc, target)
        if (el) el.textContent = String(Math.round(v))
        if (v >= target) clearInterval(iv)
      }, step)
    })
  }, [loading, overview])

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
      gap: 1, background: 'var(--b1)',
      border: '1px solid var(--b1)', borderRadius: 12,
      overflow: 'hidden', marginTop: 36,
    }}>
      {stats.map((stat, i) => (
        <div key={i} style={{
          background: 'var(--bg)', padding: '28px 24px',
          position: 'relative', overflow: 'hidden',
          transition: 'background var(--tr)',
        }}
          onMouseEnter={e => {
            ;(e.currentTarget as HTMLDivElement).style.background = 'var(--card-h)'
            const bar = e.currentTarget.querySelector('.stat-bar') as HTMLDivElement
            if (bar) bar.style.width = '100%'
          }}
          onMouseLeave={e => {
            ;(e.currentTarget as HTMLDivElement).style.background = 'var(--bg)'
            const bar = e.currentTarget.querySelector('.stat-bar') as HTMLDivElement
            if (bar) bar.style.width = '0'
          }}
        >
          {/* Top accent bar */}
          <div className="stat-bar" style={{
            position: 'absolute', top: 0, left: 0, height: 2,
            width: 0, background: stat.color,
            transition: 'width .4s',
          }} />

          {loading ? (
            <>
              <div className="skeleton" style={{ height: 40, width: 80, marginBottom: 8 }} />
              <div className="skeleton" style={{ height: 12, width: 120, marginBottom: 6 }} />
              <div className="skeleton" style={{ height: 10, width: 100 }} />
            </>
          ) : (
            <>
              <div
                ref={el => { refs.current[i] = el }}
                style={{
                  fontFamily: 'var(--font-bebas)',
                  fontSize: 48, lineHeight: 1,
                  color: stat.color,
                  textShadow: stat.color === 'var(--red)'
                    ? '0 0 28px rgba(225,6,0,.3)' : 'none',
                }}
              >
                {stat.value}
              </div>
              <div style={{
                fontSize: 10, letterSpacing: '.14em',
                color: 'var(--t2)', marginTop: 6,
              }}>
                {stat.label}
              </div>
              <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 3 }}>
                {stat.sub}
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  )
}
