'use client'
// components/NextRaceCard.tsx

import { useEffect, useState } from 'react'

interface Props { weekend: any; loading: boolean }

export default function NextRaceCard({ weekend, loading }: Props) {
  const [cd, setCd] = useState({ d:'00', h:'00', m:'00', s:'00' })
  const race = weekend?.currentState?.nextRace
  const upcoming = weekend?.upcoming || []

  useEffect(() => {
    if (!race?.startUtc) return
    const tick = () => {
      const diff = new Date(race.startUtc).getTime() - Date.now()
      if (diff <= 0) return
      setCd({
        d: String(Math.floor(diff / 86400000)).padStart(2,'0'),
        h: String(Math.floor((diff % 86400000) / 3600000)).padStart(2,'0'),
        m: String(Math.floor((diff % 3600000) / 60000)).padStart(2,'0'),
        s: String(Math.floor((diff % 60000) / 1000)).padStart(2,'0'),
      })
    }
    tick()
    const iv = setInterval(tick, 1000)
    return () => clearInterval(iv)
  }, [race?.startUtc])

  if (loading) return <RaceSkeleton />
  if (!race) return null

  return (
    <div style={{
      border: '1px solid var(--b1)', borderRadius: 14,
      overflow: 'hidden', marginTop: 26, background: 'var(--card)',
    }}>
      {/* Top section */}
      <div style={{
        padding: '26px 30px', display: 'grid',
        gridTemplateColumns: '1fr auto', gap: 20, alignItems: 'center',
        borderBottom: '1px solid var(--b1)',
        background: 'linear-gradient(135deg, rgba(225,6,0,.07), transparent)',
      }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: '.1em', color: 'var(--t2)', marginBottom: 4 }}>
            ROUND {race.round} · FIA FORMULA ONE WORLD CHAMPIONSHIP
          </div>
          <div style={{
            fontFamily: 'var(--font-bebas)',
            fontSize: 'clamp(28px, 4vw, 44px)',
            lineHeight: 1, letterSpacing: '.02em',
          }}>
            {race.flag} {race.name?.toUpperCase()}
          </div>
          <div style={{ fontSize: 10, color: 'var(--t2)', marginTop: 6 }}>
            {race.circuit?.toUpperCase()} · {race.city?.toUpperCase()} ·{' '}
            {race.date ? new Date(race.date).toLocaleDateString('en-GB', {
              day: 'numeric', month: 'long', year: 'numeric'
            }).toUpperCase() : ''}
          </div>
          {race.isSprintWeekend && (
            <span style={{
              marginTop: 8, display: 'inline-block',
              fontSize: 9, letterSpacing: '.1em', padding: '2px 8px',
              borderRadius: 3, color: 'var(--gold)',
              background: 'rgba(245,158,11,.12)',
              border: '1px solid rgba(245,158,11,.25)',
            }}>
              ⚡ SPRINT WEEKEND
            </span>
          )}
        </div>

        {/* Countdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {[{ v: cd.d, l: 'DAYS' }, { v: cd.h, l: 'HRS' }, { v: cd.m, l: 'MIN' }].map((u, i) => (
            <div key={u.l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {i > 0 && (
                <span style={{
                  fontFamily: 'var(--font-bebas)', fontSize: 24,
                  color: 'var(--t3)', lineHeight: 1,
                }}>:</span>
              )}
              <div style={{ textAlign: 'center' }}>
                <span style={{
                  fontFamily: 'var(--font-bebas)', fontSize: 32, lineHeight: 1,
                  background: 'var(--bg2)', padding: '3px 9px',
                  borderRadius: 5, border: '1px solid var(--b1)',
                  display: 'block', minWidth: 48,
                }}>
                  {u.v}
                </span>
                <div style={{ fontSize: 8, letterSpacing: '.14em', color: 'var(--t3)', marginTop: 3 }}>{u.l}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Circuit stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
        gap: 0, background: 'var(--b1)',
      }}>
        {[
          { l: 'CIRCUIT LENGTH', v: race.circuitLengthKm?.toFixed(3) || '—', s: 'KM' },
          { l: 'RACE LAPS',      v: race.laps || '—',                          s: '' },
          { l: 'LAP RECORD',     v: race.lapRecord || '—',                     s: '' },
          { l: 'RECORD HOLDER',  v: race.lapRecordHolder || '—',               s: '' },
          { l: 'DRS ZONES',      v: race.drsZones ?? '—',                      s: '' },
        ].map(stat => (
          <div key={stat.l} style={{
            padding: '16px 20px', background: 'var(--bg)',
            borderRight: '1px solid var(--b1)',
          }}>
            <div style={{ fontSize: 9, letterSpacing: '.12em', color: 'var(--t3)', marginBottom: 4 }}>
              {stat.l}
            </div>
            <div style={{
              fontFamily: 'var(--font-bebas)', fontSize: 18,
              letterSpacing: '.04em', lineHeight: 1,
            }}>
              {stat.v}
              {stat.s && (
                <span style={{ fontSize: 10, color: 'var(--t3)', marginLeft: 4 }}>{stat.s}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Upcoming races strip */}
      {upcoming.length > 0 && (
        <div style={{
          padding: '14px 20px', borderTop: '1px solid var(--b1)',
          display: 'flex', gap: 16, overflowX: 'auto',
          background: 'var(--bg2)',
        }}>
          <span style={{ fontSize: 9, letterSpacing: '.14em', color: 'var(--t3)', flexShrink: 0, alignSelf: 'center' }}>
            UPCOMING
          </span>
          {upcoming.map((r: any) => (
            <div key={r.round} style={{
              flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 12px', borderRadius: 6,
              border: '1px solid var(--b1)', background: 'var(--card)',
              fontSize: 10,
            }}>
              <span>{r.flag}</span>
              <div>
                <div style={{ letterSpacing: '.06em' }}>{r.name?.split(' Grand')[0]}</div>
                <div style={{ fontSize: 9, color: 'var(--t3)' }}>
                  {r.daysAway}d away
                  {r.isSprintWeekend ? ' · ⚡' : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function RaceSkeleton() {
  return (
    <div style={{ marginTop: 26, border: '1px solid var(--b1)', borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ padding: '26px 30px', display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ flex: 1 }}>
          <div className="skeleton" style={{ height: 12, width: 200, marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 40, width: '60%', marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 12, width: 300 }} />
        </div>
        <div className="skeleton" style={{ width: 180, height: 70, borderRadius: 8 }} />
      </div>
    </div>
  )
}
