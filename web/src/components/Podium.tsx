'use client'

import Image from 'next/image'
import { useState } from 'react'
import type { DriverStanding, ConstructorStanding } from '@/types/f1'

// ── Team colours ──────────────────────────────────────────────────────────────

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
  racing_bulls: '#6692FF',
  cadillac:     '#CC0000',
  audi:         '#F50537',
}

export function teamColor(constructorId: string): string {
  return TEAM_COLORS[constructorId] ?? '#888888'
}

// ── Driver image URLs (corrected from live F1 website) ────────────────────────

const CDN = 'https://media.formula1.com/image/upload/c_fill,w_720/q_auto/d_common:f1:2026:fallback:driver:2026fallbackdriverright.webp/v1740000000/common/f1/2026'

const DRIVER_IMAGES: Record<string, string> = {
  ALB: `${CDN}/williams/alealb01/2026williamsalealb01right.webp`,
  ALO: `${CDN}/astonmartin/feralo01/2026astonmartinferalo01right.webp`,
  ANT: `${CDN}/mercedes/andant01/2026mercedesandant01right.webp`,
  BEA: `${CDN}/haasf1team/olibea01/2026haasf1teamolibea01right.webp`,
  BOT: `${CDN}/cadillac/valbot01/2026cadillacvalbot01right.webp`,
  COL: `${CDN}/alpine/fracol01/2026alpinefracol01right.webp`,
  GAS: `${CDN}/alpine/piegas01/2026alpinepiegas01right.webp`,
  HAD: `${CDN}/redbullracing/isahad01/2026redbullracingisahad01right.webp`,
  HAM: `${CDN}/ferrari/lewham01/2026ferrarilewham01right.webp`,
  HUL: `${CDN}/audi/nichul01/2026audinichul01right.webp`,
  LAW: `${CDN}/racingbulls/lialaw01/2026racingbullslialaw01right.webp`,
  LEC: `${CDN}/ferrari/chalec01/2026ferrarichalec01right.webp`,
  LIN: `${CDN}/racingbulls/arvlin01/2026racingbullsarvlin01right.webp`,
  NOR: `${CDN}/mclaren/lannor01/2026mclarenlannor01right.webp`,
  OCO: `${CDN}/haasf1team/estoco01/2026haasf1teamestoco01right.webp`,
  PER: `${CDN}/cadillac/serper01/2026cadillacserper01right.webp`,
  PIA: `${CDN}/mclaren/oscpia01/2026mclarenoscpia01right.webp`,
  RUS: `${CDN}/mercedes/georus01/2026mercedesgeorus01right.webp`,
  SAI: `${CDN}/williams/carsai01/2026williamscarsai01right.webp`,
  STR: `${CDN}/astonmartin/lanstr01/2026astonmartinlanstr01right.webp`,
  TSU: `${CDN}/racingbulls/yuktsu01/2026racingbullsyuktsu01right.webp`,
  VER: `${CDN}/redbullracing/maxver01/2026redbullracingmaxver01right.webp`,
  BOR: `${CDN}/audi/gabbor01/2026audigabbor01right.webp`,
}

// ── Constructor car images ────────────────────────────────────────────────────

const CAR_CDN = 'https://media.formula1.com/image/upload/c_lfill,w_3392/q_auto/v1740000000/common/f1/2026'

const CONSTRUCTOR_IMAGES: Record<string, string> = {
  red_bull:     `${CAR_CDN}/redbullracing/2026redbullracingcarright.webp`,
  mercedes:     `${CAR_CDN}/mercedes/2026mercedescarright.webp`,
  ferrari:      `${CAR_CDN}/ferrari/2026ferraricarright.webp`,
  mclaren:      `${CAR_CDN}/mclaren/2026mclarencarright.webp`,
  aston_martin: `${CAR_CDN}/astonmartin/2026astonmartincarright.webp`,
  alpine:       `${CAR_CDN}/alpine/2026alpinecarright.webp`,
  williams:     `${CAR_CDN}/williams/2026williamscarright.webp`,
  haas:         `${CAR_CDN}/haasf1team/2026haasf1teamcarright.webp`,
  sauber:       `${CAR_CDN}/audi/2026audicarright.webp`,
  rb:           `${CAR_CDN}/racingbulls/2026racingbullscarright.webp`,
  racing_bulls: `${CAR_CDN}/racingbulls/2026racingbullscarright.webp`,
  cadillac:     `${CAR_CDN}/cadillac/2026cadillaccarright.webp`,
  audi:         `${CAR_CDN}/audi/2026audicarright.webp`,
}

