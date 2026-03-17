'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CIRCUITS as BASE_CIRCUITS } from './circuit_paths'
import { SESSION_TIMES } from '@/lib/f1-sessions'
import type { RaceRound } from '@/app/(api)/api/calendar/route'
interface Props { onEnter: () => void }
const F1_RED = '#E10600'
// ── Types ────────────────────────────────────────────────────────────────────
type Session = { n: string; et: string; utc: Date }
type CurrentRound = {
  name:     string
  nameA:    string
  nameB:    string
  round:    string
  circuit:  string
  city:     string
  raceUTC:  Date
  label:    string
  sessions: Session[]
  season:   number
}
// ── Derive CURRENT from live data ────────────────────────────────────────────
function buildCurrentRound(calendar: RaceRound[]): CurrentRound | null {
  if (!calendar.length) return null
  const now    = Date.now()
  const BUFFER = 3 * 60 * 60 * 1000
  const round =
    calendar.find(r => new Date(r.race_start_utc).getTime() + BUFFER > now) ??
    calendar[calendar.length - 1]
  const raceUTC    = new Date(round.race_start_utc)
  const daysToRace = (raceUTC.getTime() - now) / 86_400_000
  const label      = daysToRace <= 7 && daysToRace > 0 ? 'THIS WEEKEND' : `ROUND ${String(round.round).padStart(2, '0')}`
  const nameParts  = round.race_name.toUpperCase().replace(' GRAND PRIX', '').trim()
  const sessions   = buildSessions(round)
  return {
    name:    round.race_name.toUpperCase(),
    nameA:   nameParts,
    nameB:   'GRAND PRIX',
    round:   String(round.round).padStart(2, '0'),
    circuit: round.circuit_name.toUpperCase(),
    city:    `${round.city}, ${round.country}`,
    raceUTC,
    label,
    sessions,
    season:  round.season ?? 2026,
  }
}
function buildSessions(round: RaceRound): Session[] {
  const overlay = SESSION_TIMES[round.round]
  if (overlay?.length) {
    return overlay.map(s => ({
      n:   s.n,
      et:  s.et,
      utc: deriveUTC(round.race_date, s.utcOffset),
    }))
  }
  const sessions: Session[] = []
  if (round.is_sprint_weekend) {
    if (round.fp1_date)          sessions.push({ n: 'FP1',          et: formatDate(round.fp1_date),          utc: new Date(round.fp1_date) })
    if (round.sprint_quali_date) sessions.push({ n: 'SPRINT QUALI', et: formatDate(round.sprint_quali_date), utc: new Date(round.sprint_quali_date) })
    if (round.sprint_date)       sessions.push({ n: 'SPRINT',       et: formatDate(round.sprint_date),       utc: new Date(round.sprint_date) })
    if (round.quali_date)        sessions.push({ n: 'QUALIFYING',   et: formatDate(round.quali_date),        utc: new Date(round.quali_date) })
  } else {
    if (round.fp1_date)   sessions.push({ n: 'FP1',        et: formatDate(round.fp1_date),   utc: new Date(round.fp1_date) })
    if (round.fp2_date)   sessions.push({ n: 'FP2',        et: formatDate(round.fp2_date),   utc: new Date(round.fp2_date) })
    if (round.fp3_date)   sessions.push({ n: 'FP3',        et: formatDate(round.fp3_date),   utc: new Date(round.fp3_date) })
    if (round.quali_date) sessions.push({ n: 'QUALIFYING', et: formatDate(round.quali_date), utc: new Date(round.quali_date) })
  }
  sessions.push({ n: 'RACE', et: formatDate(round.race_date), utc: new Date(round.race_start_utc) })
  return sessions
}
function deriveUTC(raceDate: string, offset: string): Date {
  const dayOffset  = offset.startsWith('-') ? -parseInt(offset[1]) : 0
  const timeString = offset.replace(/^-\dT/, 'T').replace(/^T/, 'T')
  const base       = new Date(raceDate)
  base.setDate(base.getDate() + dayOffset)
  return new Date(`${base.toISOString().slice(0, 10)}${timeString}`)
}
function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).toUpperCase()
}
// ── Circuit data ─────────────────────────────────────────────────────────────
type CircuitEntry = {
  rd: string; name: string; country: string; dates: string; et: string
  vw: number; vh: number; sf: [number, number]; d: string; color?: string
}
const OVERRIDES: Record<string, { vw: number; vh: number; sf: [number, number]; d: string }> = {
  '05': { vw: 40, vh: 80, sf: [25, 62], d: `M 25 62 L 27 54 L 26 46 L 23 40 L 20 32 L 21 22 L 24 14 L 28 10 L 32 10 L 35 14 L 35 22 L 32 30 L 30 38 L 30 46 L 33 52 L 34 58 L 32 64 L 28 66 L 25 64 Z` },
  '07': { vw: 100, vh: 80, sf: [68, 58], d: `M 68 58 L 76 52 L 80 44 L 78 36 L 72 28 L 62 22 L 50 20 L 38 22 L 28 30 L 22 40 L 22 50 L 28 58 L 36 62 L 36 54 L 30 48 L 30 40 L 36 32 L 48 28 L 60 30 L 66 38 L 66 48 L 62 54 L 60 60 L 66 62 L 68 58 Z` },
}
const CIRCUITS: CircuitEntry[] = (BASE_CIRCUITS as unknown as CircuitEntry[]).map(c => {
  const ov = OVERRIDES[c.rd]
  return { ...(ov ? { ...c, ...ov } : c), color: F1_RED }
})
const MADRID: CircuitEntry = {
  rd: '16', name: 'MADRID', country: 'Spain', dates: '11–13 SEP', et: '9:00 AM ET',
  color: F1_RED, vw: 100, vh: 80, sf: [50, 40], d: '',
}
const ALL_CIRCUITS: CircuitEntry[] = [
  ...CIRCUITS.filter(c => parseInt(c.rd) < 16),
  MADRID,
  ...CIRCUITS.filter(c => parseInt(c.rd) > 16),
]
const SLOT_W = 130
const SLOT_H = 80
const BARCODE = [3,1,2,1,4,1,1,2,3,1,2,1,1,4,2,1,3,1,1,2,4,1,1,3,2,1,1,2,3,1,4,1,1,2,1,3,2,1,3,1,1,2]
const CN = [...ALL_CIRCUITS.map(c => c.name), ...ALL_CIRCUITS.map(c => c.name)]
const DN = ['VERSTAPPEN','HAMILTON','NORRIS','LECLERC','PIASTRI','RUSSELL','SAINZ','ALONSO','ALBON','STROLL','GASLY','OCON','HULKENBERG','BEARMAN','TSUNODA','LAWSON','PEREZ','COLAPINTO','BOTTAS','ANTONELLI']
const MD = [...DN, ...DN]
const pad = (n: number) => String(n).padStart(2, '0')
// ── Hooks ────────────────────────────────────────────────────────────────────
function useCalendar() {
  const [calendar, setCalendar] = useState<RaceRound[]>([])
  const [ready, setReady]       = useState(false)
  useEffect(() => {
    fetch('/api/calendar')
      .then(r => {
        if (!r.ok) throw new Error(`Calendar API ${r.status}`)
        return r.json()
      })
      .then((data: unknown) => {
        setCalendar(Array.isArray(data) ? data : [])
        setReady(true)
      })
      .catch(err => {
        console.error('Calendar fetch failed:', err)
        setReady(true)
      })
  }, [])
  return { calendar, ready }
}
function useCountdown(targetMs: number) {
  const [v, set] = useState({ d: 0, h: 0, m: 0, s: 0 })
  useEffect(() => {
    const t = () => {
      const diff = targetMs - Date.now()
      if (diff > 0) set({ d: Math.floor(diff / 86400000), h: Math.floor((diff % 86400000) / 3600000), m: Math.floor((diff % 3600000) / 60000), s: Math.floor((diff % 60000) / 1000) })
    }
    t(); const i = setInterval(t, 1000); return () => clearInterval(i)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetMs]); return v
}
function useInView() {
  const ref = useRef<HTMLDivElement>(null)
  const [v, set] = useState(false)
  useEffect(() => {
    const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) set(true) }, { threshold: 0.1 })
    if (ref.current) o.observe(ref.current); return () => o.disconnect()
  }, []); return { ref, v }
}
function useVisibleOnce() {
  const ref = useRef<HTMLDivElement | null>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (!ref.current || visible) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect() } },
      { threshold: 0.25, rootMargin: '40px' }
    )
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [visible])
  return { ref, visible }
}
function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const { ref, v } = useInView()
  return (
    <div ref={ref} style={{ opacity: v ? 1 : 0, transform: v ? 'none' : 'translateY(20px)', transition: `opacity .55s ease ${delay}ms,transform .55s cubic-bezier(.16,1,.3,1) ${delay}ms` }}>
      {children}
    </div>
  )
}
function CircuitLayout({ c }: { c: CircuitEntry }) {
  const { ref, visible } = useVisibleOnce()
  if (!c.d) {
    return (
      <div ref={ref} style={{ width: SLOT_W, height: SLOT_H, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
        <div style={{ width: 34, height: 34, borderRadius: '50%', border: `1.5px dashed ${F1_RED}`, opacity: 0.25 }} />
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, color: F1_RED, opacity: 0.35, letterSpacing: '.1em' }}>TBC</span>
      </div>
    )
  }
  const PAD = 8
  const scale = Math.min((SLOT_W - PAD * 2) / c.vw, (SLOT_H - PAD * 2) / c.vh)
  const offX = (SLOT_W - c.vw * scale) / 2
  const offY = (SLOT_H - c.vh * scale) / 2
  return (
    <div ref={ref} style={{ width: SLOT_W, height: SLOT_H }}>
      <svg width={SLOT_W} height={SLOT_H} style={{ display: 'block', overflow: 'visible' }}>
        <g transform={`translate(${offX},${offY}) scale(${scale})`}>
          <path d={c.d} fill="none" stroke={F1_RED} strokeWidth={4 / scale} strokeLinecap="round" strokeLinejoin="round" opacity={0.15} />
          <path d={c.d} fill="none" stroke={F1_RED} strokeWidth={2 / scale} strokeLinecap="round" strokeLinejoin="round" pathLength={1}
            style={visible ? { strokeDasharray: 1, strokeDashoffset: 1, animation: 'trackDraw 1.1s ease forwards' } : { strokeDasharray: 1, strokeDashoffset: 1 }}
          />
          <circle cx={c.sf[0]} cy={c.sf[1]} r={3 / scale} fill={F1_RED} />
          <circle cx={c.sf[0]} cy={c.sf[1]} r={1.5 / scale} fill="#000" opacity={0.6} />
        </g>
      </svg>
    </div>
  )
}
// ── Calendar card ─────────────────────────────────────────────────────────────
function CalendarCard({ c, rd, dark, bd, card, dim, fg, isCurrent }: {
  c: CircuitEntry; rd: RaceRound | undefined; dark: boolean
  bd: string; card: string; dim: string; fg: string; isCurrent: boolean
}) {
  return (
    <div
      className="cc"
      style={{
        borderColor: isCurrent ? '#e10600' : bd,
        background:  isCurrent ? (dark ? '#110808' : '#fff0f0') : card,
        opacity:     rd?.is_completed && !isCurrent ? 0.45 : 1,
      }}
    >
      <div className="cc-layout" style={{ background: dark ? 'rgba(255,255,255,.02)' : 'rgba(0,0,0,.02)' }}>
        <CircuitLayout c={c} />
      </div>
      <div className="cc-body">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 5 }}>
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: '#e10600', fontWeight: 800, letterSpacing: '.14em' }}>RD {c.rd}</span>
          {isCurrent && <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, color: '#e10600', animation: 'blink 1.2s infinite' }}>● NOW</span>}
          {!isCurrent && rd?.is_sprint_weekend && <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, color: '#ff6b00', letterSpacing: '.1em' }}>SPRINT</span>}
        </div>
        <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 13, color: fg, marginBottom: 1, lineHeight: 1.15, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: '2.3em' }}>{c.name}</div>
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, color: dim, marginBottom: 6 }}>{c.country}</div>
        <div style={{ borderTopWidth: 1, borderTopStyle: 'solid' as const, borderTopColor: dark ? '#1c1c1c' : '#e8e8e8', paddingTop: 6 }}>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, color: dim, letterSpacing: '.08em', marginBottom: 2 }}>
            {rd ? formatDate(rd.race_date) : c.dates}
          </div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, color: isCurrent ? '#e10600' : fg, fontWeight: isCurrent ? 800 : 400 }}>
            {rd
              ? `${rd.race_laps ?? '–'} LAPS · ${rd.circuit_length_km ?? '–'} KM`
              : c.et}
          </div>
        </div>
      </div>
    </div>
  )
}
// ── Main component ────────────────────────────────────────────────────────────
export default function BootScreen({ onEnter }: Props) {
  const [lights, setLights]       = useState(0)
  const [lightsOut, setLightsOut] = useState(false)
  const [stage, setStage]         = useState<'lights' | 'reveal'>('lights')
  const [dark, setDark]           = useState(true)
  const [exiting, setExiting]     = useState(false)
  const [secTick, setSecTick]     = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const bgRef     = useRef<HTMLDivElement>(null)

  const { calendar, ready } = useCalendar()
  const readyRef = useRef(false)
  useEffect(() => { readyRef.current = ready }, [ready])

  const CURRENT = useMemo(() => buildCurrentRound(calendar), [calendar])

  const raceTargetMs = useMemo(
    () => CURRENT?.raceUTC.getTime() ?? (Date.now() + 86400000),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [CURRENT?.raceUTC.getTime()]
  )

  useEffect(() => {
    if (stage !== 'lights') return
    let n = 0
    const t = setInterval(() => {
      n += 1; setLights(n)
      if (n >= 5) {
        clearInterval(t)
        const tryReveal = () => {
          if (readyRef.current) {
            setTimeout(() => { setLightsOut(true); setTimeout(() => setStage('reveal'), 400) }, 400 + Math.random() * 200)
          } else {
            setTimeout(tryReveal, 100)
          }
        }
        tryReveal()
      }
    }, 380)
    return () => clearInterval(t)
  }, [stage])

  useEffect(() => {
    const t = setInterval(() => setSecTick(x => !x), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (stage !== 'reveal') return
    const el = scrollRef.current, bg = bgRef.current
    if (!el || !bg) return
    const h = () => { bg.style.transform = `translateY(${el.scrollTop * .22}px)` }
    el.addEventListener('scroll', h, { passive: true }); return () => el.removeEventListener('scroll', h)
  }, [stage])

  const isOn = (i: number) => !lightsOut && lights >= i
  const go   = () => { setExiting(true); setTimeout(onEnter, 600) }
  const bg   = dark ? '#000' : '#f5f5f5'
  const fg   = dark ? '#fff' : '#000'
  const bd   = dark ? '#1e1e1e' : '#ddd'
  const card = dark ? '#0a0a0a' : '#fff'
  const dim  = dark ? '#444' : '#bbb'
  const sub2 = dark ? '#282828' : '#d0d0d0'

  const calendarMap  = Object.fromEntries(calendar.map(r => [r.round, r]))
  const cd           = useCountdown(raceTargetMs)
  const seasonLabel  = CURRENT?.season ?? calendar[0]?.season ?? 2026

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700;800&family=Barlow+Condensed:ital,wght@0,400;0,700;0,900;1,700;1,900&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        #BR{position:fixed;inset:0;z-index:9999;background:#000;display:flex;align-items:center;justify-content:center;transition:opacity .6s ease,filter .6s ease}
        #BR.x{opacity:0;filter:blur(16px);pointer-events:none}
        .gantry-outer{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#000}
        .gantry-inner{display:flex;flex-direction:column;align-items:center;position:relative}
        .wire{position:absolute;top:50px;left:50%;transform:translateX(-50%);width:100vw;height:2px;background:linear-gradient(90deg,transparent,#1e1e1e 20%,#1e1e1e 80%,transparent);pointer-events:none}
        .housing{position:relative;z-index:2;width:380px;height:100px;background:#111;background-image:repeating-linear-gradient(90deg,transparent 0,transparent 22px,#0b0b0b 22px,#0b0b0b 23px);border-radius:6px 6px 0 0;display:flex;align-items:center;justify-content:center}
        .f1-logo{font-family:'Barlow Condensed',sans-serif;font-weight:900;font-style:italic;font-size:66px;color:#e10600;letter-spacing:-.05em;line-height:1;text-shadow:0 0 32px rgba(225,6,0,.6);user-select:none}
        .pod-row{position:relative;z-index:2;display:flex;background:#0e0e0e;border-radius:0 0 12px 12px;overflow:hidden}
        .pod{width:76px;padding:13px 0 17px;display:flex;flex-direction:column;align-items:center;gap:10px;background:#111;flex-shrink:0}
        .pod+.pod{border-left:1px solid #090909}
        .lamp{display:block;width:48px;height:48px;min-width:48px;min-height:48px;border-radius:50%;background:#1d1d1d;border:2px solid #0a0a0a;transition:background 450ms ease,box-shadow 450ms ease}
        .lamp.on{background:#ff0000;box-shadow:0 0 10px 3px rgba(255,0,0,.9),0 0 28px 10px rgba(255,0,0,.4),inset 0 1px 6px rgba(255,180,180,.3);transition:background 0ms,box-shadow 0ms}
        .ghost{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;overflow:hidden;pointer-events:none;opacity:0;transition:opacity 1s ease}
        .ghost.on{opacity:1}
        .gr{display:flex;gap:44px;white-space:nowrap;font-family:'Barlow Condensed',sans-serif;font-weight:900;font-style:italic;font-size:clamp(28px,4vw,52px);color:rgba(255,255,255,.07);letter-spacing:-.02em;line-height:1.2;user-select:none}
        .gr.a{animation:mq 28s linear infinite}.gr.b{animation:mq 36s linear infinite reverse}
        @keyframes mq{from{transform:translateX(0)}to{transform:translateX(-50%)}}
        .sc{position:absolute;inset:0;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch}
        .sc::-webkit-scrollbar{width:3px}.sc::-webkit-scrollbar-thumb{background:#e10600;border-radius:2px}
        .hero-shell{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:clamp(32px,5vw,60px) clamp(18px,5vw,60px);position:relative;z-index:1;animation:fadeup .5s cubic-bezier(.16,1,.3,1) both}
        .pass-wrap{width:100%;max-width:900px}
        .sec{position:relative;z-index:1;padding:clamp(32px,5vw,60px) clamp(18px,5vw,60px)}
        .divl{height:1px;margin:0 clamp(18px,5vw,60px)}
        .tb{position:fixed;top:16px;right:16px;z-index:300;width:42px;height:22px;border-radius:11px;border:none;cursor:pointer;display:flex;align-items:center;padding:3px;transition:background .3s}
        .tk{width:16px;height:16px;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,.5);transition:transform .3s cubic-bezier(.16,1,.3,1)}
        .tg{display:grid;grid-template-columns:1fr 210px;position:relative;overflow:hidden}
        .tg::after{content:'';position:absolute;left:calc(100% - 211px);top:0;bottom:0;width:1px;background:repeating-linear-gradient(180deg,rgba(140,140,140,.16) 0,rgba(140,140,140,.16) 5px,transparent 5px,transparent 11px)}
        .sess-g{display:grid;gap:1px}
        .cal-row{display:flex;gap:8px;overflow-x:auto;padding-bottom:5px;-webkit-overflow-scrolling:touch;scrollbar-width:thin;scrollbar-color:#e10600 transparent;align-items:stretch}
        .cal-row::-webkit-scrollbar{height:2px}.cal-row::-webkit-scrollbar-thumb{background:#e10600;border-radius:2px}
        .cc{flex-shrink:0;width:160px;border-width:1px;border-style:solid;transition:border-color .2s,box-shadow .2s,opacity .2s;cursor:pointer;overflow:hidden;display:flex;flex-direction:column}
        .cc:hover{border-color:#e10600!important;box-shadow:0 0 0 1px #e1060018;opacity:1!important}
        .cc-layout{height:96px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
        .cc-body{padding:0 11px 11px;flex:1;display:flex;flex-direction:column}
        .tag{font-family:'JetBrains Mono',monospace;font-size:8px;font-weight:800;letter-spacing:.2em;color:#e10600;text-transform:uppercase;margin-bottom:7px}
        .stitle{font-family:'Barlow Condensed',sans-serif;font-weight:900;font-style:italic;font-size:clamp(26px,3.5vw,46px);line-height:.9;letter-spacing:-.02em;margin-bottom:20px}
        .btn{padding:15px 26px;font-family:'Barlow Condensed',sans-serif;font-weight:900;font-style:italic;font-size:15px;letter-spacing:.2em;text-transform:uppercase;border:none;cursor:pointer;transition:background .15s,color .15s,letter-spacing .18s,transform .1s}
        .btn:hover{letter-spacing:.3em;transform:translateY(-1px)}
        .dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:#e10600;margin-right:5px;vertical-align:middle;animation:blink 1.2s ease-in-out infinite}
        @keyframes blink{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.2;transform:scale(.6)}}
        @keyframes fadeup{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
        .sh{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:6px;animation:bob 2s ease-in-out infinite;pointer-events:none}
        @keyframes bob{0%,100%{transform:translateX(-50%) translateY(0)}50%{transform:translateX(-50%) translateY(6px)}}
        .par{position:sticky;top:0;height:100vh;overflow:hidden;z-index:0;margin-bottom:-100vh;pointer-events:none}
        .par-i{position:absolute;inset:-15%;will-change:transform;display:flex;flex-direction:column;justify-content:center}
        .pr{display:flex;gap:44px;white-space:nowrap;font-family:'Barlow Condensed',sans-serif;font-weight:900;font-style:italic;letter-spacing:-.02em;line-height:1.2;user-select:none}
        @keyframes trackDraw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}
        @media(max-width:680px){.stub-c{display:none!important}.sess-g{grid-template-columns:1fr 1fr!important}.tg{grid-template-columns:1fr!important}}
      `}</style>
      <div id="BR" className={exiting ? 'x' : ''} style={{ background: stage === 'lights' ? '#000' : bg, transition: 'background .4s,opacity .6s,filter .6s' }}>
        {/* ══ LIGHTS ══ */}
        {stage === 'lights' && (
          <div className="gantry-outer">
            <div className={`ghost${lightsOut ? ' on' : ''}`}>
              {Array.from({ length: 14 }).map((_, r) => (
                <div key={r} className={`gr ${r % 2 === 0 ? 'a' : 'b'}`}>
                  {(r % 2 === 0 ? CN : MD).map((n, i) => <span key={i}>{n}</span>)}
                </div>
              ))}
            </div>
            <div className="gantry-inner">
              <div className="wire" />
              <div className="housing"><span className="f1-logo">F1</span></div>
              <div className="pod-row">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="pod">
                    <span className={`lamp${isOn(i) ? ' on' : ''}`} />
                    <span className={`lamp${isOn(i) ? ' on' : ''}`} />
                  </div>
                ))}
              </div>
            </div>
            {lights >= 5 && !ready && (
              <div style={{ position: 'absolute', bottom: 32, fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: '#333', letterSpacing: '.2em', animation: 'blink 1.2s infinite' }}>
                UPLINK CONNECTING
              </div>
            )}
          </div>
        )}
        {/* ══ REVEAL ══ */}
        {stage === 'reveal' && CURRENT && (
          <>
            {/* <button className="tb" style={{ background: dark ? '#282828' : '#ddd' }} onClick={() => setDark(d => !d)}>
              <div className="tk" style={{ transform: dark ? 'none' : 'translateX(20px)', background: dark ? '#fff' : '#111' }} />
            </button> */}
            <div className="sc" ref={scrollRef} style={{ color: fg }}>
              {/* Parallax */}
              <div className="par">
                <div className="par-i" ref={bgRef}>
                  {Array.from({ length: 8 }).map((_, r) => (
                    <div key={r} className="pr" style={{ fontSize: 'clamp(26px,4vw,56px)', color: dark ? 'rgba(255,255,255,.042)' : 'rgba(0,0,0,.038)', animation: `mq ${25 + r * 5}s linear infinite${r % 2 ? ' reverse' : ''}` }}>
                      {(r % 2 === 0 ? CN : MD).map((n, i) => <span key={i}>{n}</span>)}
                    </div>
                  ))}
                </div>
              </div>

              {/* ── HERO PASS ── */}
              <div className="hero-shell">
                <div className="pass-wrap">
                  <div className="tag" style={{ marginBottom: 14 }}><span className="dot" />{CURRENT.label} · {CURRENT.name}</div>
                  <div className="tg" style={{ borderWidth: 1, borderStyle: 'solid', borderColor: bd, background: card }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <div style={{ background: '#e10600', padding: '11px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, fontWeight: 700, letterSpacing: '.14em', opacity: .88 }}>{seasonLabel} FIA FORMULA ONE WORLD CHAMPIONSHIP™</span>
                        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, fontWeight: 800 }}>MEDIA // PADDOCK</span>
                      </div>
                      <div style={{ padding: '20px 20px 0', flex: 1 }}>
                        <div className="tag" style={{ marginBottom: 9 }}>ROUND {CURRENT.round} · {seasonLabel} SEASON</div>
                        <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 'clamp(32px,5vw,58px)', lineHeight: .9, letterSpacing: '-.02em', marginBottom: 16 }}>
                          <span style={{ display: 'block', color: fg }}>{CURRENT.nameA}</span>
                          <span style={{ display: 'block', WebkitTextStroke: `1.5px ${dark ? '#444' : '#aaa'}`, WebkitTextFillColor: 'transparent' }}>{CURRENT.nameB}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 20, paddingTop: 13, borderTopWidth: 1, borderTopStyle: 'solid' as const, borderTopColor: bd, marginBottom: 14, flexWrap: 'wrap' }}>
                          {([['Circuit', CURRENT.circuit], ['Location', CURRENT.city], ['Race (ET)', CURRENT.sessions[CURRENT.sessions.length - 1]?.et ?? '–']] as [string, string][]).map(([l, v]) => (
                            <div key={l}>
                              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, color: dim, letterSpacing: '.12em', marginBottom: 2 }}>{l}</div>
                              <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 14, fontWeight: 700, color: fg }}>{v}</div>
                            </div>
                          ))}
                        </div>
                        <div className="sess-g" style={{ gridTemplateColumns: `repeat(${CURRENT.sessions.length}, 1fr)`, background: dark ? '#060606' : '#f0f0f0', borderWidth: 1, borderStyle: 'solid' as const, borderColor: bd }}>
                          {CURRENT.sessions.map((s, i) => {
                            const past = s.utc.getTime() < Date.now()
                            const next = !past && CURRENT.sessions.slice(0, i).every(x => x.utc.getTime() < Date.now())
                            return (
                              <div key={i} style={{ padding: '9px 10px', borderRightWidth: i < CURRENT.sessions.length - 1 ? 1 : 0, borderRightStyle: 'solid' as const, borderRightColor: bd, background: next ? (dark ? '#110808' : '#fff0f0') : 'transparent' }}>
                                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, fontWeight: 800, letterSpacing: '.14em', color: next ? '#e10600' : past ? sub2 : dim, marginBottom: 3 }}>{s.n}</div>
                                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: past ? sub2 : fg, lineHeight: 1.4 }}>{s.et}</div>
                                {past && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, color: sub2, marginTop: 2 }}>DONE</div>}
                                {next && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, color: '#e10600', marginTop: 2 }}>NEXT ▶</div>}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                      {/* Countdown */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', background: dark ? '#060606' : '#ececec', borderTopWidth: 1, borderTopStyle: 'solid' as const, borderTopColor: bd }}>
                        {([[cd.d, 'DAYS'], [cd.h, 'HRS'], [cd.m, 'MIN'], [cd.s, 'SEC']] as [number, string][]).map(([v, l], i) => (
                          <div key={l} style={{ textAlign: 'center', padding: '13px 0', borderRightWidth: i < 3 ? 1 : 0, borderRightStyle: 'solid' as const, borderRightColor: bd }}>
                            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 'clamp(24px,3vw,38px)', fontWeight: 900, fontStyle: 'italic', lineHeight: 1, letterSpacing: '-.03em', color: l === 'SEC' && secTick ? '#e10600' : fg, transition: 'color .1s' }}>{pad(v)}</div>
                            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, letterSpacing: '.14em', marginTop: 2, color: dim }}>{l}</div>
                          </div>
                        ))}
                      </div>
                      {/* CTA button — made more prominent */}
                      <button
                        className="btn"
                        style={{ width: '100%', background: '#e10600', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 20px', fontSize: 16, animation: 'pulse-btn 2s ease-in-out infinite' }}
                        onClick={go}
                        onMouseEnter={e => (e.currentTarget.style.background = '#ff1a0e')}
                        onMouseLeave={e => (e.currentTarget.style.background = '#e10600')}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className="dot" style={{ marginRight: 0 }} />
                          INITIALIZE UPLINK — ENTER TERMINAL
                        </span>
                        <span style={{ background: '#fff', color: '#e10600', padding: '4px 14px', fontSize: 18, fontWeight: 900 }}>→</span>
                      </button>
                    </div>
                    {/* Stub column */}
                    <div className="stub-c" style={{ background: dark ? '#070707' : '#f8f8f8', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, fontWeight: 800, color: '#e10600', letterSpacing: '.15em' }}>F1 BULLETIN // ACCESS</div>
                      {([
                        ['Credential', 'SEASON PADDOCK'],
                        ['Unit',       'RACE CONTROL'],
                        ['Access',     'LEVEL 1 — FULL'],
                        ['Season',     `${seasonLabel} · 24 ROUNDS`],
                        ['Status',     '● LIVE NOW'],
                      ] as [string, string][]).map(([l, v]) => (
                        <div key={l}>
                          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, color: dim, letterSpacing: '.12em', marginBottom: 2 }}>{l}</div>
                          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 13, fontWeight: 700, color: (v.includes('●') || v.includes('FULL')) ? '#e10600' : fg }}>{v}</div>
                        </div>
                      ))}
                      <div style={{ marginTop: 'auto', height: 40, display: 'flex', alignItems: 'stretch', gap: 1.5, opacity: .18 }}>
                        {BARCODE.map((w, i) => <div key={i} style={{ width: w * 1.2, background: i % 2 === 0 ? (dark ? '#fff' : '#000') : 'transparent' }} />)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Scroll hint */}
                <div className="sh" style={{ gap: 6 }}>
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: '#e10600', letterSpacing: '.18em', animation: 'blink 1.5s infinite' }}>↑ CLICK BUTTON ABOVE TO ENTER</div>
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: dim, letterSpacing: '.14em' }}>OR SCROLL TO EXPLORE</div>
                  <div style={{ fontSize: 11, color: dim }}>↓</div>
                </div>
              </div>

              <div className="divl" style={{ background: bd }} />

              {/* ── CALENDAR ── */}
              <div className="sec">
                <Reveal>
                  <div className="tag">{seasonLabel} CALENDAR — 24 ROUNDS · RACE TIMES IN ET</div>
                  <div className="stitle" style={{ color: fg, marginBottom: 24 }}>{seasonLabel}<br /><span style={{ WebkitTextStroke: `1px ${dark ? '#333' : '#ccc'}`, WebkitTextFillColor: 'transparent' }}>SCHEDULE</span></div>
                  {[
                    { label: 'Q1 — MAR / APR', rounds: ALL_CIRCUITS.slice(0, 5) },
                    { label: 'Q2 — MAY / JUN', rounds: ALL_CIRCUITS.slice(5, 10) },
                    { label: 'Q3 — JUL / AUG', rounds: ALL_CIRCUITS.slice(10, 14) },
                    { label: 'Q4 — SEP / DEC', rounds: ALL_CIRCUITS.slice(14) },
                  ].map(({ label, rounds }) => (
                    <div key={label} style={{ marginBottom: 26 }}>
                      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, fontWeight: 800, color: dim, letterSpacing: '.18em', marginBottom: 9 }}>{label}</div>
                      <div className="cal-row">
                        {rounds.map((c, i) => {
                          const rdNum     = parseInt(c.rd)
                          const rd        = calendarMap[rdNum]
                          const isCurrent = c.rd === CURRENT.round
                          return (
                            <CalendarCard
                              key={i} c={c} rd={rd} dark={dark}
                              bd={bd} card={card} dim={dim} fg={fg}
                              isCurrent={isCurrent}
                            />
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </Reveal>
              </div>

              {/* ── FINAL CTA ── */}
              <div className="sec" style={{ paddingBottom: 72 }}>
                <Reveal>
                  <div style={{ background: '#e10600', padding: 'clamp(24px,5vw,56px)', display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, fontWeight: 800, letterSpacing: '.2em', opacity: .7 }}>F1 BULLETIN — INTELLIGENCE TERMINAL</div>
                    <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontStyle: 'italic', fontSize: 'clamp(48px,8vw,100px)', lineHeight: .9, letterSpacing: '-.03em', color: '#fff', whiteSpace: 'nowrap' }}>READY TO UPLINK?</div>
                    <button className="btn" style={{ background: '#fff', color: '#000', alignSelf: 'flex-start' }} onClick={go}>ENTER TERMINAL →</button>
                  </div>
                </Reveal>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}