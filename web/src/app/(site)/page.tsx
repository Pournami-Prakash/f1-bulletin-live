'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { motion, useScroll, useTransform, useSpring } from 'framer-motion'
import Header from '@/components/Header'
import Ticker from '@/components/Ticker'
import Footer from '@/components/Footer'
import BgCanvas from '@/components/BgCanvas'
import BootScreen from '@/components/BootScreen'

type Story    = { story_title?: string; title?: string; topic_cluster?: string; is_breaking?: boolean; latest_source?: string; latest_event_ts?: string; latest_url?: string; momentum_score?: number }
type Driver   = { driverName?: string; sentimentAvg?: number; sentimentLabel?: string }
type Standing = { driver_code?: string; driver?: string; team?: string; points?: number }

function timeAgo(v?: string) {
  if (!v) return '—'
  const d = new Date(v); if (isNaN(d.getTime())) return '—'
  const m = Math.floor((Date.now() - d.getTime()) / 60000)
  if (m < 1) return 'now'; if (m < 60) return `${m}m`
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

const TEAM_COLORS: Record<string, string> = {
  Mercedes: '#27F4D2', 'Red Bull Racing': '#3671C6', Ferrari: '#E8002D', McLaren: '#FF8000',
  'Aston Martin': '#229971', Alpine: '#FF87BC', Williams: '#64C4FF', 'Racing Bulls': '#6692FF',
  'Kick Sauber': '#52E252', 'Haas F1 Team': '#B6BABD',
}
const tc = (t?: string) => TEAM_COLORS[t ?? ''] ?? '#888'
const mono  = 'var(--font-mono)'
const bebas = 'var(--font-bebas)'

const DRIVER_TEAM: Record<string, string> = {
  Antonelli: 'Mercedes',         ANT: 'Mercedes',
  Russell: 'Mercedes',           RUS: 'Mercedes',
  Hamilton: 'Ferrari',           HAM: 'Ferrari',
  Leclerc: 'Ferrari',            LEC: 'Ferrari',
  Sainz: 'Williams',             SAI: 'Williams',
  Norris: 'McLaren',             NOR: 'McLaren',
  Piastri: 'McLaren',            PIA: 'McLaren',
  Verstappen: 'Red Bull Racing', VER: 'Red Bull Racing',
  Perez: 'Red Bull Racing',      PER: 'Red Bull Racing',
  Alonso: 'Aston Martin',        ALO: 'Aston Martin',
  Stroll: 'Aston Martin',        STR: 'Aston Martin',
  Ocon: 'Haas F1 Team',          OCO: 'Haas F1 Team',
  Bearman: 'Haas F1 Team',       BEA: 'Haas F1 Team',
  Gasly: 'Alpine',               GAS: 'Alpine',
  Doohan: 'Alpine',              DOO: 'Alpine',
  Albon: 'Williams',             ALB: 'Williams',
  Colapinto: 'Alpine',           COL: 'Alpine',
  Tsunoda: 'Racing Bulls',       TSU: 'Racing Bulls',
  Lawson: 'Racing Bulls',        LAW: 'Racing Bulls',
  Hulkenberg: 'Kick Sauber',     HUL: 'Kick Sauber',
  Bortoleto: 'Kick Sauber',      BOR: 'Kick Sauber',
}
const driverTeamColor = (name?: string) => {
  if (!name) return '#888'
  const team = DRIVER_TEAM[name] ?? DRIVER_TEAM[name.split(' ').pop() ?? ''] ?? ''
  return TEAM_COLORS[team] ?? '#888'
}

function Grain() {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2, pointerEvents: 'none', opacity: 0.038,
      mixBlendMode: 'overlay',
      backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
      backgroundSize: '180px 180px',
    }} />
  )
}

function FadeIn({ children, from = 'bottom', delay = 0, style }: {
  children: React.ReactNode; from?: 'left' | 'right' | 'bottom'; delay?: number; style?: React.CSSProperties
}) {
  const x = from === 'left' ? -40 : from === 'right' ? 40 : 0
  const y = from === 'bottom' ? 32 : 0
  return (
    <motion.div
      initial={{ opacity: 0, x, y }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.65, delay, ease: [0.22, 1, 0.36, 1] }}
      style={style}
    >
      {children}
    </motion.div>
  )
}