function driverImageUrl(code: string): string | null {
  return DRIVER_IMAGES[code] ?? null
}

function constructorImageUrl(id: string): string | null {
  return CONSTRUCTOR_IMAGES[id] ?? null
}

// ── Hero driver podium card ───────────────────────────────────────────────────

function HeroPodiumCard({
  standing,
  position,
}: {
  standing: DriverStanding
  position: 1 | 2 | 3
}) {
  const [imgFailed, setImgFailed] = useState(false)
  const constructor = standing.Constructors?.[0]
  const color = teamColor(constructor?.constructorId ?? '')
  const isFirst = position === 1
  const code = standing.Driver.code ?? standing.Driver.driverId.toUpperCase().slice(0, 3)
  const url = driverImageUrl(code)
  const initials = `${standing.Driver.givenName.charAt(0)}${standing.Driver.familyName.charAt(0)}`
  const cardHeight = isFirst ? 420 : 340

  const posColors: Record<number, string> = { 1: '#F59E0B', 2: '#9CA3AF', 3: '#CD7F32' }
  const posColor = posColors[position]

  return (
    <div style={{
      position: 'relative',
      borderRadius: isFirst ? 18 : 14,
      overflow: 'hidden',
      height: cardHeight,
      border: `1px solid ${color}${isFirst ? '60' : '35'}`,
      boxShadow: isFirst ? `0 0 60px ${color}25, 0 0 120px ${color}10` : 'none',
    }}>
      {/* Full-bleed image */}
      {!imgFailed && url ? (
        <Image
          src={url}
          alt={`${standing.Driver.givenName} ${standing.Driver.familyName}`}
          fill
          sizes="(max-width: 900px) 100vw, 33vw"
          onError={() => setImgFailed(true)}
          style={{
            objectFit: 'cover', objectPosition: 'top center',
            zIndex: 0,
          }}
        />
      ) : (
        <div style={{
          position: 'absolute', inset: 0,
          background: `linear-gradient(160deg, ${color}30, rgba(0,0,0,.9))`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 0,
        }}>
          <span style={{
            fontFamily: 'var(--font-bebas)',
            fontSize: isFirst ? 120 : 90,
            color, opacity: 0.3, letterSpacing: '.04em',
          }}>
            {initials}
          </span>
        </div>
      )}

      {/* Bottom gradient */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        height: '65%',
        background: 'linear-gradient(to top, rgba(0,0,0,.95) 0%, rgba(0,0,0,.7) 40%, transparent 100%)',
        zIndex: 1,
      }} />

      {/* Team color tint */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        height: '30%',
        background: `linear-gradient(to top, ${color}25, transparent)`,
        zIndex: 2,
      }} />

      {/* Top fade */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        height: '20%',
        background: 'linear-gradient(to bottom, rgba(0,0,0,.5), transparent)',
        zIndex: 1,
      }} />

      {/* Top accent bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        height: isFirst ? 3 : 2,
        background: color, zIndex: 10,
      }} />

      {/* Position badge */}
      <div style={{
        position: 'absolute', top: 14, left: 14, zIndex: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: isFirst ? 36 : 30, height: isFirst ? 36 : 30,
        borderRadius: '50%',
        border: `2px solid ${posColor}`,
        background: 'rgba(0,0,0,.6)',
        backdropFilter: 'blur(8px)',
      }}>
        <span style={{
          fontFamily: 'var(--font-bebas)',
          fontSize: isFirst ? 17 : 14,
          color: posColor, lineHeight: 1,
        }}>
          P{position}
        </span>
      </div>

      {/* Driver number */}
      <div style={{
        position: 'absolute', top: 10, right: 14, zIndex: 10,
        fontFamily: 'var(--font-bebas)',
        fontSize: isFirst ? 48 : 38,
        lineHeight: 1, color, opacity: 0.8,
        letterSpacing: '-0.02em',
        textShadow: `0 0 20px ${color}80`,
      }}>
        {standing.Driver.permanentNumber ?? ''}
      </div>

      {/* Bottom info */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: isFirst ? '0 16px 18px' : '0 12px 14px',
        zIndex: 10,
      }}>
        <div style={{
          width: 32, height: 2,
          background: color, borderRadius: 2,
          marginBottom: 8, opacity: 0.9,
        }} />

        <div style={{
          fontFamily: 'var(--font-bebas)',
          fontSize: isFirst ? 28 : 22,
          lineHeight: 1, color: '#fff',
          letterSpacing: '.04em', marginBottom: 4,
          textShadow: '0 2px 8px rgba(0,0,0,.8)',
        }}>
          {standing.Driver.givenName.charAt(0)}.{' '}
          {standing.Driver.familyName.toUpperCase()}
        </div>

        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9, letterSpacing: '.14em',
          color: `${color}cc`, marginBottom: isFirst ? 12 : 10,
          textTransform: 'uppercase',
        }}>
          {constructor?.name ?? '—'}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'baseline', gap: 3,
            padding: isFirst ? '5px 14px' : '4px 10px',
            borderRadius: 20,
            border: `1px solid ${color}50`,
            background: 'rgba(0,0,0,.5)',
            backdropFilter: 'blur(8px)',
          }}>
            <span style={{
              fontFamily: 'var(--font-bebas)',
              fontSize: isFirst ? 22 : 18,
              color: '#fff', lineHeight: 1,
            }}>
              {standing.points}
            </span>
            <span style={{
              fontSize: 9, color: 'rgba(255,255,255,.5)',
              letterSpacing: '.1em', fontFamily: 'var(--font-mono)',
            }}>
              PTS
            </span>
          </div>

          {Number(standing.wins) > 0 && (
            <div style={{
              padding: '4px 10px', borderRadius: 20,
              border: `1px solid ${posColor}55`,
              background: `${posColor}15`,
              backdropFilter: 'blur(8px)',
              fontFamily: 'var(--font-mono)',
              fontSize: 9, color: posColor, letterSpacing: '.1em',
            }}>
              {standing.wins}W
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Hero constructor card ─────────────────────────────────────────────────────

function HeroConstructorCard({
  standing,
  position,
}: {
  standing: ConstructorStanding
  position: 1 | 2 | 3
}) {
  const [imgFailed, setImgFailed] = useState(false)
  const color = teamColor(standing.Constructor.constructorId)
  const isFirst = position === 1
  const cardHeight = isFirst ? 380 : 340
  const carUrl = constructorImageUrl(standing.Constructor.constructorId)

  const posColors: Record<number, string> = { 1: '#F59E0B', 2: '#9CA3AF', 3: '#CD7F32' }
  const posColor = posColors[position]

  return (
    <div style={{
      position: 'relative',
      borderRadius: isFirst ? 18 : 14,
      overflow: 'hidden',
      height: cardHeight,
      border: `1px solid ${color}${isFirst ? '60' : '35'}`,
      boxShadow: isFirst ? `0 0 60px ${color}25, 0 0 120px ${color}10` : 'none',
      background: `linear-gradient(160deg, ${color}18, rgba(0,0,0,.95))`,
    }}>

      {/* Car image as hero */}
      {!imgFailed && carUrl ? (
        <Image
          src={carUrl}
          alt={standing.Constructor.name}
          width={1200}
          height={420}
          onError={() => setImgFailed(true)}
          style={{
            position: 'absolute',
            top: '38%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '115%',
            objectFit: 'contain',
            zIndex: 0,
            opacity: 0.9,
            filter: `drop-shadow(0 0 40px ${color}40)`,
          }}
        />
      ) : (
        /* Fallback orb */
        <div style={{
          position: 'absolute',
          top: '38%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: isFirst ? 160 : 120,
          height: isFirst ? 160 : 120,
          borderRadius: '50%',
          background: `radial-gradient(circle at 35% 35%, ${color}cc, ${color}33)`,
          border: `2px solid ${color}55`,
          boxShadow: `0 0 60px ${color}40`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-bebas)',
          fontSize: isFirst ? 44 : 34,
          letterSpacing: '.06em',
          color: 'rgba(0,0,0,0.55)',
          zIndex: 1,
        }}>
          {standing.Constructor.name.split(' ').map((w: string) => w[0]).join('').slice(0, 3)}
        </div>
      )}

      {/* Name watermark bg */}
      <div style={{
        position: 'absolute',
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%) rotate(-10deg)',
        fontFamily: 'var(--font-bebas)',
        fontSize: isFirst ? 90 : 70,
        lineHeight: 1, color,
        opacity: 0.05,
        whiteSpace: 'nowrap',
        pointerEvents: 'none', userSelect: 'none',
        letterSpacing: '.04em', zIndex: 0,
      }}>
        {standing.Constructor.name.toUpperCase()}
      </div>

      {/* Bottom gradient */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        height: '55%',
        background: 'linear-gradient(to top, rgba(0,0,0,.97) 0%, rgba(0,0,0,.6) 50%, transparent 100%)',
        zIndex: 2,
      }} />

      {/* Team color tint */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        height: '25%',
        background: `linear-gradient(to top, ${color}20, transparent)`,
        zIndex: 3,
      }} />

      {/* Top accent bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        height: isFirst ? 3 : 2,
        background: color, zIndex: 10,
      }} />

      {/* Position badge */}
      <div style={{
        position: 'absolute', top: 14, left: 14, zIndex: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: isFirst ? 36 : 30, height: isFirst ? 36 : 30,
        borderRadius: '50%',
        border: `2px solid ${posColor}`,
        background: 'rgba(0,0,0,.6)',
        backdropFilter: 'blur(8px)',
      }}>
        <span style={{
          fontFamily: 'var(--font-bebas)',
          fontSize: isFirst ? 17 : 14,
          color: posColor, lineHeight: 1,
        }}>
          P{position}
        </span>
      </div>

      {/* Bottom info */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: isFirst ? '0 16px 18px' : '0 12px 14px',
        zIndex: 10,
      }}>
        <div style={{
          width: 32, height: 2,
          background: color, borderRadius: 2,
          marginBottom: 8, opacity: 0.9,
        }} />

        <div style={{
          fontFamily: 'var(--font-bebas)',
          fontSize: isFirst ? 28 : 22,
          lineHeight: 1, color,
          letterSpacing: '.06em', marginBottom: 4,
        }}>
          {standing.Constructor.name.toUpperCase()}
        </div>

        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9, letterSpacing: '.14em',
          color: 'rgba(255,255,255,.4)',
          marginBottom: isFirst ? 12 : 10,
        }}>
          {standing.Constructor.nationality}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'baseline', gap: 3,
            padding: isFirst ? '5px 14px' : '4px 10px',
            borderRadius: 20,
            border: `1px solid ${color}50`,
            background: 'rgba(0,0,0,.5)',
            backdropFilter: 'blur(8px)',
          }}>
            <span style={{
              fontFamily: 'var(--font-bebas)',
              fontSize: isFirst ? 22 : 18,
              color: '#fff', lineHeight: 1,
            }}>
              {standing.points}
            </span>
            <span style={{
              fontSize: 9, color: 'rgba(255,255,255,.5)',
              letterSpacing: '.1em', fontFamily: 'var(--font-mono)',
            }}>
              PTS
            </span>
          </div>

          {Number(standing.wins) > 0 && (
            <div style={{
              padding: '4px 10px', borderRadius: 20,
              border: `1px solid ${posColor}55`,
              background: `${posColor}15`,
              backdropFilter: 'blur(8px)',
              fontFamily: 'var(--font-mono)',
              fontSize: 9, color: posColor, letterSpacing: '.1em',
            }}>
              {standing.wins}W
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Exported podiums ──────────────────────────────────────────────────────────

export function DriverPodium({ standings }: { standings: DriverStanding[] }) {
  const top3 = standings.slice(0, 3)
  if (top3.length < 3) return null

  return (
    <div style={{ marginBottom: 40 }}>
      <div style={{
        fontSize: 9, fontFamily: 'var(--font-mono)',
        letterSpacing: '.22em', color: 'var(--t3)',
        textTransform: 'uppercase', marginBottom: 16,
      }}>
        · Podium · {top3[0].Driver.familyName} leads
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1.3fr 1fr',
        gap: 12, alignItems: 'end',
      }}>
        <HeroPodiumCard standing={top3[1]} position={2} />
        <HeroPodiumCard standing={top3[0]} position={1} />
        <HeroPodiumCard standing={top3[2]} position={3} />
      </div>

      <div style={{
        height: 1,
        background: 'linear-gradient(90deg, transparent, var(--b2), transparent)',
        marginTop: 12,
      }} />
    </div>
  )
}

export function ConstructorPodium({ standings }: { standings: ConstructorStanding[] }) {
  const top3 = standings.slice(0, 3)
  if (top3.length < 3) return null

  return (
    <div style={{ marginBottom: 40 }}>
      <div style={{
        fontSize: 9, fontFamily: 'var(--font-mono)',
        letterSpacing: '.22em', color: 'var(--t3)',
        textTransform: 'uppercase', marginBottom: 16,
      }}>
        · Podium · {top3[0].Constructor.name} leads
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1.3fr 1fr',
        gap: 12, alignItems: 'end',
      }}>
        <HeroConstructorCard standing={top3[1]} position={2} />
        <HeroConstructorCard standing={top3[0]} position={1} />
        <HeroConstructorCard standing={top3[2]} position={3} />
      </div>

      <div style={{
        height: 1,
        background: 'linear-gradient(90deg, transparent, var(--b2), transparent)',
        marginTop: 12,
      }} />
    </div>
  )
}
