'use client'
import { useEffect, useState } from 'react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import BgCanvas from '@/components/BgCanvas'
import type { DriverStanding, ConstructorStanding } from '@/types/f1'
import { DriverPodium, ConstructorPodium } from '@/components/Podium'
import Link from 'next/link'

const TEAM_COLORS: Record<string, string> = {
  red_bull:     '#3671C6',
  mercedes:     '#27F4D2',
  ferrari:      '#E8002D',
  mclaren:      '#FF8000',
  aston_martin: '#229971',
  alpine:       '#FF87BC',
  williams:     '#64C4FF',
  haas:         '#B6BABD',
  sauber:       '#52E252',
  rb:           '#6692FF',
}
function teamColor(constructorId: string): string {
  return TEAM_COLORS[constructorId] ?? '#888888'
}
const SEASONS = ['2026', '2025', '2024', '2023', '2022', '2021', '2020']

function DriverRow({ s, idx }: { s: DriverStanding; idx: number }) {
  const [hovered, setHovered] = useState(false)
  const constructor = s.Constructors?.[0]
  const color = teamColor(constructor?.constructorId ?? '')
  const isTop3 = idx < 3
  const posColors: Record<number, string> = { 0: '#F59E0B', 1: '#9CA3AF', 2: '#CD7F32' }
  return (
    <Link
      href={`/drivers/${s.Driver.driverId}`}
      style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{
        display: 'grid',
        gridTemplateColumns: '2.5rem 2rem 1fr 1fr 4.5rem 3.5rem 1.5rem',
        alignItems: 'center',
        gap: 12,
        padding: '9px 16px',
        borderBottom: '1px solid var(--b1)',
        background: hovered
          ? `${color}10`
          : isTop3 ? 'rgba(255,255,255,.015)' : 'transparent',
        transition: 'background .15s',
        cursor: 'pointer',
      }}>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11, fontWeight: 700,
          color: posColors[idx] ?? 'var(--t3)',
        }}>
          P{s.position}
        </span>
        <div style={{ width: 3, height: 28, borderRadius: 2, background: color, opacity: 0.8 }} />
        <div>
          <div style={{ color: 'var(--t1)', fontSize: 13, fontWeight: 500, letterSpacing: '.03em' }}>
            {s.Driver.givenName.charAt(0)}. <strong>{s.Driver.familyName.toUpperCase()}</strong>
          </div>
          <div style={{ color: 'var(--t3)', fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '.14em' }}>
            {s.Driver.code}
          </div>
        </div>
        <div style={{
          fontSize: 11, fontFamily: 'var(--font-mono)',
          color: `${color}99`,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {constructor?.name ?? '—'}
        </div>
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>
            {s.points}
          </span>
          <span style={{ color: 'var(--t3)', fontSize: 9, marginLeft: 3 }}>pts</span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--t2)' }}>{s.wins}</span>
          <span style={{ color: 'var(--t3)', fontSize: 9, marginLeft: 3 }}>W</span>
        </div>
        <span style={{
          fontSize: 10, color: hovered ? color : 'var(--t3)',
          opacity: hovered ? 1 : 0.3,
          transition: 'all .15s',
          fontFamily: 'var(--font-mono)',
        }}>↗</span>
      </div>
    </Link>
  )
}

function ConstructorRow({ s, idx }: { s: ConstructorStanding; idx: number }) {
  const color = teamColor(s.Constructor.constructorId)
  const isTop3 = idx < 3
  const posColors: Record<number, string> = { 0: '#F59E0B', 1: '#9CA3AF', 2: '#CD7F32' }
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '2.5rem 2rem 1fr 4.5rem 3.5rem',
      alignItems: 'center',
      gap: 12,
      padding: '9px 16px',
      borderBottom: '1px solid var(--b1)',
      background: isTop3 ? 'rgba(255,255,255,.015)' : 'transparent',
    }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: posColors[idx] ?? 'var(--t3)' }}>
        P{s.position}
      </span>
      <div style={{ width: 3, height: 28, borderRadius: 2, background: color, opacity: 0.8 }} />
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color }}>
          {s.Constructor.name}
        </div>
        <div style={{ color: 'var(--t3)', fontSize: 9, fontFamily: 'var(--font-mono)' }}>
          {s.Constructor.nationality}
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>{s.points}</span>
        <span style={{ color: 'var(--t3)', fontSize: 9, marginLeft: 3 }}>pts</span>
      </div>
      <div style={{ textAlign: 'right' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--t2)' }}>{s.wins}</span>
        <span style={{ color: 'var(--t3)', fontSize: 9, marginLeft: 3 }}>W</span>
      </div>
    </div>
  )
}

