'use client'
// components/DriverPulse.tsx

interface Props {
  drivers: any[]
  loading: boolean
}

const TEAM_COLORS: Record<string, string> = {
  VERSTAPPEN: '#3671C6', PEREZ:      '#3671C6',
  HAMILTON:   '#DC0000', LECLERC:    '#DC0000', SAINZ: '#DC0000',
  NORRIS:     '#FF8000', PIASTRI:    '#FF8000',
  RUSSELL:    '#27F4D2', BOTTAS:     '#27F4D2',
  ALONSO:     '#358C75', STROLL:     '#358C75',
  GASLY:      '#BFD7E0', OCON:       '#BFD7E0',
  ALBON:      '#64C4FF',
  HULKENBERG: '#B6BABD', MAGNUSSEN:  '#B6BABD',
  TSUNODA:    '#6692FF', LAWSON:     '#6692FF',
  ZHOU:       '#52E252', BEARMAN:    '#52E252',
}

export default function DriverPulse({ drivers, loading }: Props) {
  const display = loading
    ? Array(10).fill(null)
    : drivers.slice(0, 10)

  return (
    <div style={{
      display: 'flex', gap: 10,
      overflowX: 'auto', paddingBottom: 8,
      marginTop: 26,
    }}>
      {display.map((driver, i) =>
        loading
          ? <DriverSkeleton key={i} />
          : <DriverCard key={driver.driverName} driver={driver} rank={i + 1} />
      )}
    </div>
  )
}

function DriverCard({ driver, rank }: { driver: any; rank: number }) {
  const teamColor = TEAM_COLORS[driver.driverName?.toUpperCase()] || 'var(--t3)'
  const sentColor = driver.sentimentLabel === 'positive' ? 'var(--green)'
    : driver.sentimentLabel === 'negative' ? 'var(--red)' : 'var(--t2)'
  const arrow = (driver.sentimentDelta ?? 0) > 0.05 ? '↑'
    : (driver.sentimentDelta ?? 0) < -0.05 ? '↓' : '→'
  const arrowColor = (driver.sentimentDelta ?? 0) > 0.05 ? 'var(--green)'
    : (driver.sentimentDelta ?? 0) < -0.05 ? 'var(--red)' : 'var(--t3)'

  return (
    <div style={{
      flexShrink: 0, width: 140,
      border: '1px solid var(--b1)', borderRadius: 10,
      overflow: 'hidden', background: 'var(--card)',
      cursor: 'pointer', transition: 'all .2s',
    }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLDivElement
        el.style.borderColor = teamColor
        el.style.transform = 'translateY(-2px)'
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLDivElement
        el.style.borderColor = 'var(--b1)'
        el.style.transform = 'none'
      }}
    >
      {/* Color bar */}
      <div style={{ height: 3, background: teamColor }} />

      <div style={{ padding: '14px 14px 12px' }}>
        {/* Rank + name */}
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'flex-start', marginBottom: 10,
        }}>
          <div style={{ fontFamily: 'var(--font-bebas)', fontSize: 13, letterSpacing: '.08em' }}>
            {driver.driverName}
          </div>
          <span style={{
            fontFamily: 'var(--font-bebas)', fontSize: 16,
            color: 'var(--t3)', letterSpacing: '.06em',
          }}>
            #{rank}
          </span>
        </div>

        {/* Mentions */}
        <div style={{ fontSize: 9, color: 'var(--t3)', marginBottom: 4, letterSpacing: '.1em' }}>
          MENTIONS
        </div>
        <div style={{
          fontFamily: 'var(--font-bebas)', fontSize: 26,
          lineHeight: 1, color: 'var(--t1)', marginBottom: 10,
        }}>
          {driver.mentions ?? 0}
        </div>

        {/* Sentiment */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontSize: 9, color: sentColor, letterSpacing: '.08em' }}>
            {driver.sentimentLabel?.toUpperCase() || 'NEUTRAL'}
          </span>
          <span style={{ fontSize: 13, color: arrowColor }}>
            {arrow}
          </span>
        </div>

        {/* Sentiment bar */}
        <div style={{
          height: 2, background: 'var(--b1)',
          borderRadius: 2, overflow: 'hidden', marginTop: 8,
        }}>
          <div style={{
            height: '100%',
            width: `${Math.max(0, Math.min(100, ((driver.sentimentAvg ?? 0) + 1) / 2 * 100))}%`,
            background: sentColor, borderRadius: 2,
            transition: 'width 0.8s ease',
          }} />
        </div>
      </div>
    </div>
  )
}

function DriverSkeleton() {
  return (
    <div style={{
      flexShrink: 0, width: 140,
      border: '1px solid var(--b1)', borderRadius: 10,
      overflow: 'hidden',
    }}>
      <div style={{ height: 3, background: 'var(--b2)' }} />
      <div style={{ padding: 14 }}>
        <div className="skeleton" style={{ height: 14, width: 80, marginBottom: 10 }} />
        <div className="skeleton" style={{ height: 28, width: 50, marginBottom: 10 }} />
        <div className="skeleton" style={{ height: 10, width: '100%' }} />
      </div>
    </div>
  )
}
