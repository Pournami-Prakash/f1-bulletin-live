'use client'
import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import Header from '@/components/Header'
import Ticker from '@/components/Ticker'
import Footer from '@/components/Footer'
// ── Types ──────────────────────────────────────────────────────────────────────
type Session  = { id: number; season: number; round: number; gp_name: string; circuit: string; date: string; session_type?: string }
type Result   = { driver_code: string; team: string; grid_position: number; finish_position: number; points: number; status: string; fastest_lap_ms: number | null }
type Lap      = { driver_code: string; lap_number: number; lap_time_ms: number | null; s1_ms: number | null; s2_ms: number | null; s3_ms: number | null; compound: string | null; tyre_life: number | null; is_personal_best: boolean; position: number | null }
type Stint    = { driver_code: string; stint_number: number; compound: string | null; start_lap: number; end_lap: number; lap_count: number }
type ReplayPt = { driver_code: string; frame: number; lap_number: number; x: string; y: string }
type RaceData = { session: Session | null; results: Result[]; laps: Lap[] | null; stints: Stint[] | null; fastestLap: { driver_code: string; fastest_lap_ms: number } | null; lapCounts: { driver_code: string; lap_count: string }[] | null }
type Tab      = 'LAP_PACE' | 'POSITIONS' | 'STRATEGY' | 'SECTORS' | 'REPLAY'
// ── Palette ────────────────────────────────────────────────────────────────────
const TEAM: Record<string, string> = {
  'Red Bull Racing': '#3671C6', 'Mercedes': '#27F4D2', 'Ferrari': '#E8002D',
  'McLaren': '#FF8000', 'Aston Martin': '#229971', 'Alpine': '#FF87BC',
  'Williams': '#64C4FF', 'Racing Bulls': '#6692FF', 'Kick Sauber': '#52E252', 'Haas F1 Team': '#B6BABD',
}
const COMPOUND: Record<string, string> = {
  SOFT: '#E10600', MEDIUM: '#F59E0B', HARD: '#E8E8E8', INTERMEDIATE: '#4ADE80', WET: '#38BDF8',
}
const PAL = ['#E10600','#F59E0B','#38BDF8','#4ADE80','#A78BFA','#FF8000','#27F4D2',
             '#FF87BC','#64C4FF','#6692FF','#B6BABD','#52E252','#3671C6','#E8002D','#229971','#888']