function TableHeader({ tab }: { tab: 'drivers' | 'constructors' }) {
  const cols = tab === 'drivers'
    ? '2.5rem 2rem 1fr 1fr 4.5rem 3.5rem 1.5rem'
    : '2.5rem 2rem 1fr 4.5rem 3.5rem'
  const labels = tab === 'drivers'
    ? ['POS', '', 'DRIVER', 'TEAM', 'PTS', 'W', '']
    : ['POS', '', 'CONSTRUCTOR', 'PTS', 'W']
  return (
    <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 12, padding: '8px 16px 10px', borderBottom: '1px solid var(--b2)' }}>
      {labels.map((l, i) => (
        <span key={i} style={{
          fontSize: 9, fontFamily: 'var(--font-mono)',
          letterSpacing: '.18em', color: 'var(--t3)',
          textAlign: l === 'PTS' || l === 'W' ? 'right' : 'left',
        }}>
          {l}
        </span>
      ))}
    </div>
  )
}

function GapDivider({ label }: { label: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '6px 16px',
      borderBottom: '1px solid var(--b1)',
      background: 'rgba(255,255,255,.01)',
    }}>
      <div style={{ flex: 1, height: 1, background: 'var(--b1)' }} />
      <span style={{ fontSize: 8, fontFamily: 'var(--font-mono)', letterSpacing: '.18em', color: 'var(--t3)' }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: 'var(--b1)' }} />
    </div>
  )
}