function Bar({ pct, color, height = 6 }: { pct: number; color: string; height?: number }) {
  return (
    <div style={{ height, background: 'rgba(255,255,255,.06)', borderRadius: height }}>
      <motion.div
        initial={{ width: 0 }}
        whileInView={{ width: `${Math.max(4, pct)}%` }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        style={{ height: '100%', background: color, borderRadius: height, opacity: 0.85 }}
      />
    </div>
  )
}

function Section({ label, accent, headline, accentWord, body, cta, ctaHref, visual, flip = false, bg, borderColor }: {
  label: string; accent: string; headline: string; accentWord: string
  body: string; cta: string; ctaHref: string; visual: React.ReactNode
  flip?: boolean; bg?: string; borderColor?: string
}) {
  const tagged = headline.split(accentWord)
  const h = tagged.length > 1
    ? <>{tagged[0]}<span style={{ color: accent }}>{accentWord}</span>{tagged[1]}</>
    : <>{headline}</>

  return (
    <div style={{ background: bg ?? 'transparent', borderTop: borderColor ?? 'none', borderBottom: borderColor ?? 'none' }}>
      {/* ↓ added className="home-section-padding" — mobile collapses padding */}
      <div className="home-section-padding" style={{ maxWidth: 1320, margin: '0 auto', padding: '96px 24px' }}>
        <FadeIn from="bottom">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 52 }}>
            <div style={{ width: 2, height: 14, background: accent, borderRadius: 1 }} />
            <span style={{ fontSize: 8, fontFamily: mono, letterSpacing: '.22em', color: 'rgba(255,255,255,.25)' }}>{label}</span>
            <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg,${accent}28,transparent)` }} />
          </div>
        </FadeIn>

        {/* ↓ added className="home-section-grid" — mobile stacks to single column */}
        <div className="home-section-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 72, alignItems: 'center' }}>
          <FadeIn from={flip ? 'right' : 'left'} style={{ order: flip ? 2 : 1 }}>
            <div style={{ fontFamily: bebas, fontSize: 'clamp(40px,4.5vw,64px)', lineHeight: 0.9, marginBottom: 18, maxWidth: 560 }}>{h}</div>
            <p style={{ fontSize: 13, lineHeight: 1.85, color: 'rgba(255,255,255,.45)', maxWidth: 420, marginBottom: 28 }}>{body}</p>
            <Link href={ctaHref} style={{ textDecoration: 'none' }}>
              <motion.div
                whileHover={{ scale: 1.03, boxShadow: `0 0 24px ${accent}45` }}
                whileTap={{ scale: 0.97 }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '11px 24px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${accent}45`, background: `${accent}0e` }}
              >
                <span style={{ fontSize: 10, fontFamily: mono, color: accent, letterSpacing: '.14em', fontWeight: 700 }}>{cta}</span>
                <span style={{ fontSize: 14, color: accent }}>→</span>
              </motion.div>
            </Link>
          </FadeIn>
          <FadeIn from={flip ? 'left' : 'right'} delay={0.1} style={{ order: flip ? 1 : 2 }}>{visual}</FadeIn>
        </div>
      </div>
    </div>
  )
}

