'use client'
// components/HeroSection.tsx

import { useEffect, useState, useRef } from 'react'

interface Props {
  weekend: any
  clusters: any[]
  loading: boolean
}

const PRIORITY_COLORS: Record<string, string> = {
  BREAKING: 'var(--red)',
  HIGH: 'var(--gold)',
  NORMAL: 'var(--blue)',
  LOW: 'var(--t3)',
}

export default function HeroSection({ weekend, clusters, loading }: Props) {
  const [countdown, setCountdown] = useState({ d: '00', h: '00', m: '00', s: '00' })
  const [stackIdx, setStackIdx] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const nextRace = weekend?.currentState?.nextRace
  const raceStartUtc = nextRace?.startUtc
  const cards = clusters.slice(0, 4)

  // Live countdown
  useEffect(() => {
    if (!raceStartUtc) return

    function tick() {
      const diff = new Date(raceStartUtc).getTime() - Date.now()

      if (diff <= 0) {
        setCountdown({ d: '00', h: '00', m: '00', s: '00' })
        return
      }

      const d = Math.floor(diff / 86400000)
      const h = Math.floor((diff % 86400000) / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)

      setCountdown({
        d: String(d).padStart(2, '0'),
        h: String(h).padStart(2, '0'),
        m: String(m).padStart(2, '0'),
        s: String(s).padStart(2, '0'),
      })
    }

    tick()
    intervalRef.current = setInterval(tick, 1000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [raceStartUtc])

  // Auto-advance card stack
  useEffect(() => {
    if (!cards.length) return

    const t = setInterval(() => {
      setStackIdx((i) => (i + 1) % cards.length)
    }, 4000)

    return () => clearInterval(t)
  }, [cards.length])

  const race = nextRace || {
    flag: '🇦🇺',
    round: 1,
    name: 'AUSTRALIAN GRAND PRIX',
    circuit: 'Albert Park Circuit',
    city: 'Melbourne',
    date: '2026-03-16',
  }

  return (
    <section style={{
      minHeight: 'calc(100vh - var(--header-h) - 36px)',
      paddingTop: 40,
      display: 'grid',
      gridTemplateColumns: '1fr 440px',
      borderBottom: '1px solid var(--b1)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* LEFT */}
      <div
        style={{
          padding: '0 var(--gutter)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          position: 'relative',
          zIndex: 2,
        }}
      >
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          <div className="line" />
          <span>F1 INTELLIGENCE TERMINAL · 2026 SEASON</span>
        </div>

        <h1
          style={{
            fontFamily: 'var(--font-bebas)',
            fontSize: 'clamp(52px, 7.5vw, 106px)',
            lineHeight: 0.88,
            letterSpacing: '-.01em',
            marginBottom: 14,
          }}
        >
          RACE
          <br />
          CONTROL
          <br />
          <span style={{ color: 'var(--red)' }}>LIVE.</span>
        </h1>

        <p
          style={{
            color: 'var(--t2)',
            fontSize: 13,
            lineHeight: 1.7,
            maxWidth: 420,
            marginBottom: 24,
          }}
        >
          Real-time F1 intelligence — breaking news, Reddit pulse, FIA bulletins and driver
          sentiment from 6 live sources. No filler. Just the numbers that matter.
        </p>

        <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
          <a
            href="/stories"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '9px 20px',
              background: 'var(--red)',
              color: '#fff',
              textDecoration: 'none',
              fontSize: 11,
              letterSpacing: '.12em',
              borderRadius: 6,
              fontFamily: 'var(--font-mono)',
              border: '1px solid var(--red)',
            }}
          >
            OPEN LIVE FEED →
          </a>

          <button
            style={{
              padding: '9px 20px',
              background: 'transparent',
              color: 'var(--t2)',
              border: '1px solid var(--b2)',
              fontSize: 11,
              letterSpacing: '.12em',
              cursor: 'pointer',
              borderRadius: 6,
              fontFamily: 'var(--font-mono)',
            }}
          >
            SUBSCRIBE — $6/MO
          </button>
        </div>

        {/* Countdown */}
        <div
          style={{
            padding: '13px 18px',
            border: '1px solid var(--b1)',
            borderRadius: 10,
            background: 'var(--card)',
            backdropFilter: 'blur(8px)',
            display: 'inline-flex',
            flexDirection: 'column',
            gap: 10,
            maxWidth: 340,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="pd" style={{ width: 5, height: 5 }} />
            <span style={{ fontSize: 9, letterSpacing: '.16em', color: 'var(--t2)' }}>
              NEXT RACE
            </span>
          </div>

          <div style={{ fontSize: 10, letterSpacing: '.08em', color: 'var(--t1)' }}>
            {race.flag} R{race.round} · {(race.name || 'AUSTRALIAN GRAND PRIX').toUpperCase()} ·{' '}
            {race.circuit?.toUpperCase() || 'ALBERT PARK'} ·{' '}
            {race.date
              ? new Date(race.date)
                  .toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })
                  .toUpperCase()
              : 'MAR 16 2026'}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {[
              { val: countdown.d, lbl: 'DAYS' },
              { val: countdown.h, lbl: 'HRS' },
              { val: countdown.m, lbl: 'MIN' },
              { val: countdown.s, lbl: 'SEC' },
            ].map((unit, i) => (
              <div key={unit.lbl} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {i > 0 && (
                  <span
                    style={{
                      color: 'var(--t3)',
                      fontSize: 18,
                      fontFamily: 'var(--font-bebas)',
                    }}
                  >
                    :
                  </span>
                )}

                <div style={{ textAlign: 'center' }}>
                  <div
                    style={{
                      fontFamily: 'var(--font-bebas)',
                      fontSize: 28,
                      lineHeight: 1,
                      background: 'var(--bg2)',
                      padding: '3px 9px',
                      borderRadius: 5,
                      border: '1px solid var(--b1)',
                      minWidth: 48,
                      display: 'block',
                    }}
                  >
                    {unit.val}
                  </div>

                  <div
                    style={{
                      fontSize: 8,
                      letterSpacing: '.14em',
                      color: 'var(--t3)',
                      marginTop: 3,
                    }}
                  >
                    {unit.lbl}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* RIGHT — Card Stack */}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderLeft: '1px solid var(--b1)',
          overflow: 'hidden',
          background: 'radial-gradient(ellipse at 60% 40%, rgba(225,6,0,.055) 0%, transparent 65%)',
        }}
      >
        {loading || !cards.length ? (
          <SkeletonStack />
        ) : (
          <CardStack cards={cards} activeIdx={stackIdx} onNav={setStackIdx} />
        )}
      </div>
    </section>
  )
}

function CardStack({
  cards,
  activeIdx,
  onNav,
}: {
  cards: any[]
  activeIdx: number
  onNav: (i: number) => void
}) {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {cards.map((card, i) => {
        const offset = (i - activeIdx + cards.length) % cards.length
        const accentColor = PRIORITY_COLORS[card.priority] || 'var(--blue)'

        const style: React.CSSProperties = {
          position: 'absolute',
          inset: '40px 32px',
          background: 'var(--card)',
          border: '1px solid var(--b1)',
          borderRadius: 14,
          padding: 22,
          backdropFilter: 'blur(8px)',
          transition: 'all .65s cubic-bezier(.4,0,.2,1)',
          overflow: 'hidden',
          cursor: 'pointer',
          transform:
            offset === 0
              ? 'translateY(0) scale(1)'
              : offset === 1
                ? 'translateY(24px) scale(.95)'
                : offset === 2
                  ? 'translateY(42px) scale(.90)'
                  : 'translateY(56px) scale(.86)',
          zIndex: cards.length - offset,
          filter:
            offset === 0
              ? 'none'
              : offset === 1
                ? 'blur(2px) brightness(.35)'
                : offset === 2
                  ? 'blur(3.5px) brightness(.2)'
                  : 'blur(5px) brightness(.1)',
        }

        return (
          <div
            key={card.clusterId ?? `${card.clusterName}-${i}`}
            style={style}
            onClick={() => onNav((activeIdx + 1) % cards.length)}
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 3,
                background: accentColor,
              }}
            />

            <div style={{ fontSize: 9, letterSpacing: '.16em', color: 'var(--t2)', marginBottom: 6 }}>
              {card.priority} · SIGNAL
            </div>

            <div
              style={{
                fontSize: 7,
                letterSpacing: '.14em',
                padding: '2px 8px',
                borderRadius: 3,
                border: `1px solid ${accentColor}40`,
                color: accentColor,
                display: 'inline-block',
                marginBottom: 12,
              }}
            >
              {card.clusterName}
            </div>

            <div
              style={{
                fontFamily: 'var(--font-bebas)',
                fontSize: 20,
                letterSpacing: '.04em',
                lineHeight: 1.2,
                marginBottom: 10,
              }}
            >
              {card.clusterName?.replace(/_/g, ' ')}
            </div>

            {card.summary && (
              <p style={{ fontSize: 11, color: 'var(--t2)', lineHeight: 1.6 }}>{card.summary}</p>
            )}

            <div
              style={{
                position: 'absolute',
                bottom: 16,
                left: 22,
                right: 22,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={{ fontSize: 10, color: 'var(--t3)' }}>{card.articleCount} signals</span>

              <span
                style={{
                  fontSize: 9,
                  color:
                    card.sentimentLabel === 'positive'
                      ? 'var(--green)'
                      : card.sentimentLabel === 'negative'
                        ? 'var(--red)'
                        : 'var(--t3)',
                }}
              >
                {card.sentimentLabel?.toUpperCase()}
              </span>
            </div>

            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: 2,
                background: 'var(--b1)',
              }}
            >
              <div
                style={{
                  height: '100%',
                  background: accentColor,
                  width: `${card.momentumScore || 0}%`,
                  borderRadius: 2,
                }}
              />
            </div>
          </div>
        )
      })}

      <div
        style={{
          position: 'absolute',
          bottom: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: 6,
        }}
      >
        {cards.map((_, i) => (
          <div
            key={i}
            onClick={() => onNav(i)}
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              cursor: 'pointer',
              background: i === activeIdx ? 'var(--red)' : 'var(--b2)',
              boxShadow: i === activeIdx ? '0 0 8px var(--red)' : 'none',
              transition: 'all .2s',
            }}
          />
        ))}
      </div>
    </div>
  )
}

function SkeletonStack() {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            inset: '40px 32px',
            background: 'var(--card)',
            border: '1px solid var(--b1)',
            borderRadius: 14,
            padding: 22,
            transform:
              i === 0 ? 'none' : i === 1 ? 'translateY(24px) scale(.95)' : 'translateY(42px) scale(.90)',
            zIndex: 3 - i,
            filter: i === 0 ? 'none' : 'blur(2px) brightness(.35)',
          }}
        >
          <div className="skeleton" style={{ height: 10, width: 80, marginBottom: 12 }} />
          <div className="skeleton" style={{ height: 20, width: '70%', marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 60, width: '100%' }} />
        </div>
      ))}
    </div>
  )
}