export default function StandingsPage() {
  const [tab, setTab]       = useState<'drivers' | 'constructors'>('drivers')
  const [season, setSeason] = useState('2026')
  const [driverStandings, setDriverStandings]           = useState<DriverStanding[]>([])
  const [constructorStandings, setConstructorStandings] = useState<ConstructorStanding[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [resolvedSeason, setResolvedSeason] = useState('2026')

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError(null)
    Promise.all([
      fetch(`/api/standings?season=${season}&type=drivers`).then(r => r.json()),
      fetch(`/api/standings?season=${season}&type=constructors`).then(r => r.json()),
    ])
      .then(([d, c]) => {
        if (!mounted) return
        if (d.error) throw new Error(d.error)
        setDriverStandings(d.standings ?? [])
        setConstructorStandings(c.standings ?? [])
        setResolvedSeason(d.season ?? season)
      })
      .catch(() => { if (mounted) setError('Failed to load standings.') })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [season])

  const leaderColor = tab === 'drivers'
    ? teamColor(driverStandings[0]?.Constructors?.[0]?.constructorId ?? '')
    : teamColor(constructorStandings[0]?.Constructor?.constructorId ?? '')

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
        <BgCanvas />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', position: 'relative', zIndex: 1 }}>
        <Header />
        <main style={{
          width: '100%', maxWidth: 1100, margin: '0 auto',
          padding: 'calc(var(--header-h) + 36px) 24px 80px',
        }}>
          {/* ── Page hero ── */}
          <div style={{ position: 'relative', marginBottom: 40, paddingBottom: 0 }}>
            {!loading && (
              <div style={{
                position: 'absolute', top: -60, right: -60,
                width: 400, height: 300, borderRadius: '50%',
                background: `radial-gradient(circle, ${leaderColor}18, transparent 70%)`,
                pointerEvents: 'none',
              }} />
            )}

            {/* centered title + season selector below */}
            <div style={{ textAlign: 'center' }}>
              <div className="eyebrow" style={{ justifyContent: 'center' }}>
                <div className="line" />
                <span>Championship · {resolvedSeason} Season</span>
              </div>
              <div style={{ fontFamily: 'var(--font-bebas)', fontSize: 'clamp(52px, 8vw, 96px)', lineHeight: 0.9, letterSpacing: '.02em', marginTop: 8 }}>
                STANDINGS
              </div>
              <p style={{ color: 'var(--t3)', fontSize: 11, marginTop: 10, fontFamily: 'var(--font-mono)', letterSpacing: '.08em' }}>
                JOLPICA F1 API · UPDATES AFTER EACH RACE
              </p>

              {/* season selector centered below heading */}
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', marginTop: 16 }}>
                <span style={{ fontSize: 8, letterSpacing: '.22em', color: 'var(--t3)', fontFamily: 'var(--font-mono)', marginRight: 4 }}>SEASON</span>
                {SEASONS.map(s => (
                  <button key={s} onClick={() => setSeason(s)} style={{
                    padding: '4px 10px', fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '.08em',
                    border: `1px solid ${season === s ? 'rgba(225,6,0,.6)' : 'var(--b1)'}`,
                    color: season === s ? 'var(--red)' : 'var(--t3)',
                    background: season === s ? 'rgba(225,6,0,.1)' : 'transparent',
                    borderRadius: 4, cursor: 'pointer', transition: 'all var(--tr)',
                  }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* tab bar */}
            <div style={{ display: 'flex', gap: 0, marginTop: 28, borderBottom: '1px solid var(--b1)' }}>
              {(['drivers', 'constructors'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)} style={{
                  padding: '8px 20px', fontSize: 10, fontFamily: 'var(--font-mono)',
                  letterSpacing: '.16em', textTransform: 'uppercase',
                  background: 'transparent', border: 'none',
                  borderBottom: `2px solid ${tab === t ? 'var(--red)' : 'transparent'}`,
                  color: tab === t ? 'var(--t1)' : 'var(--t3)',
                  cursor: 'pointer', transition: 'all var(--tr)', marginBottom: -1,
                }}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {loading && (
            <div style={{ padding: '80px 0', textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.22em', color: 'var(--t3)' }} className="skeleton">
                LOADING STANDINGS...
              </div>
            </div>
          )}
          {error && (
            <div style={{ padding: '80px 0', textAlign: 'center', color: 'var(--red)', fontSize: 12 }}>{error}</div>
          )}

          {!loading && !error && (
            <div style={{ display: 'grid', gap: 32 }}>
              {tab === 'drivers'
                ? <DriverPodium standings={driverStandings} />
                : <ConstructorPodium standings={constructorStandings} />
              }
              <div>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginBottom: 14,
                }}>
                  <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '.22em', color: 'var(--t3)', textTransform: 'uppercase' }}>
                    · Full Championship Standings
                  </div>
                  {tab === 'drivers' && (
                    <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '.12em', color: 'var(--t3)' }}>
                      ↗ CLICK DRIVER FOR STATS &amp; NEWS
                    </div>
                  )}
                </div>
                <div style={{ border: '1px solid var(--b1)', borderRadius: 14, overflow: 'hidden', background: 'rgba(0,0,0,.24)' }}>
                  <TableHeader tab={tab} />
                  {tab === 'drivers'
                    ? driverStandings.map((s, i) => (
                        <div key={s.Driver.driverId}>
                          {i === 3 && <GapDivider label="POINTS GAP INCREASES" />}
                          <DriverRow s={s} idx={i} />
                        </div>
                      ))
                    : constructorStandings.map((s, i) => (
                        <div key={s.Constructor.constructorId}>
                          {i === 3 && <GapDivider label="POINTS GAP INCREASES" />}
                          <ConstructorRow s={s} idx={i} />
                        </div>
                      ))
                  }
                </div>
              </div>
            </div>
          )}
        </main>

        {/* F1 Attribution */}
        <div style={{
          borderTop: '1px solid var(--b1)',
          padding: '16px 24px',
          maxWidth: 1100, margin: '0 auto',
          display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
        }}>
          <span style={{ fontSize: 8, fontFamily: 'var(--font-mono)', letterSpacing: '.1em', color: 'var(--t3)', lineHeight: 1.6 }}>
            Driver images © Formula 1. Formula 1, F1 and related marks are trademarks of Formula One Licensing BV.
            Used for portfolio demonstration purposes only. Not affiliated with or endorsed by Formula 1.
            Race data via <a href="https://jolpi.ca" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--t2)', textDecoration: 'none' }}>Jolpica F1 API</a>.
          </span>
        </div>
        <Footer />
      </div>
    </>
  )
}