function StRow({ s, i }: { s: Standing; i: number }) {
  const color = tc(s.team)
  const medal = i === 0 ? '#F59E0B' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : 'rgba(255,255,255,.22)'
  return (
    <FadeIn from="left" delay={i * 0.05}>
      <div style={{ display: 'grid', gridTemplateColumns: '22px 3px 1fr 44px', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,.05)' }}>
        <span style={{ fontFamily: bebas, fontSize: i < 3 ? 15 : 11, color: medal, textAlign: 'right' }}>{i + 1}</span>
        <div style={{ width: 3, height: 16, background: color, borderRadius: 1 }} />
        <div>
          <div style={{ fontFamily: bebas, fontSize: 15, color: '#fff', letterSpacing: '.04em', lineHeight: 1 }}>{s.driver_code || s.driver}</div>
          <div style={{ fontSize: 7, color: 'rgba(255,255,255,.25)', fontFamily: mono, marginTop: 1 }}>{s.team}</div>
        </div>
        <div style={{ fontFamily: bebas, fontSize: 18, color, textAlign: 'right' }}>{s.points}</div>
      </div>
    </FadeIn>
  )
}

const SOURCES = [
  { name: 'Sky Sports',  domain: 'skysports.com',    color: '#0099FF' },
  { name: 'BBC Sport',   domain: 'bbc.co.uk',        color: '#FF4444' },
  { name: 'Reddit',      domain: 'reddit.com',       color: '#FF6314' },
  { name: 'The Race',    domain: 'the-race.com',     color: '#FFCC00' },
  { name: 'RaceFans',    domain: 'racefans.net',     color: '#27F4D2' },
  { name: 'F1 Official', domain: 'formula1.com',     color: '#fff'    },
  { name: 'Autosport',   domain: 'autosport.com',    color: '#A78BFA' },
  { name: 'WTF1',        domain: 'wtf1.com',         color: '#F59E0B' },
]

const FAKE_HEADLINES = [
  { text: 'Wolff: "We cannot talk about the title yet"',       source: 'Sky Sports',  tag: 'TEAM PRINCIPAL', hot: true  },
  { text: 'Ferrari confident engine upgrade clears FIA check', source: 'RaceFans',    tag: 'TECHNICAL',      hot: false },
  { text: 'Antonelli fastest in FP2 by 0.3s',                 source: 'F1 Official', tag: 'SESSION',        hot: true  },
  { text: 'Red Bull bring major floor update to Japan',        source: 'The Race',    tag: 'DEVELOPMENT',    hot: false },
  { text: 'Norris: McLaren fundamentally changed the car',     source: 'Autosport',   tag: 'DRIVER',         hot: false },
  { text: 'Russell takes pole — beats Antonelli by 0.041s',   source: 'BBC Sport',   tag: 'QUALIFYING',     hot: true  },
  { text: '"We need the mushroom" — Perez on Mario Kart refs', source: 'WTF1',        tag: 'PADDOCK',        hot: false },
  { text: 'Hamilton inspects RB21 in parc fermé post-race',   source: 'Reddit',      tag: 'PADDOCK',        hot: true  },
]

function IntelPanel() {
  const [activeRow, setActiveRow] = useState(0)
  const [filled, setFilled]       = useState<number[]>([])
  const [scanLine, setScanLine]   = useState(0)

  useEffect(() => {
    FAKE_HEADLINES.forEach((_, i) => {
      setTimeout(() => setFilled(f => [...f, i]), 400 + i * 280)
    })
  }, [])
  useEffect(() => {
    const t = setInterval(() => setActiveRow(r => (r + 1) % FAKE_HEADLINES.length), 2200)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    const t = setInterval(() => setScanLine(l => (l + 1) % 100), 40)
    return () => clearInterval(t)
  }, [])

  const srcColor  = (n: string) => SOURCES.find(s => s.name === n)?.color  ?? '#888'
  const srcDomain = (n: string) => SOURCES.find(s => s.name === n)?.domain ?? 'google.com'

  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.25, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      style={{ position: 'relative' }}
    >
      <div style={{
        position: 'relative', overflow: 'hidden',
        border: '1px solid rgba(255,255,255,.08)', borderRadius: 16,
        background: 'rgba(255,255,255,.03)', backdropFilter: 'blur(16px)',
        boxShadow: '0 0 0 1px rgba(255,255,255,.04) inset, 0 24px 64px rgba(0,0,0,.3)',
      }}>
        <div style={{ position: 'absolute', left: 0, right: 0, zIndex: 10, pointerEvents: 'none', top: `${scanLine}%`, height: 2, background: 'linear-gradient(90deg,transparent,rgba(39,244,210,.06),transparent)', transition: 'top 40ms linear' }} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,.06)', background: 'rgba(255,255,255,.02)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <motion.div animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.4, repeat: Infinity }} style={{ width: 6, height: 6, borderRadius: '50%', background: '#E10600', boxShadow: '0 0 8px #E10600' }} />
            <span style={{ fontSize: 7, fontFamily: mono, letterSpacing: '.18em', color: 'rgba(255,255,255,.4)' }}>INTELLIGENCE FEED</span>
          </div>
          <motion.span animate={{ opacity: [1, 0.5, 1] }} transition={{ duration: 2, repeat: Infinity }} style={{ fontSize: 7, fontFamily: mono, color: '#27F4D2', letterSpacing: '.1em' }}>SCANNING {SOURCES.length} SOURCES</motion.span>
        </div>

        <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,.05)', display: 'flex', gap: 6 }}>
          {SOURCES.map((src, i) => (
            <motion.div key={src.name} initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4 + i * 0.08, duration: 0.35, ease: [0.34, 1.56, 0.64, 1] }} title={src.name}
              style={{ width: 28, height: 28, borderRadius: 8, background: `${src.color}15`, border: `1px solid ${src.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'default', flexShrink: 0 }}
            >
              <img
                src={`https://www.google.com/s2/favicons?domain=${src.domain}&sz=32`}
                width={16} height={16} alt={src.name}
                style={{ borderRadius: 2, opacity: 0.9 }}
              />
            </motion.div>
          ))}
        </div>

        <div style={{ padding: '8px 0' }}>
          {FAKE_HEADLINES.map((h, i) => {
            const isVisible = filled.includes(i), isActive = i === activeRow
            const color  = srcColor(h.source)
            const domain = srcDomain(h.source)
            return (
              <motion.div key={i} initial={{ opacity: 0, x: -12 }} animate={isVisible ? { opacity: 1, x: 0 } : { opacity: 0, x: -12 }} transition={{ duration: 0.35, ease: 'easeOut' }}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '7px 14px', background: isActive ? `${color}08` : 'transparent', borderLeft: `2px solid ${isActive ? color : 'transparent'}`, transition: 'background 0.3s,border-color 0.3s' }}>
                <div style={{ width: 16, height: 16, flexShrink: 0, marginTop: 1 }}>
                  <img
                    src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
                    width={16} height={16} alt={h.source}
                    style={{ borderRadius: 2, opacity: 0.75 }}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    <span style={{ fontSize: 6, fontFamily: mono, letterSpacing: '.12em', color: isActive ? color : 'rgba(255,255,255,.2)', transition: 'color 0.3s' }}>{h.tag}</span>
                    {h.hot && <motion.span animate={{ opacity: [1, 0.5, 1] }} transition={{ duration: 1.2, repeat: Infinity }} style={{ fontSize: 7 }}>🔥</motion.span>}
                  </div>
                  <div style={{ fontSize: 11, lineHeight: 1.4, color: isActive ? 'rgba(255,255,255,.9)' : 'rgba(255,255,255,.45)', transition: 'color 0.3s', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{isVisible ? h.text : ''}</div>
                </div>
                <span style={{ fontSize: 7, fontFamily: mono, color, opacity: isActive ? 0.9 : 0.35, flexShrink: 0, paddingTop: 2, transition: 'opacity 0.3s' }}>{h.source.split(' ')[0]}</span>
              </motion.div>
            )
          })}
        </div>

        <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,.05)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 7, fontFamily: mono, letterSpacing: '.12em', color: 'rgba(255,255,255,.22)', flexShrink: 0 }}>SIGNAL MOMENTUM</span>
          <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,.06)', borderRadius: 2 }}>
            <motion.div animate={{ width: ['42%', '78%', '55%', '90%', '63%'] }} transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }} style={{ height: '100%', background: 'linear-gradient(90deg,#E10600,#F59E0B)', borderRadius: 2 }} />
          </div>
          <motion.span animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 1.8, repeat: Infinity }} style={{ fontSize: 7, fontFamily: mono, color: '#4ADE80', letterSpacing: '.1em' }}>LIVE</motion.span>
        </div>
      </div>
      <div style={{ position: 'absolute', bottom: -20, left: '10%', right: '10%', height: 40, background: 'radial-gradient(ellipse,rgba(225,6,0,.15) 0%,transparent 70%)', filter: 'blur(12px)', pointerEvents: 'none' }} />
    </motion.div>
  )
}

