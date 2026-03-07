'use client'
// components/WeekendPanel.tsx

import { useEffect, useState } from 'react'

interface Props { loading?: boolean }

export default function WeekendPanel({ loading }: Props) {
  const [data, setData]     = useState<any>(null)
  const [fetching, setFetching] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/intelligence/pre-race').then(r => r.json()),
      fetch('/api/intelligence/session-chatter?hours=6&limit=8').then(r => r.json()),
    ]).then(([pr, chatter]) => {
      setData({ preRace: pr, chatter: chatter.ok ? chatter : null })
    }).finally(() => setFetching(false))
  }, [])

  if (loading || fetching) return <WeekendSkeleton />
  if (!data?.preRace?.isRaceWeek) return null

  const { preRace, chatter } = data
  const snap = preRace.snapshot

  return (
    <div style={{
      marginTop: 26,
      border: '1px solid rgba(225,6,0,.2)',
      borderRadius: 14, overflow: 'hidden',
      background: 'linear-gradient(135deg, rgba(225,6,0,.04), var(--card))',
    }}>
      {/* Weekend header */}
      <div style={{
        padding: '16px 24px',
        background: 'rgba(225,6,0,.08)',
        borderBottom: '1px solid rgba(225,6,0,.15)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="pd" />
          <span style={{
            fontFamily: 'var(--font-bebas)', fontSize: 20,
            letterSpacing: '.08em', color: 'var(--red)',
          }}>
            🏁 RACE WEEK ACTIVE
          </span>
          {preRace.currentState?.sessions?.current && (
            <span style={{
              fontSize: 9, letterSpacing: '.12em', padding: '2px 10px',
              borderRadius: 20, background: 'var(--red)', color: '#fff',
            }}>
              {preRace.currentState.sessions.current} LIVE
            </span>
          )}
        </div>
        <span style={{ fontSize: 10, color: 'var(--t2)' }}>
          {preRace.daysUntil === 0 ? 'RACE DAY' : `${preRace.daysUntil} DAYS TO RACE`}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
        {/* Left: AI snapshot sections */}
        <div style={{ padding: '20px 24px', borderRight: '1px solid var(--b1)' }}>
          {snap ? (
            <>
              <WeekendSection label="WEEKEND OVERVIEW"    text={snap.sections?.weekendOverview} />
              <WeekendSection label="REGULATORY WATCHLIST" text={snap.sections?.regulatoryWatchlist} accent="var(--gold)" />
              <WeekendSection label="FORM GUIDE"          text={snap.sections?.formGuide} accent="var(--green)" />
              <WeekendSection label="CONTROVERSY RADAR"   text={snap.sections?.controversyRadar} accent="var(--red)" />
              <WeekendSection label="KEY BATTLES"         text={snap.sections?.keyBattles} accent="var(--blue)" />
            </>
          ) : (
            <p style={{ color: 'var(--t2)', fontSize: 12 }}>
              Pre-race intelligence snapshot generating — check back shortly.
            </p>
          )}
        </div>

        {/* Right: Watchlist + Chatter */}
        <div style={{ padding: '20px 24px' }}>
          {/* Regulatory Watchlist */}
          {preRace.watchlist?.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{
                fontSize: 9, letterSpacing: '.16em', color: 'var(--gold)',
                marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <div style={{ width: 14, height: 1, background: 'var(--gold)' }} />
                ⚠ REGULATORY WATCHLIST
              </div>
              {preRace.watchlist.slice(0, 5).map((e: any) => (
                <div key={e.entityName} style={{
                  display: 'flex', justifyContent: 'space-between',
                  padding: '8px 0', borderBottom: '1px solid var(--b1)',
                  alignItems: 'center',
                }}>
                  <div>
                    <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                      {e.entityName}
                    </span>
                    <span style={{ fontSize: 9, color: 'var(--t3)', marginLeft: 6 }}>
                      ({e.entityType})
                    </span>
                  </div>
                  <span className={`badge risk-${e.riskLabel}`} style={{ fontSize: 8 }}>
                    {e.riskLabel}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Session Chatter */}
          {chatter?.data?.length > 0 && (
            <div>
              <div style={{
                fontSize: 9, letterSpacing: '.16em', color: 'var(--blue)',
                marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <div style={{ width: 14, height: 1, background: 'var(--blue)' }} />
                SESSION CHATTER · LAST 6H
              </div>
              {chatter.data.slice(0, 5).map((item: any) => (
                <div key={item.guid} style={{
                  padding: '8px 0', borderBottom: '1px solid var(--b1)',
                }}>
                  <div style={{ fontSize: 10, color: 'var(--t1)', lineHeight: 1.4, marginBottom: 3 }}>
                    {item.title}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 8, color: 'var(--t3)' }}>
                      {item.sessionRelevance}
                    </span>
                    <span style={{
                      fontSize: 8, padding: '1px 6px', borderRadius: 10,
                      color: item.sentimentLabel === 'positive' ? 'var(--green)'
                        : item.sentimentLabel === 'negative' ? 'var(--red)' : 'var(--t3)',
                    }}>
                      {item.sentimentLabel}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function WeekendSection({ label, text, accent = 'var(--red)' }: { label: string; text?: string; accent?: string }) {
  if (!text) return null
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontSize: 9, letterSpacing: '.14em', color: accent,
        marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <div style={{ width: 12, height: 1, background: accent }} />
        {label}
      </div>
      <p style={{ fontSize: 11, color: 'var(--t2)', lineHeight: 1.65 }}>{text}</p>
    </div>
  )
}

function WeekendSkeleton() {
  return (
    <div style={{ marginTop: 26, border: '1px solid var(--b1)', borderRadius: 14, padding: 24 }}>
      <div className="skeleton" style={{ height: 20, width: 200, marginBottom: 16 }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {[0,1,2,3].map(i => (
          <div key={i}>
            <div className="skeleton" style={{ height: 10, width: 120, marginBottom: 8 }} />
            <div className="skeleton" style={{ height: 60 }} />
          </div>
        ))}
      </div>
    </div>
  )
}