const TABS: { id: Tab; label: string }[] = [
  { id: 'LAP_PACE',  label: 'LAP PACE'  },
  { id: 'POSITIONS', label: 'POSITIONS' },
  { id: 'STRATEGY',  label: 'STRATEGY'  },
  { id: 'SECTORS',   label: 'SECTORS'   },
  { id: 'REPLAY',    label: 'REPLAY'    },
]
// ── Helpers ────────────────────────────────────────────────────────────────────
const tc = (t: string) => TEAM[t] ?? '#555'
function dc(code: string, results: Result[], idx = 0) {
  const r = results.find(x => x.driver_code === code)
  const c = r ? tc(r.team) : null
  return (c && c !== '#555') ? c : PAL[idx % PAL.length]
}
function msToTime(ms: number | null): string {
  if (!ms || ms <= 0) return '—'
  const s = ms / 1000, m = Math.floor(s / 60)
  return m > 0 ? `${m}:${(s % 60).toFixed(3).padStart(6, '0')}` : `${s.toFixed(3)}s`
}
function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toUpperCase()
}
// ── DNF helper ────────────────────────────────────────────────────────────────
// Handles both raw FastF1 strings (+1 Lap, Engine, Accident...)
// AND ETL-normalised strings your DB may store (Lapped, Retired, etc.)
const CLASSIFIED_STATUSES = new Set([
  'Finished', 'Lapped',           // ETL-normalised
  '+1 Lap', '+2 Laps', '+3 Laps', // raw FastF1 lapped
  '+4 Laps', '+5 Laps', '+6 Laps',
])
function isDnfStatus(status: string): boolean {
  if (!status) return false
  if (CLASSIFIED_STATUSES.has(status)) return false
  if (/^\+\d/.test(status)) return false   // any lapped variant
  if (status === 'Did Not Start') return false // DNS shown separately
  return true
}
function getStatusLabel(status: string): string {
  if (!status) return 'UNKNOWN'
  if (CLASSIFIED_STATUSES.has(status) || /^\+\d/.test(status)) return 'FINISHED'
  if (status === 'Did Not Start') return 'DNS'
  if (status === 'Disqualified')  return 'DSQ'
  return 'DNF'
}
// Human-readable retirement reason for the sub-label
function dnfReason(status: string): string {
  const map: Record<string, string> = {
    'Retired': 'RETIRED', 'Accident': 'ACCIDENT', 'Collision': 'COLLISION',
    'Engine': 'ENGINE', 'Gearbox': 'GEARBOX', 'Hydraulics': 'HYDRAULICS',
    'Brakes': 'BRAKES', 'Electrical': 'ELECTRICAL', 'Suspension': 'SUSPENSION',
    'Transmission': 'TRANSMISSION', 'Power Unit': 'POWER UNIT',
    'Turbocharger': 'TURBO', 'Overheating': 'OVERHEATING',
    'Mechanical': 'MECHANICAL', 'Spun off': 'SPUN OFF',
    'Collision damage': 'COLLISION', 'Did Not Finish': 'DNF',
  }
  return map[status] ?? status.toUpperCase().slice(0, 12)
}
// ── Micro atoms ────────────────────────────────────────────────────────────────
const mono = 'var(--font-mono)'
const bebas = 'var(--font-bebas)'
function Label({ children, dim = false }: { children: React.ReactNode; dim?: boolean }) {
  return (
    <div style={{ fontSize: 9, letterSpacing: '.14em', fontFamily: mono, color: dim ? 'rgba(255,255,255,.22)' : 'rgba(255,255,255,.45)', textTransform: 'uppercase' }}>
      {children}
    </div>
  )
}
function Rule({ color = 'rgba(255,255,255,.06)' }: { color?: string }) {
  return <div style={{ height: 1, background: color }} />
}
function Annotation({ x, label, chartW, PL, PR }: { x: number; label: string; chartW: number; PL: number; PR: number }) {
  return (
    <g>
      <line x1={x} x2={x} y1={16} y2={chartW - 24} stroke="rgba(255,255,255,.12)" strokeWidth={1} strokeDasharray="3,3" />
      <text x={x + 4} y={26} fontSize={8} fill="rgba(255,255,255,.35)" fontFamily={mono}>{label}</text>
    </g>
  )
}
// ── Race timeline card ─────────────────────────────────────────────────────────
function RaceCard({ session, active, onClick }: { session: Session; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      flexShrink: 0, width: 110,
      background: active ? 'rgba(225,6,0,.1)' : 'rgba(255,255,255,.02)',
      border: `1px solid ${active ? 'rgba(225,6,0,.45)' : 'rgba(255,255,255,.07)'}`,
      borderRadius: 8, padding: '10px 12px', cursor: 'pointer', textAlign: 'left',
      transition: 'all .15s',
    }}>
      <div style={{ fontSize: 8, letterSpacing: '.12em', color: active ? '#E10600' : 'rgba(255,255,255,.25)', fontFamily: mono, marginBottom: 5 }}>
        R{session.round} · {formatDate(session.date)}
      </div>
      <div style={{ fontFamily: bebas, fontSize: 14, letterSpacing: '.04em', lineHeight: 1.1, color: active ? '#fff' : 'rgba(255,255,255,.55)' }}>
        {session.gp_name.replace(' Grand Prix', '').replace('Grand Prix', '').trim()}
      </div>
      <div style={{ fontSize: 8, color: 'rgba(255,255,255,.2)', fontFamily: mono, marginTop: 4, letterSpacing: '.06em' }}>
        {session.circuit}
      </div>
    </button>
  )
}
// ── Broadcast lower-third ──────────────────────────────────────────────────────
function LowerThird({ driver, position, team, points, color, isFastest }: {
  driver: string; position: number; team: string; points: number; color: string; isFastest?: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, overflow: 'hidden', borderRadius: 4 }}>
      <div style={{
        background: position <= 3
          ? position === 1 ? 'rgba(245,158,11,.9)' : position === 2 ? 'rgba(180,180,180,.7)' : 'rgba(180,100,30,.7)'
          : 'rgba(255,255,255,.08)',
        padding: '4px 9px', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 28,
      }}>
        <span style={{ fontFamily: bebas, fontSize: 16, color: position <= 3 ? '#000' : 'rgba(255,255,255,.4)', lineHeight: 1 }}>
          {position}
        </span>
      </div>
      <div style={{ width: 3, background: color, flexShrink: 0 }} />
      <div style={{ background: 'rgba(0,0,0,.55)', padding: '4px 10px', flex: 1 }}>
        <div style={{ fontFamily: bebas, fontSize: 15, letterSpacing: '.04em', color: '#fff', lineHeight: 1 }}>{driver}</div>
        <div style={{ fontSize: 8, color: 'rgba(255,255,255,.4)', fontFamily: mono, letterSpacing: '.06em' }}>{team}</div>
      </div>
      <div style={{ background: 'rgba(0,0,0,.4)', padding: '4px 8px', display: 'flex', alignItems: 'center' }}>
        <span style={{ fontFamily: mono, fontSize: 10, color: points > 0 ? '#F59E0B' : 'rgba(255,255,255,.2)' }}>
          {points > 0 ? `${points}P` : '—'}
        </span>
      </div>
      {isFastest && (
        <div style={{ background: 'rgba(167,139,250,.2)', padding: '4px 7px', display: 'flex', alignItems: 'center' }}>
          <span style={{ fontSize: 9, color: '#A78BFA' }}>⚡</span>
        </div>
      )}
    </div>
  )
}
// ── Overview section ───────────────────────────────────────────────────────────
function Overview({ data }: { data: RaceData }) {
  const { results, fastestLap, stints } = data
  const svgRef   = useRef<SVGSVGElement>(null)
  const rafRef   = useRef<number>(0)
  const [view, setView]         = useState<'sankey'|'table'>('sankey')
  const [animated, setAnimated] = useState(false)
  const [showAll, setShowAll]   = useState(false)
  const DURATION = 2800
  const stintMap: Record<string, { pits: number; finalCompound: string | null }> = {}
  if (stints) {
    for (const r of results) {
      const ds = stints.filter(s => s.driver_code === r.driver_code).sort((a, b) => a.stint_number - b.stint_number)
      stintMap[r.driver_code] = { pits: Math.max(ds.length - 1, 0), finalCompound: ds[ds.length - 1]?.compound ?? null }
    }
  }
  const getDelta = (r: Result) => {
    const g = r.grid_position ?? 0, f = r.finish_position ?? 0
    return (!g || !f) ? null : g - f
  }
  const winner      = results.find(r => r.finish_position === 1) ?? results[0]
  const flDriver    = fastestLap?.driver_code
  // Use the shared helpers for consistent DNF counting
  const statusCounts = results.reduce((acc, r) => {
    const label = getStatusLabel(r.status)
    acc[label] = (acc[label] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  const winnerColor = dc(winner?.driver_code ?? '', results, 0)
  const visible     = showAll ? results : results.slice(0, 10)
  function flowColor(grid: number, finish: number): string {
    const d = grid - finish
    if (d >= 3)  return '#4ADE80'
    if (d > 0)   return '#86EFAC'
    if (d === 0) return 'rgba(255,255,255,.35)'
    if (d >= -2) return '#FCA5A5'
    return '#E10600'
  }
  function ns(tag: string): SVGElement {
    return document.createElementNS('http://www.w3.org/2000/svg', tag) as SVGElement
  }
  function drawSankey(progress: number) {
    const svg = svgRef.current
    if (!svg) return
    while (svg.firstChild) svg.removeChild(svg.firstChild)
    const W = 720, H = 340, FL = 68, FR = W - 68, TP = 20, BP = 12
    const validResults = results.filter(r => (r.grid_position ?? 0) > 0 && (r.finish_position ?? 0) > 0)
    const N  = validResults.length || results.length
    const RH = (H - TP - BP) / N
    const NH = Math.max(RH * 0.52, 7)
    const ep = Math.min(progress, 1) < 0.5
      ? 2 * Math.min(progress, 1) ** 2
      : -1 + (4 - 2 * Math.min(progress, 1)) * Math.min(progress, 1)
    const gY = (p: number) => TP + (p - 1) * RH + RH / 2
    const fY = (p: number) => TP + (p - 1) * RH + RH / 2
    function addText(x: number, y: number, s: string, anchor: string, op: number, sz: number, fill?: string) {
      const t = ns('text') as SVGTextElement
      t.setAttribute('x', String(x)); t.setAttribute('y', String(y))
      t.setAttribute('text-anchor', anchor)
      t.setAttribute('fill', fill ?? `rgba(255,255,255,${op})`)
      t.setAttribute('font-size', String(sz))
      t.setAttribute('font-family', 'var(--font-mono), Courier New, monospace')
      t.setAttribute('letter-spacing', '1.2')
      t.textContent = s
      svg!.appendChild(t)
    }
    addText(FL, 18, 'QUALIFYING', 'start', .25, 8)
    addText(FR, 18, 'RACE FINISH', 'end', .25, 8)
    ;[FL, FR].forEach(x => {
      const l = ns('line') as SVGLineElement
      l.setAttribute('x1', String(x)); l.setAttribute('y1', String(TP - 4))
      l.setAttribute('x2', String(x)); l.setAttribute('y2', String(H - BP))
      l.setAttribute('stroke', 'rgba(255,255,255,.05)'); l.setAttribute('stroke-width', '1')
      svg.appendChild(l)
    })
    const sorted = [...results].sort((a, b) =>
      Math.abs((a.grid_position ?? 0) - (a.finish_position ?? 0)) -
      Math.abs((b.grid_position ?? 0) - (b.finish_position ?? 0))
    )
    sorted.forEach(r => {
      const grid = r.grid_position ?? 0, finish = r.finish_position ?? 0
      if (!grid || !finish) return
      const startY = gY(grid), endY = fY(finish)
      const col    = flowColor(grid, finish)
      const delta  = grid - finish
      const thick  = Math.max(NH * 0.5, 6)
      const stagger = (grid - 1) * 0.016
      const fp     = Math.min(Math.max((ep * 1.25 - stagger), 0), 1)
      if (fp <= 0) return
      const cp1x = FL + (FR - FL) * 0.38, cp2x = FL + (FR - FL) * 0.62
      const endX  = FL + (FR - FL) * fp
      const interpY = (y1: number, y2: number, t: number) =>
        (1-t)**3*y1 + 3*(1-t)**2*t*y1 + 3*(1-t)*t**2*y2 + t**3*y2
      const midY = interpY(startY, endY, fp)
      const ribbon = ns('path') as SVGPathElement
      const topD   = `M ${FL} ${startY - thick/2} C ${cp1x} ${startY - thick/2} ${cp2x} ${endY - thick/2} ${endX} ${midY - thick/2}`
      const botD   = fp >= 1
        ? `L ${FR} ${endY + thick/2} C ${cp2x} ${endY + thick/2} ${cp1x} ${startY + thick/2} ${FL} ${startY + thick/2} Z`
        : `L ${endX} ${midY + thick/2} L ${FL} ${startY + thick/2} Z`
      ribbon.setAttribute('d', topD + botD)
      ribbon.setAttribute('fill', col)
      ribbon.setAttribute('opacity', String(Math.abs(delta) > 3 ? 0.42 : 0.25))
      svg.appendChild(ribbon)
      const spine = ns('path') as SVGPathElement
      spine.setAttribute('d', `M ${FL} ${startY} C ${cp1x} ${startY} ${cp2x} ${endY} ${endX} ${midY}`)
      spine.setAttribute('fill', 'none'); spine.setAttribute('stroke', col)
      spine.setAttribute('stroke-width', String(Math.abs(delta) > 5 ? 2 : 1.2)); spine.setAttribute('opacity', '0.85')
      svg.appendChild(spine)
      if (fp > 0.04 && fp < 0.97) {
        const t  = fp
        const bx = (1-t)**3*FL + 3*(1-t)**2*t*cp1x + 3*(1-t)*t**2*cp2x + t**3*FR
        const by = (1-t)**3*startY + 3*(1-t)**2*t*startY + 3*(1-t)*t**2*endY + t**3*endY
        const dot = ns('circle') as SVGCircleElement
        dot.setAttribute('cx', String(bx)); dot.setAttribute('cy', String(by)); dot.setAttribute('r', '3')
        dot.setAttribute('fill', dc(r.driver_code, results, results.indexOf(r))); dot.setAttribute('opacity', '0.95')
        svg.appendChild(dot)
      }
    })
    results.forEach(r => {
      const grid = r.grid_position ?? 0
      if (!grid) return
      const y = gY(grid), color = dc(r.driver_code, results, results.indexOf(r))
      const rect = ns('rect') as SVGRectElement
      rect.setAttribute('x', String(FL - 7)); rect.setAttribute('y', String(y - NH/2))
      rect.setAttribute('width', '7'); rect.setAttribute('height', String(NH))
      rect.setAttribute('fill', color); rect.setAttribute('rx', '1')
      svg.appendChild(rect)
      addText(FL - 10, y + 4, r.driver_code, 'end', 0.72, 9)
      addText(2, y + 4, `P${grid}`, 'start', 0.2, 8)
    })
    results.forEach(r => {
      const grid = r.grid_position ?? 0, finish = r.finish_position ?? 0
      if (!grid || !finish) return
      const stagger = (grid - 1) * 0.016
      const fp      = Math.min(Math.max((ep * 1.25 - stagger), 0), 1)
      if (fp < 0.92) return
      const nodeOp = (fp - 0.92) / 0.08
      const y = fY(finish), color = dc(r.driver_code, results, results.indexOf(r))
      const delta = grid - finish
      const rect = ns('rect') as SVGRectElement
      rect.setAttribute('x', String(FR)); rect.setAttribute('y', String(y - NH/2))
      rect.setAttribute('width', '7'); rect.setAttribute('height', String(NH))
      rect.setAttribute('fill', color); rect.setAttribute('rx', '1')
      rect.setAttribute('opacity', String(nodeOp))
      svg.appendChild(rect)
      const dcol = delta > 0 ? '#4ADE80' : delta < 0 ? '#E10600' : 'rgba(255,255,255,.3)'
      const ds   = delta > 0 ? `↑${delta}` : delta < 0 ? `↓${Math.abs(delta)}` : '—'
      addText(FR + 10, y + 4, r.driver_code, 'start', 0.75 * nodeOp, 9)
      addText(W - 2, y + 4, ds, 'end', nodeOp, 8, dcol)
    })
    if (ep > 0.88 && winner) {
      const y = fY(winner.finish_position ?? 1)
      const g = ns('rect') as SVGRectElement
      g.setAttribute('x', String(FR - 2)); g.setAttribute('y', String(y - NH * 1.6))
      g.setAttribute('width', '14'); g.setAttribute('height', String(NH * 3.2))
      g.setAttribute('fill', winnerColor); g.setAttribute('rx', '3')
      g.setAttribute('opacity', String(((ep - 0.88) / 0.12) * 0.2))
      svg.insertBefore(g, svg.firstChild)
      if (ep > 0.95) addText(FR + 10, y - NH * 1.2, 'WINNER', 'start', ((ep - 0.95) / 0.05) * 0.45, 8, winnerColor)
    }
  }
  function runAnim() {
    cancelAnimationFrame(rafRef.current)
    setView('sankey')
    const start = performance.now()
    const fallback = setTimeout(() => { setAnimated(true) }, DURATION + 300)
    function frame(now: number) {
      const prog = (now - start) / DURATION
      drawSankey(prog)
      if (prog < 1) { rafRef.current = requestAnimationFrame(frame) }
      else { drawSankey(1); clearTimeout(fallback); setTimeout(() => setAnimated(true), 0) }
    }
    rafRef.current = requestAnimationFrame(frame)
  }
  useEffect(() => {
    const t = setTimeout(runAnim, 120)
    return () => { clearTimeout(t); cancelAnimationFrame(rafRef.current) }
  }, [results])
  return (
    <div>
      <div style={{ display: view === 'sankey' ? 'block' : 'none' }}>
        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid rgba(255,255,255,.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <div style={{ fontFamily: bebas, fontSize: 22, letterSpacing: '.04em', color: winnerColor, lineHeight: 1 }}>
                {winner?.driver_code ?? '—'}
                <span style={{ fontFamily: mono, fontSize: 10, color: 'rgba(255,255,255,.35)', letterSpacing: '.1em', marginLeft: 10, verticalAlign: 'middle' }}>
                  WINS · {winner?.team}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                {[{
                  label: `${statusCounts['FINISHED'] ?? 0} FINISHED`,
                  sub: `DNF ${statusCounts['DNF'] ?? 0} · DNS ${statusCounts['DNS'] ?? 0}${statusCounts['DSQ'] ? ` · DSQ ${statusCounts['DSQ']}` : ''}`,
                  color: '#4ADE80'
                },
                {
                  label: flDriver ?? '—',
                  sub: `FL ${msToTime(fastestLap?.fastest_lap_ms ?? null)}`,
                  color: '#A78BFA'
                }].map(k => (
                  <div key={k.label} style={{ padding: '3px 10px', borderRadius: 3, border: `1px solid ${k.color}30`, background: `${k.color}0a` }}>
                    <span style={{ fontSize: 9, color: k.color, fontFamily: mono, letterSpacing: '.08em' }}>{k.label}</span>
                    <span style={{ fontSize: 8, color: 'rgba(255,255,255,.3)', fontFamily: mono, marginLeft: 6 }}>{k.sub}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <div style={{ display: 'flex', border: '1px solid rgba(255,255,255,.1)', borderRadius: 5, overflow: 'hidden' }}>
                {(['sankey', 'table'] as const).map(v => (
                  <button key={v}
                    onClick={() => { if (v === 'sankey' && view !== 'sankey') { runAnim() } else { setView(v) } }}
                    style={{
                      background: view === v ? 'rgba(225,6,0,.15)' : 'transparent', border: 'none',
                      borderRight: v === 'sankey' ? '1px solid rgba(255,255,255,.1)' : 'none',
                      color: view === v ? '#E10600' : 'rgba(255,255,255,.3)',
                      padding: '5px 12px', cursor: 'pointer', fontFamily: mono, fontSize: 9, letterSpacing: '.1em',
                    }}>
                    {v === 'sankey' ? 'SANKEY' : 'TABLE'}
                  </button>
                ))}
              </div>
              {view === 'sankey' && (
                <button onClick={runAnim} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.1)', borderRadius: 4, color: 'rgba(255,255,255,.35)', padding: '5px 10px', cursor: 'pointer', fontFamily: mono, fontSize: 9 }}>↺</button>
              )}
            </div>
          </div>
          <svg ref={svgRef} viewBox="0 0 720 340" style={{ width: '100%', display: 'block', minHeight: 140 }} />
          <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
            {[
              { color: '#4ADE80', label: 'GAINED 3+' }, { color: '#86EFAC', label: 'GAINED 1–2' },
              { color: 'rgba(255,255,255,.35)', label: 'NO CHANGE' }, { color: '#FCA5A5', label: 'LOST 1–2' },
              { color: '#E10600', label: 'LOST 3+' },
            ].map(l => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: l.color, flexShrink: 0 }} />
                <span style={{ fontSize: 8, color: 'rgba(255,255,255,.3)', fontFamily: mono, letterSpacing: '.1em' }}>{l.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ display: view === 'table' ? 'block' : 'none' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 1 }}>
          {[
            { label: 'RACE WINNER',   value: winner?.driver_code ?? '—',      sub: winner?.team ?? '',                          color: winnerColor },
            { label: 'FASTEST LAP',   value: flDriver ?? '—',                  sub: msToTime(fastestLap?.fastest_lap_ms ?? null), color: '#A78BFA'  },
            {
              label: 'RACE STATUS',
              value: `${statusCounts['FINISHED'] ?? 0}`,
              sub: `DNF ${statusCounts['DNF'] ?? 0} · DNS ${statusCounts['DNS'] ?? 0}${statusCounts['DSQ'] ? ` · DSQ ${statusCounts['DSQ']}` : ''}`,
              color: '#4ADE80'
            },
            { label: 'POINTS LEADER', value: results[0]?.driver_code ?? '—',  sub: `${results[0]?.points ?? 0} pts`,            color: '#F59E0B'  },
          ].map(k => (
            <div key={k.label} style={{ padding: '12px 16px', background: 'rgba(0,0,0,.3)', borderBottom: `2px solid ${k.color}30` }}>
              <div style={{ fontSize: 8, letterSpacing: '.14em', color: 'rgba(255,255,255,.28)', fontFamily: mono, marginBottom: 4 }}>{k.label}</div>
              <div style={{ fontFamily: bebas, fontSize: 24, color: k.color, lineHeight: 1, letterSpacing: '.02em' }}>{k.value}</div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,.28)', fontFamily: mono, marginTop: 2 }}>{k.sub}</div>
            </div>
          ))}
        </div>
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '32px 44px 110px 1fr 40px 48px 40px', padding: '5px 14px', borderBottom: '1px solid rgba(255,255,255,.05)', background: 'rgba(0,0,0,.4)' }}>
            {['POS','GRD','DRIVER','TEAM','PTS','TYRES','PITS'].map(h => (
              <div key={h} style={{ fontSize: 8, letterSpacing: '.12em', color: 'rgba(255,255,255,.2)', fontFamily: mono }}>{h}</div>
            ))}
          </div>
          {visible.map((r, i) => {
            const color    = dc(r.driver_code, results, i)
            const pos      = r.finish_position ?? i + 1
            const isTop3   = pos <= 3
            // Fixed: lapped cars are NOT DNFs
            const isDnf    = isDnfStatus(r.status)
            const isFl     = flDriver === r.driver_code
            const d        = getDelta(r)
            const si       = stintMap[r.driver_code]
            const posColor = pos === 1 ? '#F59E0B' : pos === 2 ? '#C0C0C0' : pos === 3 ? '#CD7F32' : 'rgba(255,255,255,.28)'
            return (
              <div key={r.driver_code} style={{
                display: 'grid', gridTemplateColumns: '32px 44px 110px 1fr 40px 48px 40px',
                padding: '7px 14px', alignItems: 'center',
                borderBottom: '1px solid rgba(255,255,255,.03)',
                background: isDnf ? 'rgba(225,6,0,.04)' : isTop3 ? `${color}07` : i % 2 === 0 ? 'rgba(255,255,255,.01)' : 'transparent',
                borderLeft: isTop3 ? `2px solid ${color}55` : '2px solid transparent',
              }}>
                <div style={{ fontFamily: bebas, fontSize: isTop3 ? 17 : 13, color: posColor, lineHeight: 1 }}>{pos}</div>
                <div>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,.25)', fontFamily: mono }}>{r.grid_position ?? '—'}</div>
                  {d !== null && d !== 0 && (
                    <div style={{ fontSize: 7, color: d > 0 ? '#4ADE80' : '#E10600', fontFamily: mono }}>{d > 0 ? `↑${d}` : `↓${Math.abs(d)}`}</div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                  <div style={{ width: 2, height: 13, borderRadius: 1, background: color, flexShrink: 0 }} />
                  <span style={{ fontFamily: bebas, fontSize: 13, letterSpacing: '.04em', color: isDnf ? 'rgba(255,255,255,.4)' : '#fff', lineHeight: 1, whiteSpace: 'nowrap' }}>
                    {r.driver_code}{isFl ? ' ⚡' : ''}
                  </span>
                </div>
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,.3)', fontFamily: mono, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.team}</span>
                <div>
                  <span style={{ fontSize: 10, color: r.points > 0 ? '#F59E0B' : isDnf ? '#E10600' : 'rgba(255,255,255,.18)', fontFamily: mono }}>
                    {r.points > 0 ? r.points : isDnf ? 'DNF' : '—'}
                  </span>
                  {isDnf && r.status && (
                    <div style={{ fontSize: 7, color: 'rgba(255,255,255,.28)', fontFamily: mono, marginTop: 1 }} title={r.status}>
                      {dnfReason(r.status)}
                    </div>
                  )}
                </div>
                <div>
                  {si?.finalCompound ? (
                    <div style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:16, height:16, borderRadius:'50%', background: COMPOUND[si.finalCompound] ?? '#333', border: si.finalCompound === 'HARD' ? '1px solid rgba(255,255,255,.3)' : 'none' }}>
                      <span style={{ fontSize:6, color: si.finalCompound==='HARD'?'#000':'rgba(0,0,0,.8)', fontFamily:mono, fontWeight:700 }}>{si.finalCompound.slice(0,1)}</span>
                    </div>
                  ) : <span style={{ color:'rgba(255,255,255,.15)', fontSize:9 }}>—</span>}
                </div>
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,.3)', fontFamily: mono }}>{si !== undefined ? si.pits : '—'}</span>
              </div>
            )
          })}
          {results.length > 10 && (
            <button onClick={() => setShowAll(p => !p)} style={{
              width: '100%', background: 'transparent', border: 'none',
              borderTop: '1px solid rgba(255,255,255,.05)', color: 'rgba(255,255,255,.3)',
              padding: '8px 0', cursor: 'pointer', fontFamily: mono, fontSize: 9, letterSpacing: '.12em',
            }}>
              {showAll ? '↑ SHOW LESS' : `↓ ALL ${results.length} DRIVERS`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
// ── Lap pace chart ─────────────────────────────────────────────────────────────
function TabLapPace({ data, drivers }: { data: RaceData; drivers: string[] }) {
  const { laps, results, stints } = data
  if (!laps?.length) return <Empty />
  const series = useMemo(() => {
    const map: Record<string, { x: number; y: number; compound: string | null }[]> = {}
    for (const l of laps) {
      if (!l.lap_time_ms || l.lap_time_ms > 300000 || l.lap_time_ms < 50000) continue
      if (!drivers.includes(l.driver_code)) continue
      if (!map[l.driver_code]) map[l.driver_code] = []
      map[l.driver_code].push({ x: l.lap_number, y: l.lap_time_ms, compound: l.compound })
    }
    return map
  }, [laps, drivers])
  const active = drivers.filter(d => series[d]?.length)
  if (!active.length) return <Empty msg="SELECT DRIVERS ABOVE" />
  const allMs   = active.flatMap(d => series[d].map(p => p.y))
  const minMs   = Math.min(...allMs)
  const cap     = minMs * 1.07
  const clipped = Object.fromEntries(active.map(d => [d, series[d].filter(p => p.y <= cap)]))
  const W = 780, H = 260, PL = 64, PR = 24, PT = 16, PB = 28
  const allX = active.flatMap(d => clipped[d].map(p => p.x))
  const allY = active.flatMap(d => clipped[d].map(p => p.y))
  const [mnX, mxX] = [Math.min(...allX), Math.max(...allX)]
  const [mnY, mxY] = [Math.min(...allY), Math.max(...allY)]
  const sx = (x: number) => PL + ((x - mnX) / Math.max(mxX - mnX, 1)) * (W - PL - PR)
  const sy = (y: number) => PT + ((y - mnY) / Math.max(mxY - mnY, 1)) * (H - PT - PB)
  const firstStints = stints?.filter(s => s.driver_code === active[0]) ?? []
  const pitLaps     = firstStints.slice(0, -1).map(s => s.end_lap)
  const anomalies: { lap: number; label: string }[] = []
  if (active[0] && series[active[0]]) {
    const pts = series[active[0]]
    for (let i = 1; i < pts.length; i++) {
      const delta = pts[i].y - pts[i - 1].y
      if (delta > 15000 && pts[i].y <= cap) anomalies.push({ lap: pts[i].x, label: 'SC?' })
    }
  }
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ padding: '14px 18px 0' }}>
        <div style={{ fontFamily: bebas, fontSize: 18, letterSpacing: '.06em', color: 'rgba(255,255,255,.7)', marginBottom: 4 }}>LAP TIME EVOLUTION</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,.35)', fontFamily: mono, maxWidth: 560 }}>Each dot = personal best. Shaded bands = tyre compound stint. Dashed lines = pit stops.</div>
      </div>
      <div style={{ padding: '0 18px', overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 500, display: 'block' }}>
          {firstStints.map((st, i) => {
            const col = COMPOUND[st.compound ?? ''] ?? '#444'
            const x1  = sx(st.start_lap), x2 = sx(st.end_lap)
            return <rect key={i} x={x1} y={PT} width={Math.max(x2 - x1, 0)} height={H - PT - PB} fill={col} opacity={.04} />
          })}
          {[0, .25, .5, .75, 1].map(t => {
            const v = mnY + t * (mxY - mnY), y = sy(v)
            return (
              <g key={t}>
                <line x1={PL} x2={W - PR} y1={y} y2={y} stroke="rgba(255,255,255,.04)" strokeWidth={1} />
                <text x={PL - 6} y={y + 4} fontSize={9} fill="rgba(255,255,255,.22)" textAnchor="end" fontFamily={mono}>{msToTime(v)}</text>
              </g>
            )
          })}
          {[0, .25, .5, .75, 1].map((t, i) => (
            <text key={i} x={sx(mnX + t * (mxX - mnX))} y={H - 6} fontSize={9} fill="rgba(255,255,255,.2)" textAnchor="middle" fontFamily={mono}>
              L{Math.round(mnX + t * (mxX - mnX))}
            </text>
          ))}
          {pitLaps.map(lap => (
            <line key={lap} x1={sx(lap)} x2={sx(lap)} y1={PT} y2={H - PB} stroke="rgba(255,255,255,.2)" strokeWidth={1} strokeDasharray="3,4" />
          ))}
          {anomalies.map(a => (
            <g key={a.lap}>
              <line x1={sx(a.lap)} x2={sx(a.lap)} y1={PT} y2={H - PB} stroke="rgba(245,158,11,.35)" strokeWidth={1} />
              <text x={sx(a.lap) + 4} y={PT + 12} fontSize={8} fill="rgba(245,158,11,.6)" fontFamily={mono}>{a.label}</text>
            </g>
          ))}
          {active.map((code, i) => {
            const pts   = clipped[code]
            const color = dc(code, results, i)
            const d     = pts.map((p, j) => `${j === 0 ? 'M' : 'L'} ${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(' ')
            return (
              <g key={code}>
                <path d={d} fill="none" stroke={color} strokeWidth={2} opacity={.85} />
                {laps?.filter(l => l.driver_code === code && l.is_personal_best && l.lap_time_ms && l.lap_time_ms <= cap)
                  .map(l => (
                    <circle key={l.lap_number} cx={sx(l.lap_number)} cy={sy(l.lap_time_ms!)} r={3} fill={color} stroke="rgba(0,0,0,.6)" strokeWidth={1} />
                  ))}
                {pts.length > 0 && (
                  <text x={sx(pts[pts.length - 1].x) + 5} y={sy(pts[pts.length - 1].y) + 4} fontSize={9} fill={color} fontFamily={mono} opacity={.9}>{code}</text>
                )}
              </g>
            )
          })}
        </svg>
      </div>
      <div style={{ padding: '0 18px 18px' }}>
        <Rule />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8, paddingTop: 12 }}>
          {active.map((code, i) => {
            const pts   = clipped[code] ?? []
            const best  = Math.min(...pts.map(p => p.y))
            const l5    = pts.slice(-5)
            const l5avg = l5.reduce((a, b) => a + b.y, 0) / Math.max(l5.length, 1)
            const trend = l5.length >= 2 ? l5[l5.length - 1].y - l5[0].y : 0
            const color = dc(code, results, i)
            return (
              <div key={code} style={{ border: `1px solid ${color}22`, borderLeft: `3px solid ${color}`, borderRadius: 4, padding: '10px 12px', background: `${color}06` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontFamily: bebas, fontSize: 16, color, letterSpacing: '.04em' }}>{code}</span>
                  <span style={{ fontSize: 9, color: trend < 0 ? '#4ADE80' : trend > 0 ? '#E10600' : 'rgba(255,255,255,.3)', fontFamily: mono }}>
                    {trend < 0 ? '↗' : trend > 0 ? '↘' : '→'}
                  </span>
                </div>
                <Label dim>BEST</Label>
                <div style={{ fontFamily: mono, fontSize: 12, color: 'rgba(255,255,255,.8)', marginBottom: 6 }}>{msToTime(best)}</div>
                <Label dim>LAST 5 AVG</Label>
                <div style={{ fontFamily: mono, fontSize: 11, color: 'rgba(255,255,255,.45)' }}>{msToTime(Math.round(l5avg))}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
// ── Positions tab ──────────────────────────────────────────────────────────────
function TabPositions({ data, drivers }: { data: RaceData; drivers: string[] }) {
  const { laps, results } = data
  if (!laps?.length) return <Empty />
  const series: Record<string, { x: number; y: number }[]> = {}
  for (const l of laps) {
    if (!l.position || !drivers.includes(l.driver_code)) continue
    if (!series[l.driver_code]) series[l.driver_code] = []
    series[l.driver_code].push({ x: l.lap_number, y: l.position })
  }
  const active = drivers.filter(d => series[d]?.length)
  if (!active.length) return <Empty msg="SELECT DRIVERS ABOVE" />
  const W = 780, H = 280, PL = 32, PR = 60, PT = 16, PB = 24
  const allPos = active.flatMap(d => series[d].map(p => p.y))
  const maxLap = Math.max(...active.flatMap(d => series[d].map(p => p.x)))
  const minPos = Math.max(1, Math.min(...allPos) - 1)
  const maxPos = Math.min(20, Math.max(...allPos) + 1)
  const sx = (lap: number) => PL + ((lap - 1) / Math.max(maxLap - 1, 1)) * (W - PL - PR)
  const sy = (pos: number) => PT + ((pos - minPos) / Math.max(maxPos - minPos, 1)) * (H - PT - PB)
  const overtakes: { lap: number; driver: string; from: number; to: number }[] = []
  for (const code of active) {
    const pts = series[code]
    for (let i = 1; i < pts.length; i++) {
      if (pts[i].y < pts[i - 1].y) overtakes.push({ lap: pts[i].x, driver: code, from: pts[i - 1].y, to: pts[i].y })
    }
  }
  return (
    <div style={{ display: 'grid', gap: 0 }}>
      <div style={{ padding: '14px 18px 0' }}>
        <div style={{ fontFamily: bebas, fontSize: 18, letterSpacing: '.06em', color: 'rgba(255,255,255,.7)', marginBottom: 4 }}>POSITION CHANGES</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,.35)', fontFamily: mono }}>Dashed verticals mark overtakes. Final position labelled at race end.</div>
      </div>
      <div style={{ padding: '12px 18px' }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block', minHeight: 320 }}>
          {[1, 5, 10, 15, 20].filter(p => p >= minPos && p <= maxPos).map(pos => (
            <g key={pos}>
              <line x1={PL} x2={W - PR} y1={sy(pos)} y2={sy(pos)} stroke="rgba(255,255,255,.04)" strokeWidth={1} />
              <text x={PL - 4} y={sy(pos) + 4} fontSize={9} fill="rgba(255,255,255,.2)" textAnchor="end" fontFamily={mono}>P{pos}</text>
            </g>
          ))}
          {[1, .25, .5, .75, 1].map((t, i) => (
            <text key={i} x={sx(Math.round(t * maxLap) || 1)} y={H - 6} fontSize={9} fill="rgba(255,255,255,.2)" textAnchor="middle" fontFamily={mono}>
              L{Math.round(t * maxLap) || 1}
            </text>
          ))}
          {overtakes.slice(0, 20).map((ov, i) => (
            <line key={i} x1={sx(ov.lap)} x2={sx(ov.lap)} y1={PT} y2={H - PB} stroke="rgba(225,6,0,.15)" strokeWidth={1} strokeDasharray="2,3" />
          ))}
          {active.map((code, i) => {
            const pts   = series[code]
            const color = dc(code, results, i)
            const d     = pts.map((p, j) => `${j === 0 ? 'M' : 'L'} ${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(' ')
            const last  = pts[pts.length - 1]
            return (
              <g key={code}>
                <path d={d} fill="none" stroke={color} strokeWidth={2} opacity={.85} />
                {last && <>
                  <circle cx={sx(last.x)} cy={sy(last.y)} r={4} fill={color} />
                  <text x={sx(last.x) + 8} y={sy(last.y) + 4} fontSize={9} fill={color} fontFamily={mono}>{code}</text>
                </>}
              </g>
            )
          })}
        </svg>
      </div>
      {overtakes.length > 0 && (
        <div style={{ padding: '0 18px 18px' }}>
          <Rule />
          <div style={{ paddingTop: 10 }}>
            <Label dim>OVERTAKES DETECTED — {overtakes.length}</Label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
              {overtakes.slice(0, 12).map((ov, i) => {
                const color = dc(ov.driver, results, active.indexOf(ov.driver))
                return (
                  <div key={i} style={{ fontSize: 9, fontFamily: mono, letterSpacing: '.06em', padding: '3px 8px', borderRadius: 3, border: `1px solid ${color}35`, background: `${color}0c`, color: 'rgba(255,255,255,.6)' }}>
                    <span style={{ color }}>{ov.driver}</span> P{ov.from}→P{ov.to} <span style={{ color: 'rgba(255,255,255,.3)' }}>L{ov.lap}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
// ── Strategy tab ───────────────────────────────────────────────────────────────
function TabStrategy({ data, drivers }: { data: RaceData; drivers: string[] }) {
  const { stints, results } = data
  if (!stints?.length) return <Empty />
  const active = drivers.length ? drivers : results.slice(0, 14).map(r => r.driver_code)
  const maxLap = Math.max(...stints.map(s => s.end_lap))
  const LABEL  = 52, ROW = 28
  const pitLaps: Record<string, number[]> = {}
  for (const d of active) {
    const ds = stints.filter(s => s.driver_code === d).sort((a, b) => a.stint_number - b.stint_number)
    pitLaps[d] = ds.slice(0, -1).map(s => s.end_lap)
  }
  return (
    <div style={{ display: 'grid', gap: 0 }}>
      <div style={{ padding: '14px 18px 12px' }}>
        <div style={{ fontFamily: bebas, fontSize: 18, letterSpacing: '.06em', color: 'rgba(255,255,255,.7)', marginBottom: 4 }}>TYRE STRATEGY</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,.35)', fontFamily: mono }}>White verticals = pit stops. Letter = compound. Width = stint length.</div>
      </div>
      <Rule />
      <div style={{ padding: '12px 18px' }}>
        <div style={{ marginLeft: LABEL, position: 'relative', height: 16, marginBottom: 4 }}>
          {[0, .2, .4, .6, .8, 1].map(t => (
            <div key={t} style={{ position: 'absolute', left: `${t * 100}%`, transform: 'translateX(-50%)', fontSize: 8, color: 'rgba(255,255,255,.2)', fontFamily: mono }}>
              {Math.round(t * maxLap)}
            </div>
          ))}
        </div>
        {active.map((driver, di) => {
          const ds     = stints.filter(s => s.driver_code === driver)
          const dcolor = dc(driver, results, di)
          const fpos   = results.find(r => r.driver_code === driver)?.finish_position
          return (
            <div key={driver} style={{ display: 'flex', alignItems: 'center', height: ROW, marginBottom: 3 }}>
              <div style={{ width: LABEL, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
                {fpos && fpos <= 3 && <div style={{ width: 2, height: 14, borderRadius: 1, background: dcolor }} />}
                <span style={{ fontSize: 10, color: dcolor, fontFamily: mono, letterSpacing: '.04em' }}>{driver}</span>
              </div>
              <div style={{ flex: 1, position: 'relative', height: 20 }}>
                {ds.map(s => {
                  const left  = ((s.start_lap - 1) / maxLap) * 100
                  const width = (s.lap_count / maxLap) * 100
                  const col   = COMPOUND[s.compound ?? ''] ?? '#333'
                  return (
                    <div key={s.stint_number} title={`${s.compound} · L${s.start_lap}–${s.end_lap} (${s.lap_count} laps)`}
                      style={{ position: 'absolute', left: `${left}%`, width: `calc(${width}% - 1px)`, height: '100%', background: col, borderRadius: 2, opacity: .9, border: s.compound === 'HARD' ? '1px solid rgba(255,255,255,.15)' : 'none', display: 'flex', alignItems: 'center', paddingLeft: 3, overflow: 'hidden' }}>
                      {s.lap_count >= 5 && (
                        <span style={{ fontSize: 7, color: s.compound === 'HARD' ? '#000' : 'rgba(0,0,0,.75)', fontFamily: mono, fontWeight: 600 }}>
                          {s.compound?.slice(0, 1)}
                        </span>
                      )}
                    </div>
                  )
                })}
                {(pitLaps[driver] ?? []).map(lap => (
                  <div key={lap} style={{ position: 'absolute', left: `${(lap / maxLap) * 100}%`, top: -4, bottom: -4, width: 2, background: 'rgba(255,255,255,.45)', borderRadius: 1 }} />
                ))}
              </div>
              <div style={{ width: 22, textAlign: 'right', marginLeft: 6, fontSize: 8, color: 'rgba(255,255,255,.2)', fontFamily: mono }}>{ds.length}S</div>
            </div>
          )
        })}
      </div>
      <div style={{ padding: '8px 18px 16px' }}>
        <Rule />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, paddingTop: 10 }}>
          {Object.entries(COMPOUND).map(([c, col]) => (
            <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 14, height: 8, borderRadius: 2, background: col, border: c === 'HARD' ? '1px solid rgba(255,255,255,.2)' : 'none' }} />
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,.35)', fontFamily: mono, letterSpacing: '.08em' }}>{c}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
// ── Sectors tab ────────────────────────────────────────────────────────────────
function TabSectors({ data, drivers }: { data: RaceData; drivers: string[] }) {
  const { laps, results } = data
  if (!laps?.length) return <Empty />
  const active = drivers.length ? drivers : results.slice(0, 8).map(r => r.driver_code)
  const sectors: Record<string, { s1: number | null; s2: number | null; s3: number | null }> = {}
  for (const l of laps) {
    if (!active.includes(l.driver_code)) continue
    if (!sectors[l.driver_code]) sectors[l.driver_code] = { s1: null, s2: null, s3: null }
    const e = sectors[l.driver_code]
    if (l.s1_ms && (!e.s1 || l.s1_ms < e.s1)) e.s1 = l.s1_ms
    if (l.s2_ms && (!e.s2 || l.s2_ms < e.s2)) e.s2 = l.s2_ms
    if (l.s3_ms && (!e.s3 || l.s3_ms < e.s3)) e.s3 = l.s3_ms
  }
  const valid  = active.filter(d => sectors[d])
  if (!valid.length) return <Empty msg="SELECT DRIVERS ABOVE" />
  const best1 = Math.min(...valid.map(d => sectors[d].s1 ?? Infinity))
  const best2 = Math.min(...valid.map(d => sectors[d].s2 ?? Infinity))
  const best3 = Math.min(...valid.map(d => sectors[d].s3 ?? Infinity))
  const owner = (best: number, k: 's1' | 's2' | 's3') => valid.find(d => sectors[d][k] === best)
  const o1 = owner(best1, 's1'), o2 = owner(best2, 's2'), o3 = owner(best3, 's3')
  return (
    <div style={{ display: 'grid', gap: 0 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>
        {[
          { label: 'SECTOR 1', owner: o1, best: best1 },
          { label: 'SECTOR 2', owner: o2, best: best2 },
          { label: 'SECTOR 3', owner: o3, best: best3 },
        ].map(sec => {
          const idx   = sec.owner ? valid.indexOf(sec.owner) : 0
          const color = sec.owner ? dc(sec.owner, results, idx) : 'rgba(255,255,255,.2)'
          return (
            <div key={sec.label} style={{ padding: '12px 16px', background: `${color}0a`, borderBottom: `3px solid ${color}50` }}>
              <Label dim>{sec.label}</Label>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 5 }}>
                <div style={{ fontFamily: bebas, fontSize: 24, color, letterSpacing: '.04em', lineHeight: 1 }}>{sec.owner ?? '—'}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', fontFamily: mono }}>{msToTime(sec.best)}</div>
              </div>
            </div>
          )
        })}
      </div>
      <Rule />
      <div style={{ display: 'grid', gridTemplateColumns: '52px 1fr 1fr 1fr 88px', borderBottom: '1px solid rgba(255,255,255,.05)', padding: '5px 14px' }}>
        {['DRV', 'S1', 'S2', 'S3', 'TOTAL'].map(h => <div key={h} style={{ fontSize: 8, letterSpacing: '.12em', color: 'rgba(255,255,255,.2)', fontFamily: mono }}>{h}</div>)}
      </div>
      {valid.map((code, i) => {
        const s     = sectors[code]
        const color = dc(code, results, i)
        const total = (s.s1 ?? 0) + (s.s2 ?? 0) + (s.s3 ?? 0)
        const Cell = ({ val, best }: { val: number | null; best: number }) => {
          if (!val) return <span style={{ color: 'rgba(255,255,255,.2)', fontFamily: mono, fontSize: 11 }}>—</span>
          const isOwner = val === best, delta = val - best
          return (
            <div>
              <div style={{ fontSize: 11, color: isOwner ? '#A78BFA' : 'rgba(255,255,255,.7)', fontFamily: mono }}>{isOwner ? '⚡ ' : ''}{msToTime(val)}</div>
              {delta > 0 && <div style={{ fontSize: 9, color: '#E10600', fontFamily: mono }}>+{msToTime(delta)}</div>}
            </div>
          )
        }
        return (
          <div key={code} style={{ display: 'grid', gridTemplateColumns: '52px 1fr 1fr 1fr 88px', padding: '8px 14px', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,.03)', background: i % 2 === 0 ? 'rgba(255,255,255,.01)' : 'transparent' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 2, height: 12, borderRadius: 1, background: color }} />
              <span style={{ fontSize: 11, color, fontFamily: mono }}>{code}</span>
            </div>
            <Cell val={s.s1} best={best1} />
            <Cell val={s.s2} best={best2} />
            <Cell val={s.s3} best={best3} />
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', fontFamily: mono }}>{total ? msToTime(total) : '—'}</span>
          </div>
        )
      })}
    </div>
  )
}
// ── Replay tab ─────────────────────────────────────────────────────────────────
function TabReplay({ sessionId, results }: { sessionId: number; results: Result[] }) {
  type FramePt = { driver: string; x: number; y: number }
  type FrameMap = Map<number, Map<number, FramePt[]>>

  const [frameMap, setFrameMap]   = useState<FrameMap>(new Map())
  const [trackPts, setTrackPts]   = useState<{x:number;y:number}[]>([])
  const [bounds, setBounds]       = useState({ minX:0, maxX:1, minY:0, maxY:1 })
  const [driverColors, setDriverColors] = useState<Record<string,string>>({})
  const [driverList, setDriverList]     = useState<string[]>([])
  const [totalLaps, setTotalLaps] = useState(1)
  const [loaded, setLoaded]       = useState(false)
  const [lap, setLap]     = useState(1)
  const [frame, setFrame] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed]     = useState(1)
  const [selectedDriver, setSelectedDriver] = useState<string|null>(null)
  const [lapEvents, setLapEvents] = useState<{lap:number; events:string[]}[]>([])

  const rafRef  = useRef<number>(0)
  const lastRef = useRef<number>(0)
  const eventsRef = useRef<HTMLDivElement>(null)
  const W = 420, H = 420, PAD = 32
  const SPEEDS = [0.5, 1, 2, 4]
  const FRAMES_PER_LAP = 64
  const MS_PER_TICK = 180

  useEffect(() => {
    const cols: Record<string,string> = {}
    const list: string[] = []
    results.forEach((r,i) => {
      const c = tc(r.team); cols[r.driver_code] = c !== '#555' ? c : PAL[i % PAL.length]
      list.push(r.driver_code)
    })
    setDriverColors(cols); setDriverList(list)
  }, [results])

  useEffect(() => {
    fetch(`/api/racing/replay/${sessionId}`)
      .then(r => r.json())
      .then((data: { outline:{x:number;y:number}[]; frames:any[]; totalLaps:number }) => {
        if (!data.frames?.length) { setLoaded(true); return }
        const xs = data.frames.map((r:any) => parseFloat(r.x))
        const ys = data.frames.map((r:any) => parseFloat(r.y))
        const b  = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
        setBounds(b)
        if (data.outline?.length) setTrackPts(data.outline)
        const map: FrameMap = new Map()
        for (const r of data.frames) {
          const l = r.lap_number, f = r.frame
          if (!map.has(l)) map.set(l, new Map())
          const lm = map.get(l)!
          if (!lm.has(f)) lm.set(f, [])
          const arr = lm.get(f)!
          if (!arr.find(e => e.driver === r.driver_code))
            arr.push({ driver: r.driver_code, x: parseFloat(r.x), y: parseFloat(r.y) })
        }
        setFrameMap(map)
        setTotalLaps(data.totalLaps)
        const drivers = [...new Set(data.frames.map((r:any) => r.driver_code))]
        setDriverList(drivers)
        const cols: Record<string,string> = {}
        drivers.forEach((d:string, i:number) => {
          const res = results.find(r => r.driver_code === d)
          const c = res ? tc(res.team) : '#888'
          cols[d] = c !== '#555' ? c : PAL[i % PAL.length]
        })
        setDriverColors(cols)
        setLoaded(true)
      }).catch(() => setLoaded(true))
  }, [sessionId])

  useEffect(() => {
    if (!results.length) return
    const events: {lap:number; events:string[]}[] = []
    for (let l = 1; l <= totalLaps; l++) {
      const evs: string[] = []
      if (l === 1) evs.push(`Race start — ${results[0]?.driver_code} leads from P${results[0]?.grid_position}`)
      if (l === Math.round(totalLaps * 0.25)) evs.push('Quarter distance')
      if (l === Math.round(totalLaps * 0.5))  evs.push('Half distance')
      if (l === Math.round(totalLaps * 0.75)) evs.push('Three quarter distance')
      if (l === totalLaps) evs.push(`Chequered flag — ${results[0]?.driver_code} wins`)
      if (evs.length) events.push({ lap: l, events: evs })
    }
    setLapEvents(events)
  }, [results, totalLaps])

  useEffect(() => {
    if (!eventsRef.current) return
    const el = eventsRef.current.querySelector(`[data-lap="${lap}"]`) as HTMLElement
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [lap])

  const advance = useCallback(() => {
    setFrame(f => {
      const nf = f + 1
      if (nf >= FRAMES_PER_LAP) {
        setLap(l => { const nl = l+1; if (nl > totalLaps) { setPlaying(false); return l }; return nl })
        return 0
      }
      return nf
    })
  }, [totalLaps])

  useEffect(() => {
    if (!playing) return
    const ms = Math.round(MS_PER_TICK / speed)
    const tick = (now: number) => {
      if (now - lastRef.current >= ms) { lastRef.current = now; advance() }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [playing, speed, advance])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ') { e.preventDefault(); setPlaying(p => !p) }
      if (e.key === 'ArrowRight') advance()
      if (e.key === 'ArrowLeft')  setFrame(f => Math.max(0, f-1))
      if (e.key === 'ArrowUp')    setSpeed(s => SPEEDS[Math.min(SPEEDS.indexOf(s)+1, SPEEDS.length-1)])
      if (e.key === 'ArrowDown')  setSpeed(s => SPEEDS[Math.max(SPEEDS.indexOf(s)-1, 0)])
      if (e.key === 'r' || e.key === 'R') { setLap(1); setFrame(0); setPlaying(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [advance])

  if (!loaded) return <div style={{ padding:'60px 0', textAlign:'center' }}><Label dim>LOADING TELEMETRY…</Label></div>
  if (!frameMap.size) return <div style={{ padding:'40px 18px' }}><Label dim>NO TELEMETRY DATA — RE-RUN ETL WITH --replay-only</Label></div>

  const { minX, maxX, minY, maxY } = bounds
  const sxf = (x:number) => PAD + ((x-minX)/Math.max(maxX-minX,1))*(W-PAD*2)
  const syf = (y:number) => PAD + ((y-minY)/Math.max(maxY-minY,1))*(H-PAD*2)
  const current = frameMap.get(lap)?.get(frame) ?? []
  const lapPct  = Math.round((frame/(FRAMES_PER_LAP-1))*100)
  const racePct = Math.round(((lap-1)*FRAMES_PER_LAP+frame)/(totalLaps*FRAMES_PER_LAP)*100)
  const trail   = Array.from({length:8},(_,i)=>frame-i-1).filter(f=>f>=0)
  const trackPath = trackPts.length
    ? trackPts.map((p,i)=>`${i===0?'M':'L'} ${sxf(p.x).toFixed(1)} ${syf(p.y).toFixed(1)}`).join(' ')+' Z'
    : ''
  const selResult = selectedDriver ? results.find(r=>r.driver_code===selectedDriver) : null
  const selColor  = selectedDriver ? (driverColors[selectedDriver]??'#888') : '#888'
  const posOrder = [...current].sort((a,b) => {
    const ra = results.findIndex(r=>r.driver_code===a.driver)
    const rb = results.findIndex(r=>r.driver_code===b.driver)
    return ra-rb
  })

  return (
    <div>
      <div style={{ padding:'10px 16px', display:'flex', alignItems:'center', gap:10, borderBottom:'1px solid rgba(255,255,255,.06)' }}>
        <div style={{ width:3, height:14, background:'#E10600', borderRadius:2 }} />
        <span style={{ fontFamily:bebas, fontSize:16, letterSpacing:'.06em', color:'rgba(255,255,255,.85)' }}>CIRCUIT REPLAY</span>
        <span style={{ fontSize:8, color:'rgba(255,255,255,.2)', fontFamily:mono }}>{totalLaps} LAPS · {driverList.length} DRIVERS</span>
        <div style={{ marginLeft:'auto', display:'flex', gap:6 }}>
          {[['SPACE','play'],['←→','step'],['↑↓','speed'],['R','reset']].map(([k,v])=>(
            <div key={k} style={{display:'flex',alignItems:'center',gap:3}}>
              <kbd style={{fontSize:7,fontFamily:mono,color:'rgba(255,255,255,.5)',background:'rgba(255,255,255,.06)',padding:'1px 5px',borderRadius:3,border:'1px solid rgba(255,255,255,.1)'}}>{k}</kbd>
              <span style={{fontSize:7,color:'rgba(255,255,255,.18)',fontFamily:mono}}>{v}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1.4fr) minmax(0,1fr)', minHeight:560 }}>
        <div style={{ padding:'16px', borderRight:'1px solid rgba(255,255,255,.06)', display:'flex', flexDirection:'column', gap:10 }}>
          <div style={{ position:'relative', background:'#050708', border:'1px solid rgba(255,255,255,.07)', borderRadius:8, overflow:'hidden', width:'100%', aspectRatio:'1/1', maxHeight:'55vh' }}>
            <div style={{ position:'absolute', top:10, left:10, zIndex:2, background:'rgba(0,0,0,.82)', border:'1px solid rgba(255,255,255,.09)', borderRadius:5, padding:'5px 10px', lineHeight:1 }}>
              <div style={{ fontSize:6, color:'rgba(255,255,255,.3)', fontFamily:mono, letterSpacing:'.1em' }}>LAP</div>
              <div style={{ fontFamily:bebas, fontSize:26, color:'#fff', lineHeight:1.05 }}>
                {lap}<span style={{fontSize:11,color:'rgba(255,255,255,.28)',marginLeft:3}}>/{totalLaps}</span>
              </div>
              <div style={{ height:2, background:'rgba(255,255,255,.06)', borderRadius:1, marginTop:4, overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${racePct}%`, background:'#E10600', borderRadius:1, transition:'width .08s' }} />
              </div>
              <div style={{ fontSize:6, color:'rgba(255,255,255,.2)', fontFamily:mono, marginTop:2 }}>{racePct}% RACE</div>
            </div>
            {speed !== 1 && (
              <div style={{ position:'absolute', top:10, right:10, zIndex:2, background:'rgba(245,158,11,.12)', border:'1px solid rgba(245,158,11,.25)', borderRadius:3, padding:'2px 7px' }}>
                <span style={{ fontSize:9, color:'#F59E0B', fontFamily:mono }}>{speed}×</span>
              </div>
            )}
            {selectedDriver && selResult && (
              <div style={{ position:'absolute', bottom:10, left:10, zIndex:2, background:'rgba(0,0,0,.82)', border:`1px solid ${selColor}28`, borderRadius:4, padding:'5px 9px' }}>
                <div style={{ fontFamily:bebas, fontSize:14, color:selColor, letterSpacing:'.06em', lineHeight:1 }}>{selectedDriver}</div>
                <div style={{ fontSize:6, color:'rgba(255,255,255,.28)', fontFamily:mono, marginTop:2 }}>
                  {isDnfStatus(selResult.status) ? 'DNF' : `P${selResult.finish_position} · ${selResult.points > 0 ? selResult.points+'pts' : '—'}`}
                </div>
              </div>
            )}
            <svg viewBox={`0 0 ${W} ${H}`} style={{ width:'100%', height:'100%', display:'block' }}>
              {trackPath && <>
                <path d={trackPath} fill="none" stroke="rgba(255,255,255,.035)" strokeWidth={22} strokeLinecap="round" strokeLinejoin="round"/>
                <path d={trackPath} fill="none" stroke="rgba(255,255,255,.08)"  strokeWidth={11} strokeLinecap="round" strokeLinejoin="round"/>
                <path d={trackPath} fill="none" stroke="rgba(255,255,255,.22)"  strokeWidth={2}  strokeLinecap="round" strokeLinejoin="round"/>
              </>}
              {driverList.map(driver => trail.map((tf,ti) => {
                const pt = frameMap.get(lap)?.get(tf)?.find(p=>p.driver===driver)
                if (!pt) return null
                return <circle key={`${driver}-${ti}`} cx={sxf(pt.x)} cy={syf(pt.y)} r={2.5} fill={driverColors[driver]??'#888'} opacity={(1-ti/trail.length)*0.2}/>
              }))}
              {current.map(p => {
                const cx=sxf(p.x), cy=syf(p.y), col=driverColors[p.driver]??'#888'
                const isSel=selectedDriver===p.driver
                const posIdx=results.findIndex(r=>r.driver_code===p.driver)
                return (
                  <g key={p.driver} style={{cursor:'pointer'}} onClick={()=>setSelectedDriver(d=>d===p.driver?null:p.driver)}>
                    {isSel && <circle cx={cx} cy={cy} r={11} fill={col} opacity={.12}/>}
                    <circle cx={cx} cy={cy} r={isSel?6:4} fill={col}/>
                    {(isSel||posIdx<3) && <>
                      <rect x={cx-13} y={cy-20} width={26} height={9} rx={2} fill="rgba(0,0,0,.75)"/>
                      <text x={cx} y={cy-13} fontSize={7} fill={col} textAnchor="middle" fontFamily={mono} fontWeight="700">{p.driver}</text>
                    </>}
                  </g>
                )
              })}
            </svg>
          </div>
          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
            <button onClick={()=>{setLap(1);setFrame(0);setPlaying(false)}}
              style={{background:'rgba(255,255,255,.04)',border:'1px solid rgba(255,255,255,.1)',borderRadius:5,color:'rgba(255,255,255,.4)',padding:'6px 10px',cursor:'pointer',fontFamily:mono,fontSize:10}}>⏮</button>
            <button onClick={()=>setPlaying(p=>!p)}
              style={{flex:1,background:playing?'rgba(225,6,0,.1)':'rgba(74,222,128,.07)',border:`1px solid ${playing?'rgba(225,6,0,.28)':'rgba(74,222,128,.18)'}`,borderRadius:5,color:playing?'#E10600':'#4ADE80',padding:'6px 0',cursor:'pointer',fontFamily:mono,fontSize:10,letterSpacing:'.06em'}}>
              {playing?'⏸  PAUSE':'▶  PLAY'}
            </button>
            <button onClick={()=>setSpeed(s=>SPEEDS[(SPEEDS.indexOf(s)+1)%SPEEDS.length])}
              style={{background:'rgba(255,255,255,.04)',border:'1px solid rgba(255,255,255,.1)',borderRadius:5,color:speed!==1?'#F59E0B':'rgba(255,255,255,.35)',padding:'6px 10px',cursor:'pointer',fontFamily:mono,fontSize:10,minWidth:38}}>{speed}×</button>
          </div>
          <div style={{height:6, position:'relative', borderRadius:3, overflow:'hidden', cursor:'pointer'}}>
            <div style={{position:'absolute',inset:0,background:'rgba(255,255,255,.06)'}}/>
            <div style={{position:'absolute',top:0,left:0,bottom:0,width:`${racePct}%`,background:'#E10600'}}/>
            {Array.from({length:totalLaps-1},(_,i)=>(
              <div key={i} style={{position:'absolute',inset:'0',left:`${((i+1)/totalLaps)*100}%`,width:1,background:'rgba(255,255,255,.12)'}}/>
            ))}
            <input type="range" min={0} max={totalLaps*FRAMES_PER_LAP-1}
              value={(lap-1)*FRAMES_PER_LAP+frame}
              onChange={e=>{setPlaying(false);const v=parseInt(e.target.value);setLap(Math.floor(v/FRAMES_PER_LAP)+1);setFrame(v%FRAMES_PER_LAP)}}
              style={{position:'absolute',inset:0,opacity:0,cursor:'pointer',width:'100%',height:'100%',margin:0}}/>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', marginTop:-4 }}>
            <span style={{ fontSize:7, color:'rgba(255,255,255,.15)', fontFamily:mono }}>L1</span>
            <span style={{ fontSize:7, color:'rgba(255,255,255,.28)', fontFamily:mono }}>L{lap} · {lapPct}%</span>
            <span style={{ fontSize:7, color:'rgba(255,255,255,.15)', fontFamily:mono }}>L{totalLaps}</span>
          </div>
          <div style={{ marginTop:4, padding:'10px 12px', border:'1px solid rgba(255,255,255,.06)', borderRadius:6, background:'rgba(255,255,255,.02)' }}>
            <span style={{ fontSize:8, color:'rgba(255,255,255,.2)', fontFamily:'var(--font-mono)', letterSpacing:'.12em' }}>WORK IN PROGRESS</span>
          </div>
        </div>
        <div style={{ display:'flex', flexDirection:'column' }}>
          <div style={{ padding:'10px 16px 6px', borderBottom:'1px solid rgba(255,255,255,.06)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontSize:8, color:'rgba(255,255,255,.3)', fontFamily:mono, letterSpacing:'.14em' }}>RESULT</span>
            <span style={{ fontSize:7, color:'rgba(255,255,255,.15)', fontFamily:mono, letterSpacing:'.08em' }}>CLICK TO TRACK</span>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'28px 4px 1fr 36px 36px', padding:'4px 16px', gap:8, borderBottom:'1px solid rgba(255,255,255,.04)' }}>
            {['P','','DRIVER','PTS','GRD'].map((h,i)=>(
              <div key={i} style={{ fontSize:7, color:'rgba(255,255,255,.18)', fontFamily:mono, letterSpacing:'.08em', textAlign: i>=3 ? 'right' : 'left' }}>{h}</div>
            ))}
          </div>
          <div style={{ flex:1, overflowY:'auto' }}>
            {results.map((r,i)=>{
              const col   = driverColors[r.driver_code]??'#888'
              // Fixed: lapped cars are NOT DNFs
              const isDnf = isDnfStatus(r.status)
              const isSel = selectedDriver===r.driver_code
              const medal = i===0?'#F59E0B':i===1?'#C0C0C0':i===2?'#CD7F32':'rgba(255,255,255,.2)'
              return (
                <div key={r.driver_code} onClick={()=>setSelectedDriver(d=>d===r.driver_code?null:r.driver_code)}
                  style={{ display:'grid', gridTemplateColumns:'28px 4px 1fr 36px 36px', padding:'6px 16px', alignItems:'center', gap:8, cursor:'pointer', borderBottom:'1px solid rgba(255,255,255,.025)', background:isSel?`${col}10`:'transparent', borderLeft:isSel?`2px solid ${col}`:'2px solid transparent', opacity:isDnf?.45:1, transition:'background .1s' }}>
                  <span style={{fontSize:i<3?13:10,fontFamily:bebas,color:medal,lineHeight:1,textAlign:'right'}}>{i+1}</span>
                  <div style={{height:16,background:col,borderRadius:1,opacity:.85}}/>
                  <div>
                    <div style={{fontSize:13,fontFamily:bebas,color:isSel?col:'rgba(255,255,255,.85)',letterSpacing:'.04em',lineHeight:1}}>{r.driver_code}</div>
                    <div style={{fontSize:7,color:'rgba(255,255,255,.25)',fontFamily:mono,marginTop:1}}>{r.team?.split(' ').slice(0,2).join(' ')}</div>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <div style={{fontSize:10,fontFamily:mono,color:r.points>0?'#F59E0B':'rgba(255,255,255,.18)',fontWeight:r.points>0?700:400}}>{r.points||'—'}</div>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <div style={{fontSize:9,fontFamily:mono,color: isDnf?'#E10600':'rgba(255,255,255,.25)'}}>{isDnf?'DNF':`P${r.grid_position}`}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function Empty({ msg = 'NO DATA' }: { msg?: string }) {
  return (
    <div style={{ padding: '48px 0', textAlign: 'center' }}>
      <Label dim>{msg}</Label>
    </div>
  )
}
// ── MAIN PAGE ──────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const [sessions, setSessions]     = useState<Session[]>([])
  const [season, setSeason]         = useState(2026)
  const [selId, setSelId]           = useState<number | null>(null)
  const [activeTab, setActiveTab]   = useState<Tab>('LAP_PACE')
  const [selDrivers, setSelDrivers] = useState<string[]>([])
  const [raceData, setRaceData]     = useState<RaceData | null>(null)
  const [loading, setLoading]       = useState(false)
  const [showOverview, setShowOverview] = useState(false)
  useEffect(() => {
    fetch('/api/racing/sessions').then(r => r.json()).then(setSessions)
  }, [])
  const seasons  = ([...new Set(sessions.map(s => Number(s.season)))] as number[]).sort((a, b) => b - a)
  const filtered = sessions.filter(s => Number(s.season) === season).sort((a, b) => Number(b.round) - Number(a.round))
  const selSess  = filtered.find(s => s.id === selId)
  const tabParam = activeTab === 'STRATEGY' ? 'strategy' : activeTab === 'REPLAY' ? 'overview' : 'laps'
  useEffect(() => {
    if (!selId) return
    setLoading(true)
    fetch(`/api/racing/race/${selId}?tab=${tabParam}`)
      .then(r => r.json())
      .then((d: RaceData) => {
        setRaceData(d)
        setSelDrivers(d.results.slice(0, 5).map(r => r.driver_code))
      })
      .finally(() => setLoading(false))
  }, [selId, tabParam])
  useEffect(() => {
    if (!sessions.length) return
    const latest = sessions
      .filter(s => Number(s.season) === season)
      .sort((a, b) => Number(b.round) - Number(a.round))[0]
    if (latest) setSelId(latest.id)
  }, [sessions, season])
  const allDrivers  = raceData?.results.map(r => r.driver_code) ?? []
  const needDrivers = !['STRATEGY', 'REPLAY'].includes(activeTab)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header />
      <main style={{ width: '100%', maxWidth: 1320, margin: '0 auto', padding: 'calc(var(--header-h) + 36px) 20px 80px', display: 'grid', gap: 24 }}>
      <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ width: 20, height: 1, background: '#E10600' }} />
            <span style={{ fontSize: 9, letterSpacing: '.18em', color: 'rgba(255,255,255,.3)', fontFamily: mono }}>RACE ANALYTICS · FASTF1</span>
          </div>
          <div style={{ fontFamily: bebas, fontSize: 'clamp(44px,6vw,80px)', letterSpacing: '.02em', lineHeight: .92 }}>
            {selSess
              ? <>{selSess.gp_name.replace(' Grand Prix', '').toUpperCase()}{' '}
                  <span style={{ color: '#E10600' }}>GP</span>{' '}
                  <span style={{ color: 'rgba(255,255,255,.25)', fontSize: '.42em', letterSpacing: '.08em', verticalAlign: 'middle' }}>{selSess.season}</span>
                </>
              : <>ANALYTICS <span style={{ color: '#E10600' }}></span></>
            }
          </div>
          {selSess && (
            <div style={{ display: 'flex', gap: 12, marginTop: 6, justifyContent: 'center'  }}>
              {[`ROUND ${selSess.round}`, selSess.circuit.toUpperCase(),
                new Date(selSess.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase()
              ].map((t, i) => (
                <span key={i} style={{ fontSize: 10, color: 'rgba(255,255,255,.3)', fontFamily: mono, letterSpacing: '.08em' }}>{t}</span>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {seasons.map(s => (
              <button key={s} onClick={() => { setSeason(s); setSelId(null); setRaceData(null) }} style={{
                background: season === s ? 'rgba(225,6,0,.12)' : 'transparent',
                border: `1px solid ${season === s ? 'rgba(225,6,0,.4)' : 'rgba(255,255,255,.08)'}`,
                borderRadius: 5, color: season === s ? '#E10600' : 'rgba(255,255,255,.3)',
                padding: '6px 14px', cursor: 'pointer', fontFamily: mono, fontSize: 10, letterSpacing: '.1em',
              }}>{s}</button>
            ))}
          </div>
          <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,.08)' }} />
          <div style={{ position: 'relative', flex: 1, maxWidth: 360 }}>
            <select value={selId ?? ''} onChange={e => setSelId(e.target.value ? parseInt(e.target.value) : null)}
              style={{ width: '100%', background: 'rgba(0,0,0,.4)', border: `1px solid ${selId ? 'rgba(225,6,0,.35)' : 'rgba(255,255,255,.1)'}`, borderRadius: 6, color: selId ? '#fff' : 'rgba(255,255,255,.4)', padding: '7px 32px 7px 12px', fontFamily: mono, fontSize: 11, letterSpacing: '.04em', cursor: 'pointer', outline: 'none', appearance: 'none' }}>
              <option value="">— SELECT GRAND PRIX —</option>
              {filtered.map(s => (
                <option key={s.id} value={s.id}>R{s.round} · {s.gp_name.replace(' Grand Prix', ' GP')} · {formatDate(s.date)}</option>
              ))}
            </select>
            <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'rgba(255,255,255,.3)', fontSize: 10 }}>▾</div>
          </div>
          {selSess && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,.25)', fontFamily: mono, letterSpacing: '.08em' }}>{selSess.circuit.toUpperCase()}</span>
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,.15)', fontFamily: mono }}>·</span>
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,.25)', fontFamily: mono, letterSpacing: '.08em' }}>
                {new Date(selSess.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase()}
              </span>
            </div>
          )}
        </div>
        {!selId ? (
          <div style={{ border: '1px solid rgba(255,255,255,.06)', borderRadius: 10, padding: '80px 0', textAlign: 'center', background: 'rgba(0,0,0,.2)' }}>
            <div style={{ fontFamily: bebas, fontSize: 22, color: 'rgba(255,255,255,.06)', letterSpacing: '.3em' }}>SELECT A RACE ABOVE</div>
          </div>
        ) : loading ? (
          <div style={{ border: '1px solid rgba(255,255,255,.06)', borderRadius: 10, padding: '80px 0', textAlign: 'center' }}>
            <Label dim>LOADING RACE DATA…</Label>
          </div>
        ) : raceData ? (
          <div style={{ display: 'grid', gap: 16 }}>
            <div style={{ border: '1px solid rgba(255,255,255,.07)', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,.06)', background: 'rgba(0,0,0,.35)', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => setShowOverview(p => !p)}>
                <div style={{ width: 2, height: 14, borderRadius: 1, background: '#E10600' }} />
                <span style={{ fontFamily: mono, fontSize: 15, letterSpacing: '.16em', color: 'rgba(255,255,255,.5)' }}>RACE OVERVIEW</span>
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,.15)', fontFamily: mono }}>{raceData.session?.gp_name} · {raceData.session?.season}</span>
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,.2)', fontFamily: mono, marginLeft: 'auto' }}>{showOverview ? '↑ COLLAPSE' : '↓ EXPAND'}</span>
              </div>
              {showOverview && <Overview data={raceData} />}
            </div>
            <div style={{ border: '1px solid rgba(255,255,255,.07)', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,.06)', background: 'rgba(0,0,0,.35)', overflowX: 'auto' }}>
                <div style={{ width: 2, height: '100%', background: '#E10600', flexShrink: 0 }} />
                {TABS.map(t => {
                  const active = activeTab === t.id
                  return (
                    <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
                      background: 'transparent', border: 'none',
                      borderBottom: active ? '2px solid #E10600' : '2px solid transparent',
                      padding: '10px 16px', cursor: 'pointer',
                      fontFamily: mono, fontSize: 9, letterSpacing: '.14em',
                      color: active ? '#fff' : 'rgba(255,255,255,.3)',
                      whiteSpace: 'nowrap', transition: 'all .12s',
                    }}>{t.label}</button>
                  )
                })}
              </div>
              {needDrivers && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,.05)', background: 'rgba(0,0,0,.2)', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 8, color: 'rgba(255,255,255,.2)', fontFamily: mono, letterSpacing: '.1em', flexShrink: 0 }}>DRIVERS</span>
                  <div style={{ width: 1, height: 12, background: 'rgba(255,255,255,.08)' }} />
                  {allDrivers.map((code, i) => {
                    const active = selDrivers.includes(code)
                    const color  = dc(code, raceData.results, i)
                    return (
                      <button key={code}
                        onClick={() => setSelDrivers(prev => prev.includes(code) ? prev.filter(d => d !== code) : [...prev, code])}
                        style={{ border: `1px solid ${active ? color : 'rgba(255,255,255,.08)'}`, borderRadius: 3, background: active ? `${color}18` : 'transparent', color: active ? color : 'rgba(255,255,255,.22)', padding: '3px 8px', cursor: 'pointer', fontFamily: mono, fontSize: 9, letterSpacing: '.05em', transition: 'all .1s' }}>
                        {code}
                      </button>
                    )
                  })}
                </div>
              )}
              {activeTab === 'LAP_PACE'  && <TabLapPace  data={raceData} drivers={selDrivers} />}
              {activeTab === 'POSITIONS' && <TabPositions data={raceData} drivers={selDrivers} />}
              {activeTab === 'STRATEGY'  && <TabStrategy  data={raceData} drivers={selDrivers} />}
              {activeTab === 'SECTORS'   && <TabSectors   data={raceData} drivers={selDrivers} />}
              {activeTab === 'REPLAY'    && <TabReplay     sessionId={selId} results={raceData.results} />}
            </div>
          </div>
        ) : null}
      </main>
      <Footer />
    </div>
  )
}