function ScrollCue() {
  return (
    <div style={{
      position: 'absolute', bottom: 36, left: '50%',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
      pointerEvents: 'none', zIndex: 10,
      opacity: 0,
      animation: 'cueAppear 6s ease-in-out 1s forwards',
    }}>
      <style>{`
        @keyframes cueAppear {
          0%   { opacity: 0; transform: translateX(-50%) translateY(6px);  }
          15%  { opacity: 1; transform: translateX(-50%) translateY(0);    }
          75%  { opacity: 1; transform: translateX(-50%) translateY(0);    }
          100% { opacity: 0; transform: translateX(-50%) translateY(10px); }
        }
        @keyframes eqBar {
          0%, 100% { transform: scaleY(0.35); opacity: 0.15; }
          50%       { transform: scaleY(1);    opacity: 0.6;  }
        }
        @keyframes chevBounce {
          0%, 100% { transform: translateY(0);   }
          50%       { transform: translateY(6px); }
        }
      `}</style>
      <span style={{ fontSize: 7, fontFamily: mono, letterSpacing: '.22em', color: 'rgba(255,255,255,.3)' }}>SCROLL TO EXPLORE</span>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        {[6, 9, 14, 9, 6].map((h, i) => (
          <div key={i} style={{ width: 2, height: h, background: 'rgba(255,255,255,.5)', borderRadius: 1, animation: `eqBar 1.4s ease-in-out ${i * 0.13}s infinite` }} />
        ))}
      </div>
      <svg width="16" height="9" viewBox="0 0 16 9" fill="none" style={{ animation: 'chevBounce 1.8s ease-in-out infinite' }}>
        <path d="M1 1L8 8L15 1" stroke="rgba(255,255,255,0.28)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

export default function HomePage() {
  const [booted, setBooted]     = useState(false)
  const [skipBoot, setSkipBoot] = useState(false)
  const [briefing, setBriefing] = useState<any>(null)
  const [stories, setStories]   = useState<Story[]>([])
  const [drivers, setDrivers]   = useState<Driver[]>([])
  const [dS, setDS]             = useState<Standing[]>([])
  const [cS, setCS]             = useState<Standing[]>([])

  const heroRef = useRef<HTMLDivElement>(null)
  const { scrollY } = useScroll()
  const heroOp  = useTransform(scrollY, [0, 420], [1, 0])
  const _heroY  = useTransform(scrollY, [0, 500], [0, -80])
  const heroY   = useSpring(_heroY, { stiffness: 80, damping: 25 })

  useEffect(() => {
    if (sessionStorage.getItem('f1b_booted') === '1') { setSkipBoot(true); setBooted(true) }
  }, [])

  useEffect(() => {
    Promise.all([
      fetch('/api/intelligence/briefing').then(r => r.ok ? r.json() : null),
      fetch('/api/stories?hours=720&limit=12').then(r => r.ok ? r.json() : null),
      fetch('/api/intelligence/drivers?format=summary&type=driver').then(r => r.ok ? r.json() : null),
      fetch('/api/standings/drivers').then(r => r.ok ? r.json() : null),
      fetch('/api/standings/constructors').then(r => r.ok ? r.json() : null),
    ]).then(([br, st, dr, ds, cs]) => {
      if (br?.ok) setBriefing(br.briefing ?? null)
      setStories(st?.ok ? (st.data ?? []) : [])
      setDrivers(dr?.ok ? (dr.data ?? dr.drivers ?? []) : [])
      setDS(((ds?.standings ?? ds?.data ?? []) as Standing[]).slice(0, 5))
      setCS(((cs?.standings ?? cs?.data ?? []) as Standing[]).slice(0, 5))
    }).catch(() => {})
  }, [])

  const heroWords = (briefing?.headline ?? 'MERC BUILD A ROCKETSHIP. FERRARI BETS BIG.').replace(/"/g, '').split(' ')

  const FD: Standing[] = [
    { driver_code: 'ANT', team: 'Mercedes',        points: 47 },
    { driver_code: 'RUS', team: 'Mercedes',        points: 43 },
    { driver_code: 'HAM', team: 'Ferrari',         points: 33 },
    { driver_code: 'LEC', team: 'Ferrari',         points: 30 },
    { driver_code: 'NOR', team: 'McLaren',         points: 15 },
  ]
  const FC: Standing[] = [
    { driver_code: 'Mercedes', team: 'Mercedes',        points: 90 },
    { driver_code: 'Ferrari',  team: 'Ferrari',         points: 63 },
    { driver_code: 'McLaren',  team: 'McLaren',         points: 18 },
    { driver_code: 'Red Bull', team: 'Red Bull Racing', points: 8  },
  ]
  const FDrv: Driver[] = [
    { driverName: 'Antonelli',  sentimentAvg: 0.42,  sentimentLabel: 'positive' },
    { driverName: 'Russell',    sentimentAvg: 0.31,  sentimentLabel: 'positive' },
    { driverName: 'Hamilton',   sentimentAvg: 0.28,  sentimentLabel: 'positive' },
    { driverName: 'Leclerc',    sentimentAvg: 0.11,  sentimentLabel: 'neutral'  },
    { driverName: 'Verstappen', sentimentAvg: -0.14, sentimentLabel: 'negative' },
  ]

  const finalD   = dS.length > 0 ? dS : FD
  const finalC   = cS.length > 0 ? cS : FC
  const finalDrv = drivers.length > 0 ? drivers.slice(0, 5) : FDrv

  return (
    <>
      <Grain />
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}><BgCanvas /></div>
      {!booted && !skipBoot && (
        <BootScreen onEnter={() => { sessionStorage.setItem('f1b_booted', '1'); setBooted(true) }} />
      )}

      <div suppressHydrationWarning style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', position: 'relative', zIndex: 3 }}>
        <Header onReset={() => { sessionStorage.removeItem('f1b_booted'); setBooted(false) }} />
        <Ticker />

        {/* ═══ HERO ═══ */}
        <div ref={heroRef} style={{ position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg,transparent 50%,rgba(225,6,0,.04) 100%)', pointerEvents: 'none' }} />

          <motion.div style={{ opacity: heroOp, y: heroY, width: '100%', willChange: 'opacity, transform' }}>
            {/* ↓ className="home-hero-grid" collapses to 1 col on mobile */}
            <div className="home-hero-grid" style={{ maxWidth: 1320, margin: '0 auto', padding: 'calc(var(--header-h) + 56px) 24px 72px', display: 'grid', gridTemplateColumns: '1fr 380px', gap: 52, alignItems: 'start' }}>
              <div>
                <motion.div initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
                  <div style={{ width: 28, height: 1, background: 'linear-gradient(90deg,#E10600,transparent)' }} />
                  <span style={{ fontSize: 8, fontFamily: mono, letterSpacing: '.2em', color: 'rgba(255,255,255,.3)' }}>F1 BULLETIN · INTELLIGENCE TERMINAL · 2026</span>
                  <motion.div animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.8, repeat: Infinity }}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', border: '1px solid rgba(225,6,0,.3)', borderRadius: 20, background: 'rgba(225,6,0,.08)' }}>
                    <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#E10600' }} />
                    <span style={{ fontSize: 7, fontFamily: mono, color: '#E10600', letterSpacing: '.12em' }}>LIVE</span>
                  </motion.div>
                </motion.div>

                <h1 style={{ fontFamily: bebas, fontSize: 'clamp(56px,7.5vw,100px)', lineHeight: 0.88, letterSpacing: '.02em', margin: '0 0 24px' }}>
                  {heroWords.map((word: string, i: number) => (
                    <motion.span key={`${word}-${i}`}
                      initial={{ clipPath: 'inset(0 100% 0 0)', opacity: 0 }}
                      animate={{ clipPath: 'inset(0 0% 0 0)', opacity: 1 }}
                      transition={{ delay: 0.06 + i * 0.09, duration: 0.58, ease: [0.22, 1, 0.36, 1] }}
                      style={{ display: 'inline-block', marginRight: '0.18em', color: i === heroWords.length - 1 ? '#E10600' : '#fff' }}
                    >{word}</motion.span>
                  ))}
                </h1>

                {stories.length > 1 && stories[1] && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55, duration: 0.45 }} style={{ marginBottom: 28, maxWidth: 540 }}>
                    {stories[1].latest_url ? (
                      <a href={stories[1].latest_url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', display: 'block' }}>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '11px 14px', border: '1px solid rgba(255,255,255,.08)', borderLeft: '2px solid rgba(255,255,255,.18)', borderRadius: '0 8px 8px 0', background: 'rgba(255,255,255,.02)' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 7, fontFamily: mono, letterSpacing: '.1em', color: 'rgba(255,255,255,.3)', marginBottom: 5 }}>{(stories[1].topic_cluster || 'F1').replace(/_/g, ' ')} · {timeAgo(stories[1].latest_event_ts)}</div>
                            <div style={{ fontSize: 12, lineHeight: 1.45, color: 'rgba(255,255,255,.62)' }}>{stories[1].story_title || stories[1].title}</div>
                          </div>
                          <span style={{ fontSize: 11, color: 'rgba(255,255,255,.22)', paddingTop: 2 }}>↗</span>
                        </div>
                      </a>
                    ) : (
                      <div style={{ padding: '11px 14px', border: '1px solid rgba(255,255,255,.07)', borderLeft: '2px solid rgba(255,255,255,.15)', borderRadius: '0 8px 8px 0', background: 'rgba(255,255,255,.02)' }}>
                        <div style={{ fontSize: 7, fontFamily: mono, color: 'rgba(255,255,255,.3)', marginBottom: 4 }}>{(stories[1].topic_cluster || 'F1').replace(/_/g, ' ')}</div>
                        <div style={{ fontSize: 12, lineHeight: 1.45, color: 'rgba(255,255,255,.62)' }}>{stories[1].story_title || stories[1].title}</div>
                      </div>
                    )}
                  </motion.div>
                )}

                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.65, duration: 0.45 }} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <Link href="/intelligence" style={{ textDecoration: 'none' }}>
                    <motion.div whileHover={{ scale: 1.04, boxShadow: '0 0 32px rgba(225,6,0,.5)' }} whileTap={{ scale: 0.96 }}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '12px 28px', background: '#E10600', borderRadius: 8, cursor: 'pointer' }}>
                      <span style={{ fontSize: 10, fontFamily: mono, color: '#fff', letterSpacing: '.16em', fontWeight: 700 }}>ALL STORIES</span>
                      <span style={{ fontSize: 14, color: '#fff' }}>→</span>
                    </motion.div>
                  </Link>
                  <Link href="/predictions" style={{ textDecoration: 'none' }}>
                    <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 22px', border: '1px solid rgba(245,158,11,.3)', borderRadius: 8, background: 'rgba(245,158,11,.06)', cursor: 'pointer' }}>
                      <span style={{ fontSize: 10, fontFamily: mono, color: '#F59E0B', letterSpacing: '.12em' }}>RACE PREDICTION</span>
                    </motion.div>
                  </Link>
                </motion.div>
              </div>

              {/* ↓ className="home-intel-panel" hides on mobile */}
              <div className="home-intel-panel">
                <IntelPanel />
              </div>
            </div>
          </motion.div>

          <ScrollCue />
        </div>

        {/* ═══ INTELLIGENCE ═══ */}
        <Section
          accent="#E10600" label="INTELLIGENCE · NARRATIVES"
          headline="MERC BUILD A ROCKETSHIP. FERRARI BETS BIG."
          accentWord="ROCKETSHIP."
          body="Two races in and Mercedes have won both. Antonelli versus Russell is already the intra-team battle nobody expected. Ferrari's engine gamble paying dividends. Red Bull off the podium and searching. Every narrative tracked, scored and clustered across 20+ sources in real-time."
          cta="EXPLORE INTELLIGENCE" ctaHref="/intelligence"
          visual={
            <div style={{ border: '1px solid rgba(255,255,255,.08)', borderRadius: 18, padding: '28px', background: 'rgba(255,255,255,.03)', backdropFilter: 'blur(16px)' }}>
              <div style={{ fontSize: 7, fontFamily: mono, letterSpacing: '.16em', color: 'rgba(255,255,255,.25)', marginBottom: 20 }}>DRIVER MEDIA SENTIMENT</div>
              {finalDrv.map((d, i) => {
                const avg       = Number(d.sentimentAvg ?? 0)
                const teamColor = driverTeamColor(d.driverName)
                const barColor  = d.sentimentLabel === 'negative' ? '#E10600' : teamColor
                return (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 72px', alignItems: 'center', gap: 14, padding: '11px 0', borderBottom: '1px solid rgba(255,255,255,.05)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 3, height: 18, borderRadius: 2, background: teamColor, flexShrink: 0 }} />
                      <span style={{ fontFamily: bebas, fontSize: 17, color: '#fff', letterSpacing: '.05em' }}>{d.driverName}</span>
                    </div>
                    <Bar pct={Math.min(100, Math.abs(avg) * 350)} color={barColor} height={5} />
                    <span style={{ fontSize: 11, fontFamily: mono, color: barColor, textAlign: 'right', fontWeight: 700 }}>{avg >= 0 ? '+' : ''}{avg.toFixed(3)}</span>
                  </div>
                )
              })}
            </div>
          }
        />

        {/* ═══ STANDINGS ═══ */}
        <Section flip
          accent="#4ADE80" label="STANDINGS · 2026"
          headline="STRATEGIES. BATTERIES. TEAMMATES RACING."
          accentWord="TEAMMATES"
          body="Four drivers within reach of each other after two rounds. No one has pulled away, no one has collapsed. The margins are tight enough that a single race swing changes everything — and the season is only just getting started."
          cta="FULL STANDINGS" ctaHref="/standings"
          visual={
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28 }}>
              <div>
                <div style={{ fontSize: 7, fontFamily: mono, letterSpacing: '.16em', color: 'rgba(255,255,255,.22)', marginBottom: 14 }}>DRIVERS</div>
                {finalD.map((s, i) => <StRow key={i} s={s} i={i} />)}
              </div>
              <div>
                <div style={{ fontSize: 7, fontFamily: mono, letterSpacing: '.16em', color: 'rgba(255,255,255,.22)', marginBottom: 14 }}>CONSTRUCTORS</div>
                {finalC.map((s, i) => <StRow key={i} s={s} i={i} />)}
              </div>
            </div>
          }
        />

        {/* ═══ ANALYTICS ═══ */}
        <Section
          accent="#27F4D2" label="ANALYTICS · LAP DATA"
          headline="THE GRID JUST RESET. READ THE DATA."
          accentWord="DATA"
          body="The 2026 reset reshuffled the grid. Mercedes nailed active aero from lap one — nearly a second per lap ahead of everyone. Ferrari's power unit closes gaps on straights. Red Bull still searching for downforce balance. Midfield is getting buried under incidents, retirements and races that end too early."
          cta="OPEN ANALYTICS" ctaHref="/analytics"
          bg="rgba(39,244,210,.02)" borderColor="1px solid rgba(39,244,210,.07)"
          visual={
            <div style={{ border: '1px solid rgba(39,244,210,.12)', borderRadius: 18, padding: '28px', background: 'rgba(255,255,255,.03)', backdropFilter: 'blur(16px)' }}>
              <div style={{ fontSize: 7, fontFamily: mono, letterSpacing: '.14em', color: 'rgba(255,255,255,.25)', marginBottom: 22 }}>R2 CHINA · RACE PACE DELTA (s/lap vs leader)</div>
              {[
                { team: 'Mercedes',     d: 0.00, c: '#27F4D2' },
                { team: 'Ferrari',      d: 0.31, c: '#E8002D' },
                { team: 'McLaren',      d: 0.58, c: '#FF8000' },
                { team: 'Red Bull',     d: 0.94, c: '#3671C6' },
                { team: 'Aston Martin', d: 1.42, c: '#229971' },
              ].map(t => (
                <div key={t.team} style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontFamily: bebas, color: '#fff', letterSpacing: '.04em' }}>{t.team}</span>
                    <span style={{ fontSize: 9, fontFamily: mono, color: t.d === 0 ? t.c : 'rgba(255,255,255,.35)' }}>{t.d === 0 ? 'REFERENCE' : `+${t.d.toFixed(2)}s`}</span>
                  </div>
                  <Bar pct={Math.max(6, 100 - t.d * 38)} color={t.c} height={7} />
                </div>
              ))}
            </div>
          }
        />

        {/* ═══ PREDICTION ═══ */}
        <Section flip
          accent="#F59E0B" label="PREDICTION · MONTE CARLO"
          headline="DOWNFALL or COMEBACK?"
          accentWord="DOWNFALL"
          body="Red Bull haven't been on the podium yet. McLaren are still finding their feet after 2025. The model runs 500 simulations every weekend and right now it has two names pulling ahead of the rest."
          cta="VIEW PREDICTION MODEL" ctaHref="/predictions"
          visual={
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', fontFamily: bebas, fontSize: 130, color: '#F59E0B', opacity: 0.04, pointerEvents: 'none', userSelect: 'none', whiteSpace: 'nowrap' }}>WDC?</div>
              <div style={{ position: 'relative', border: '1px solid rgba(245,158,11,.15)', borderRadius: 18, padding: '28px', background: 'rgba(255,255,255,.03)', backdropFilter: 'blur(16px)' }}>
                <div style={{ fontSize: 7, fontFamily: mono, letterSpacing: '.14em', color: 'rgba(255,255,255,.25)', marginBottom: 22 }}>CHAMPIONSHIP WIN PROBABILITY · R3</div>
                {[
                  { code: 'ANT', pct: 28, c: '#27F4D2' },
                  { code: 'RUS', pct: 24, c: '#27F4D2' },
                  { code: 'HAM', pct: 19, c: '#E8002D' },
                  { code: 'LEC', pct: 14, c: '#E8002D' },
                  { code: 'NOR', pct: 8,  c: '#FF8000' },
                  { code: 'VER', pct: 4,  c: '#3671C6' },
                ].map(d => (
                  <div key={d.code} style={{ display: 'grid', gridTemplateColumns: '44px 1fr 44px', alignItems: 'center', gap: 12, marginBottom: 13 }}>
                    <span style={{ fontFamily: bebas, fontSize: 16, color: d.c, letterSpacing: '.04em' }}>{d.code}</span>
                    <Bar pct={d.pct} color={d.c} height={7} />
                    <span style={{ fontFamily: bebas, fontSize: 20, color: d.c, textAlign: 'right' }}>{d.pct}%</span>
                  </div>
                ))}
                <div style={{ marginTop: 18, padding: '10px 14px', border: '1px solid rgba(245,158,11,.12)', borderRadius: 8, background: 'rgba(245,158,11,.04)' }}>
                  <div style={{ fontSize: 7, fontFamily: mono, letterSpacing: '.12em', color: '#F59E0B', marginBottom: 3 }}>35% CONFIDENCE · R2 OF 24</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,.32)', lineHeight: 1.6 }}>Model confidence grows each race. XGBoost activates at R8.</div>
                </div>
              </div>
            </div>
          }
        />

        <Footer />
      </div>
    </>
  )
}