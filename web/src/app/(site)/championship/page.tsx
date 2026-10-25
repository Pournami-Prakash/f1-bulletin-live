'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { automaticClinchPaths, type ChampionshipForecast, type ChampionshipDriver } from '@/lib/championship'
import styles from './championship.module.css'
import ClinchMap from './ClinchMap'
import ClinchOverview from './ClinchOverview'

type View = 'championship' | 'race'
const points = (n: number) => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 }).format(n)
const percent = (n: number) => n === 0 ? '0%' : n < .001 ? '<0.1%' : n > .999 ? '>99.9%' : `${(n * 100).toFixed(1)}%`
const titleChance = (driver: ChampionshipDriver) => driver.points_eliminated ? 'Out on points' : driver.title_probability === 0 ? '—' : percent(driver.title_probability)
const shortRace = (name: string) => name.replace(' Grand Prix', '').replace('City', '').trim()
const teamColor = (name: string) => {
  const key = name.toLowerCase()
  if (key.includes('ferrari')) return '#ff524d'
  if (key.includes('mclaren')) return '#ff9b32'
  if (key.includes('mercedes')) return '#49d7b7'
  if (key.includes('red bull')) return '#7da8ff'
  if (key.includes('aston')) return '#72c9a0'
  if (key.includes('alpine')) return '#eaa5cf'
  if (key.includes('williams')) return '#74a4f3'
  if (key.includes('haas')) return '#e6d8cf'
  if (key.includes('sauber') || key.includes('audi')) return '#c3df55'
  return '#b4b5c3'
}
function distribution(data: ChampionshipForecast, driver: ChampionshipDriver, round: number, view: View): number[] {
  if (!round) return view === 'championship' ? data.drivers.map((_, i) => Number(i + 1 === driver.current_position)) : []
  const race = data.races.find(r => r.round === round && r.driver_code === driver.driver_code)
  return (view === 'championship' ? race?.championship_position_probabilities : race?.position_probabilities) ?? []
}
// Simulated shares never read as certain: a clean sweep of every sample is still only ">99".
const share = (p: number, simulated: boolean) => simulated && p >= .995 ? '>99' : String(Math.round(p * 100) || '<1')
const average = (values: number[]) => values.reduce((sum, p, i) => sum + p * (i + 1), 0)
function curve(path: { x: number; y: number }[]) {
  return path.map((p, i) => i === 0 ? `M${p.x},${p.y}` : `C${(path[i-1].x+p.x)/2},${path[i-1].y} ${(path[i-1].x+p.x)/2},${p.y} ${p.x},${p.y}`).join(' ')
}
// Vertical counterpart of curve(), used for the distribution outlines.
function vcurve(path: { x: number; y: number }[]) {
  return path.map((p, i) => i === 0 ? `M${p.x},${p.y}` : `C${path[i-1].x},${(path[i-1].y+p.y)/2} ${p.x},${(path[i-1].y+p.y)/2} ${p.x},${p.y}`).join(' ')
}
// Keep labels in a separate gutter with enough vertical space for both font sizes.
function spread<T extends { y: number }>(labels: T[], gap: number, min: number, max: number): T[] {
  const sorted = [...labels].sort((a,b)=>a.y-b.y)
  const spacing = Math.min(gap,(max-min)/Math.max(1,sorted.length-1))
  sorted.forEach((l,i)=>{l.y=Math.max(min,Math.min(max,l.y),i ? sorted[i-1].y+spacing : min)})
  if (sorted.length) sorted[sorted.length-1].y=Math.min(max,sorted[sorted.length-1].y)
  for(let i=sorted.length-2;i>=0;i--) sorted[i].y=Math.min(sorted[i].y,sorted[i+1].y-spacing)
  return sorted
}

function FutureMap({ data, driver, round, view, includeOthers, onRound }: {
  data: ChampionshipForecast; driver: ChampionshipDriver; round: number; view: View; includeOthers: boolean; onRound: (round: number) => void
}) {
  const stops = view === 'championship' ? [0, ...data.remaining.map(e => e.round)] : data.remaining.filter(e => e.race_pending).map(e => e.round)
  const visibleDrivers = data.drivers.filter(d => d.driver_code === driver.driver_code ||
    (view === 'race' ? d.active : includeOthers || !d.points_eliminated))
  const selected = stops.map(r => distribution(data, driver, r, view))
  // Fit all visible drivers across the entire timeline, including every rare outcome.
  // Keep the range stable while changing rounds or switching between contenders.
  const supportedPositions = visibleDrivers.flatMap(d => stops.flatMap(r =>
    distribution(data,d,r,view).flatMap((p,i) => p > 0 ? [i+1] : [])))
  const top = supportedPositions.length ? Math.min(...supportedPositions) : 1
  const bottom = supportedPositions.length ? Math.max(...supportedPositions) : 1
  const rows = bottom-top+1
  const row = 28, padTop = 44, padBottom = 76, left = 52, right = 152
  const width = Math.max(980,stops.length*140), height = padTop+rows*row+padBottom
  const column = (width-left-right)/Math.max(1,stops.length)
  const x = (i: number) => left+column*(i+.5)
  const y = (rank: number) => padTop+(rank-top+.5)*row
  const halfMax = 42
  const widthOf = (p: number) => halfMax*p
  const color = teamColor(driver.team)
  const activeIndex = stops.indexOf(round)
  const scroll = useRef<HTMLDivElement>(null)
  const selectedX = activeIndex >= 0 ? x(activeIndex) : 0
  useEffect(() => {
    const element = scroll.current
    if (!element) return
    const center = () => { element.scrollLeft = Math.max(0,selectedX-element.clientWidth/2) }
    center()
    const observer = new ResizeObserver(center)
    observer.observe(element)
    return () => observer.disconnect()
  },[selectedX,view])
  const others = visibleDrivers.filter(d => d.driver_code !== driver.driver_code).map(d => {
    const path = stops.flatMap((r,i) => {
      const values = distribution(data,d,r,view)
      return values.some(Boolean) ? [{x:x(i),y:y(average(values))}] : []
    })
    return { d, path }
  }).filter(({ path }) => path.some(p => p.y >= padTop && p.y <= height - padBottom))
  const ownPath = selected.flatMap((values,i) => values.some(Boolean) ? [{x:x(i),y:y(average(values))}] : [])
  const labels = spread([
    ...others.filter(o => o.path.length).map(o => ({ code: o.d.driver_code, fill: teamColor(o.d.team), own: false, y: o.path.at(-1)!.y + 4 })),
    ...(ownPath.length ? [{ code: driver.driver_code, fill: color, own: true, y: ownPath.at(-1)!.y + 4 }] : []),
  ], 20, padTop + 12, height - padBottom - 8).filter(l => l.y <= height - padBottom + 2)
  const shape = (values: number[], i: number) => {
    const first = values.findIndex(p => p > 0) + 1, last = values.findLastIndex(p => p > 0) + 1
    // Taper to a point half a row beyond the outermost reachable positions.
    const side = (sign: number) => [
      { x: x(i), y: y(first) - row * .5 },
      ...Array.from({ length: last - first + 1 }, (_, k) => ({ x: x(i) + sign * widthOf(values[first + k - 1] ?? 0), y: y(first + k) })),
      { x: x(i), y: y(last) + row * .5 },
    ]
    const right = side(1), leftSide = side(-1).reverse()
    return `${vcurve(right)} L${leftSide[0].x},${leftSide[0].y} ${vcurve(leftSide).slice(1)} Z`
  }
  return <div ref={scroll} className={styles.mapScroll} tabIndex={0} role="region" aria-label="Interactive championship possibility map">
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width, minWidth: width }} role="img" aria-labelledby="future-map-title" aria-describedby="future-map-description">
      <title id="future-map-title">{driver.driver_code} {view === 'race' ? 'race finishing' : 'championship'} possibilities across remaining races</title>
      <desc id="future-map-description">Positions P{top} to P{bottom} run from top to bottom. The position axis fits all non-zero outcomes for the displayed drivers across the entire timeline; unused positions above and below are omitted. Shape width is proportional to probability on a fixed 0–100% scale; every non-zero simulated outcome is included. Thin lines show nearby drivers' average positions. Exact probabilities are available below.</desc>
      <defs><clipPath id="future-map-plot"><rect x={left} y={padTop} width={width - left - right} height={rows * row} /></clipPath></defs>
      {activeIndex >= 0 && <rect x={x(activeIndex) - column / 2} y={padTop - 30} width={column} height={rows * row + 30 + padBottom - 8} className={styles.activeColumn} />}
      {Array.from({ length: rows }, (_, k) => top + k).map(rank => <g key={rank}>
        {rank > top && <line x1={left} x2={width - right} y1={y(rank) - row / 2} y2={y(rank) - row / 2} className={styles.gridLine} />}
        <text x={left - 14} y={y(rank) + 4} textAnchor="end" className={rank <= 3 ? styles.podiumLabel : ''}>P{rank}</text>
      </g>)}
      {stops.map((r, i) => <g key={r}>
        <text x={x(i)} y={padTop - 22} textAnchor="middle" className={r === round ? styles.activeRound : styles.roundLabel}>{r ? `R${r}` : 'NOW'}</text>
        <text x={x(i)} y={padTop - 9} textAnchor="middle" className={r === round ? styles.activeRace : styles.raceLabel}>{r ? shortRace(data.remaining.find(e => e.round === r)!.race_name).slice(0,13) : 'Standings'}</text>
      </g>)}
      <g clipPath="url(#future-map-plot)">
        {others.map(({ d, path }) => <path key={d.driver_code} d={curve(path)} fill="none" stroke={teamColor(d.team)} strokeWidth="1.25" opacity=".38" strokeDasharray={!d.active ? '3 5' : undefined} />)}
        {selected.map((values,i) => values.some(Boolean) && <path key={stops[i]} d={shape(values, i)} fill={color} fillOpacity={i === activeIndex ? .42 : .22} stroke={color} strokeOpacity={i === activeIndex ? .9 : .5} strokeWidth="1" />)}
        <path d={curve(ownPath)} fill="none" stroke={color} strokeWidth="2.5" />
        {ownPath.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="4" fill="var(--bg)" stroke={color} strokeWidth="2" />)}
      </g>
      {selected.map((values,i) => values.map((p, rank) => (i === activeIndex ? p >= .03 : p === Math.max(...values)) && rank + 1 >= top && rank + 1 <= bottom
        ? <text key={`${i}-${rank}`} x={x(i) + widthOf(p) + 7} y={y(rank + 1) + 4} className={i === activeIndex ? styles.shareLabel : styles.shareLabelMuted}>{share(p, stops[i] !== 0)}%</text> : null))}
      {labels.map(l => <g key={l.code}>
        <path d={`M${width-right+52},${y(average(distribution(data,data.drivers.find(d=>d.driver_code===l.code)!,stops.at(-1)??0,view)))} L${width-right+86},${l.y-4}`} fill="none" stroke={l.fill} strokeOpacity=".4" />
        <text x={width-right+94} y={l.y} fill={l.fill} className={l.own ? styles.selectedLabel : styles.driverLabel}>{l.code}</text>
      </g>)}
      <g aria-label="Full shape width: fixed probability scale">
        <text x={left} y={height-40}>Shape width</text>
        <line x1={left} x2={left+84} y1={height-25} y2={height-25} stroke="var(--t2)" />
        {[0,.5,1].map(p=><g key={p}><line x1={left+84*p} x2={left+84*p} y1={height-29} y2={height-21} stroke="var(--t2)" /><text x={left+84*p} y={height-7} textAnchor="middle">{p*100}%</text></g>)}
      </g>
      {stops.map((r, i) => <rect key={r} x={x(i) - column / 2} y={0} width={column} height={height} fill="transparent" className={styles.columnTarget} onClick={() => onRound(r)} aria-hidden="true"><title>{r ? `Inspect round ${r}` : 'Inspect current standings'}</title></rect>)}
    </svg>
  </div>
}

function FieldGrid({ data, round, view, code, names, onDriver }: {
  data: ChampionshipForecast; round: number; view: View; code: string; names: Record<string,string>; onDriver: (code: string) => void
}) {
  const rows = data.drivers.filter(d => view === 'championship' || d.active)
    .map(d => ({ d, values: distribution(data, d, round, view) }))
    .filter(r => r.values.some(Boolean))
    .sort((a, b) => average(a.values) - average(b.values))
  const positions = Math.max(0, ...rows.map(r => r.values.length))
  const event = data.remaining.find(e => e.round === round)
  const where = event ? shortRace(event.race_name) : 'current standings'
  return <div className={styles.fieldBlock}>
    <div className={styles.fieldHead}>
      <div><span className={styles.kicker}>THE WHOLE GRID / {round ? `ROUND ${round}` : 'NOW'}</span><h3>{view === 'championship' ? `Championship order after ${where}` : `${where} finishing order`}</h3></div>
      <p>Each cell is the chance of that driver finishing in that {view === 'championship' ? 'championship position' : 'race position'}. Numbers are probabilities (%); dots are below 5%; blanks mean no sampled outcomes. “&gt;99” is a model estimate, not a guarantee. Pick a row to follow that driver.</p>
    </div>
    <div className={styles.heatLegend} aria-label="Fixed probability colour scale"><span>Same colour scale for every driver and race</span>{[0,.25,.5,.75,1].map(p=><span key={p}><i style={{background:p?`color-mix(in srgb,var(--red) ${Math.round(3+p*87)}%,transparent)`:'transparent'}} />{p*100}%</span>)}</div>
    <p className={styles.rosterNote}>{view==='championship' ? `${data.drivers.length} season participants, including ${data.drivers.filter(d=>!d.active).length} inactive. Championship positions include everyone’s season points.` : `${data.drivers.filter(d=>d.active).length} active drivers. Race positions exclude inactive drivers.`}</p>
    <div className={styles.fieldScroll} role="region" tabIndex={0} aria-label="Whole-grid position probabilities">
      <table className={styles.fieldGrid}>
        <caption className={styles.srOnly}>All drivers · {view === 'championship' ? 'championship' : 'race finish'} position probabilities · {where}</caption>
        <thead><tr><th scope="col">Driver</th>{Array.from({ length: positions }, (_, i) => <th scope="col" key={i}>P{i + 1}</th>)}<th scope="col" className={styles.meta}>Avg</th><th scope="col" className={styles.meta}>{view === 'race' ? 'Race win chance' : 'Simulated title share'}</th></tr></thead>
        <tbody>{rows.map(({ d, values }) => {
          const odds = view === 'race' ? data.races.find(r => r.round === round && r.driver_code === d.driver_code)?.win_probability ?? 0 : d.title_probability
          return <tr key={d.driver_code} className={d.driver_code === code ? styles.followed : ''} style={{ '--team': teamColor(d.team) } as CSSProperties}>
            <th scope="row"><button onClick={() => onDriver(d.driver_code)} aria-pressed={d.driver_code === code}><i aria-hidden="true" /><span>{names[d.driver_code] ?? d.driver_code}{names[d.driver_code] && <small>{d.driver_code}</small>}</span></button></th>
            {Array.from({ length: positions }, (_, i) => {
              const p = values[i] ?? 0, shade = p
              return <td key={i} title={`${d.driver_code} P${i + 1}: ${round && p === 1 ? `every one of ${data.simulations.toLocaleString('en-GB')} simulations, not yet mathematically certain` : percent(p)}`} className={shade > .6 ? styles.hot : ''} style={{ background: p ? `color-mix(in srgb, var(--red) ${Math.round(3 + shade * 87)}%, transparent)` : undefined }}>
                {p >= .05 ? share(p, round !== 0) : p > 0 ? <span className={styles.trace} aria-hidden="true" /> : ''}<span className={styles.srOnly}>{p ? percent(p) : '0%'}</span>
              </td>
            })}
            <td className={styles.meta}>{average(values).toFixed(1)}</td><td className={styles.meta}>{view === 'championship' ? titleChance(d) : odds === 0 ? 'No sampled wins' : percent(odds)}</td>
          </tr>
        })}</tbody>
      </table>
    </div>
    <p className={styles.rosterNote}>{view === 'championship' ? 'Simulated title share covers all remaining races, regardless of the selected round. It is a model frequency, not a calibrated probability. “Out on points” means the driver cannot reach the leader’s current points total.' : '“No sampled wins” means the driver won none of the simulated races; it does not prove a win is impossible.'}</p>
  </div>
}

export default function ChampionshipPage() {
  const [data,setData] = useState<ChampionshipForecast|null>(null)
  const [names,setNames] = useState<Record<string,string>>({})
  const [error,setError] = useState('')
  const [attempt,setAttempt] = useState(0)
  const [code,setCode] = useState('')
  const [round,setRound] = useState(0)
  const [view,setView] = useState<View>('championship')
  const [exploring,setExploring] = useState(false)
  const [includeOthers,setIncludeOthers] = useState(false)
  const [playing,setPlaying] = useState(false)
  const [inspectedPosition,setInspectedPosition] = useState<number|null>(null)
  useEffect(() => {
    const controller = new AbortController()
    setError('')
    fetch('/api/championship',{signal:controller.signal}).then(async response => {
      const body = await response.json()
      if (!response.ok || !body.ok) throw new Error(body.error || 'Championship scenarios could not be loaded.')
      if (!controller.signal.aborted) {
        const forecast = body as ChampionshipForecast
        setData(forecast)
        const contender = forecast.drivers.filter(d=>!d.points_eliminated).sort((a,b)=>a.current_position-b.current_position)[0]
        setCode(contender?.driver_code ?? forecast.drivers[0]?.driver_code ?? '')
        setRound(forecast.remaining.at(-1)?.round ?? 0)
      }
    }).catch((reason: Error) => { if (!controller.signal.aborted) setError(reason.message) })
    return () => controller.abort()
  },[attempt])
  useEffect(() => {
    if (!data) return
    const controller = new AbortController()
    fetch(`/api/standings?season=${data.season}&type=drivers`, {signal:controller.signal})
      .then(async response => {
        if (!response.ok) return
        const body = await response.json()
        const entries = (body.standings ?? []) as {Driver: {code?: string; givenName?: string; familyName?: string}}[]
        const resolved: Record<string,string> = {}
        for (const {Driver: d} of entries) {
          if (d?.code && d.givenName && d.familyName) resolved[d.code] = `${d.givenName} ${d.familyName}`
        }
        if (!controller.signal.aborted) setNames(resolved)
      }).catch(() => { /* Driver codes remain usable when names are unavailable. */ })
    return () => controller.abort()
  },[data])
  const clinchDrivers = useMemo(() => data?.next_race_clinch ? automaticClinchPaths(data.next_race_clinch) : [], [data])
  const titleDrivers = data?.drivers.filter(d=>!d.points_eliminated).sort((a,b)=>a.current_position-b.current_position) ?? []
  const otherDrivers = data?.drivers.filter(d=>d.points_eliminated).sort((a,b)=>a.current_position-b.current_position) ?? []
  const pointsRemaining = data?.remaining.reduce((sum,e)=>sum+(e.race_pending?25:0)+(e.sprint_pending?8:0),0) ?? 0
  const leader = data?.drivers.find(d => d.current_position === 1)
  const runnerUp = data?.drivers.find(d => d.current_position === 2)
  const secured = clinchDrivers.find(d => d.status === 'secured')
  const contenders = clinchDrivers.filter(d => d.status === 'paths')
  const clinchSummary = secured ? `${names[secured.driver_code] ?? secured.driver_code} has secured the title`
    : clinchDrivers.some(d => d.status === 'sprint_pending') ? 'Clinch scenarios await Sprint results'
    : contenders.length ? `${contenders.map(d => names[d.driver_code] ?? d.driver_code).join(', ')} can clinch next race`
    : data?.next_race_clinch ? 'No driver can clinch next race' : data && !data.remaining.length ? 'Season complete' : 'No upcoming clinch scenario available'
  const stops = data ? (view === 'championship' ? [0,...data.remaining.map(e => e.round)] : data.remaining.filter(e => e.race_pending).map(e => e.round)) : [0]
  useEffect(() => {
    if (!playing || !data) return
    const playable = view === 'championship' ? [0,...data.remaining.map(e => e.round)] : data.remaining.filter(e => e.race_pending).map(e => e.round)
    const timer = window.setInterval(() => setRound(previous => {
      const next = playable.indexOf(previous)+1
      if (next >= playable.length) { setPlaying(false); return previous }
      return playable[next]
    }),1400)
    return () => window.clearInterval(timer)
  },[playing,data,view])
  const driver = data?.drivers.find(d => d.driver_code === code)
  const event = data?.remaining.find(e => e.round === round)
  const scenario = data?.races.find(r => r.round === round && r.driver_code === code)
  const probabilities = data && driver ? distribution(data,driver,round,view) : []
  const band = view === 'championship' ? scenario?.championship_position : scenario?.position
  const chooseRound = (r: number) => { setRound(r); setPlaying(false); setInspectedPosition(null) }
  const currentIndex = Math.max(0,stops.indexOf(round))
  const mode = view === 'championship' ? 'championship' : 'race finish'
  return <><Header /><main className={styles.page} id="main-content">
    <div className={styles.eyebrow}>CHAMPIONSHIP TRACKER<Link href="/predictions">Race predictions ↗</Link></div>
    <header className={styles.masthead}><h1>CHAMPIONSHIP <em>OUTLOOK</em></h1><p>The points, remaining races, and results<br />that can decide the championship.</p></header>
    {!data && !error && <div className={styles.state} role="status">Mapping the possible futures…</div>}
    {error && <div className={styles.state} role="alert"><h2>Season outlook unavailable</h2><p>{error}</p><button onClick={() => setAttempt(a => a+1)}>Try again</button></div>}
    {data && driver && <>
      <div className={styles.snapshot}><span>{data.season} / AFTER R{data.as_of_round}</span><span>{data.remaining.filter(e => e.race_pending).length} RACES LEFT</span><span>{data.remaining.filter(e => e.sprint_pending).length} SPRINTS LEFT</span><span>{points(pointsRemaining)} POINTS AVAILABLE</span></div>
      <div className={styles.freshness}>
        <span>Updated after {data.as_of_race_name ?? `round ${data.as_of_round}`} · <time dateTime={data.generated_at}>{new Date(data.generated_at).toLocaleString('en-GB', {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZoneName:'short'})}</time></span>
        <span>Recorded points · full-points scenarios</span>
      </div>
      <section className={styles.summary} aria-label="Championship at a glance">
        <div><span>Championship leader</span><strong>{leader ? names[leader.driver_code] ?? leader.driver_code : 'Standings unavailable'}</strong><p>{leader ? `${points(leader.current_points)} points` : 'Waiting for recorded standings'}</p></div>
        <div><span>Gap to second</span><strong>{leader && runnerUp ? `${points(leader.current_points-runnerUp.current_points)} pts` : '—'}</strong><p>{runnerUp ? `Ahead of ${names[runnerUp.driver_code] ?? runnerUp.driver_code}` : 'No second-place driver recorded'}</p></div>
        <div><span>Next title decision</span><strong className={styles.summaryStatus}>{clinchSummary}</strong><p>{data.remaining.filter(e=>e.race_pending).length} races remaining{data.next_race_clinch && <> · <a href="#title-scenarios">View title scenarios ↓</a></>}</p></div>
      </section>
      <section className={styles.titleFight} aria-labelledby="title-fight-heading">
        <div className={styles.fightHeading}><h2 id="title-fight-heading">The title fight</h2><span>{titleDrivers.length} {titleDrivers.length===1?'driver remains':'drivers remain'} in contention</span></div>
        <div className={styles.contenderList}>
          <div className={styles.contenderColumns} aria-hidden="true"><span>Contender</span><span>Points</span><span>Gap</span><span>Maximum total</span><span>Gain to lead outright</span></div>
          {titleDrivers.map(d=><button key={d.driver_code} className={styles.contenderRow} style={{'--team':teamColor(d.team)} as CSSProperties} aria-controls="season-explorer" aria-expanded={exploring && code===d.driver_code} aria-label={`Explore ${names[d.driver_code] ?? d.driver_code} championship outlook`} onClick={()=>{setCode(d.driver_code);setView('championship');setIncludeOthers(false);setInspectedPosition(null);setExploring(true);requestAnimationFrame(()=>document.getElementById('map-heading')?.focus())}}>
            <span><b>{names[d.driver_code] ?? d.driver_code}</b><small>{d.team}{names[d.driver_code] ? ` · ${d.driver_code}` : ''}</small></span>
            <span><small>Points</small>{points(d.current_points)}</span><span><small>Gap</small>{leader && d.driver_code!==leader.driver_code ? `−${points(leader.current_points-d.current_points)}` : 'Leader'}</span><span><small>Maximum total</small>{points(d.maximum_points)}</span><span><small>Gain to lead outright</small>{leader && d.driver_code!==leader.driver_code ? `+${points(Math.floor(leader.current_points-d.current_points)+1)} vs leader` : 'Defend the lead'}</span>
          </button>)}
        </div>
        <p className={styles.fightNote}>Gain to lead is the net points a challenger must earn over the current leader to move ahead outright. A points tie may still be decided by countback. Maximum totals assume full points and no penalties; these are scoring bounds, not predictions.</p>
      </section>
      <div id="title-scenarios" className={styles.titleScenarios}>
        <ClinchOverview data={data} drivers={clinchDrivers} />
      {data.next_race_clinch && <details className={styles.customScenario}><summary>Build a custom scenario (optional)</summary>
      <ClinchMap data={data} />
      </details>}
      </div>
      <details id="season-explorer" className={styles.explorerDisclosure} open={exploring} onToggle={e=>{setExploring(e.currentTarget.open);if(!e.currentTarget.open)setPlaying(false)}}>
        <summary>Explore contender projections</summary>
        <p className={styles.simulationContext}>Exploratory simulations · {data.simulations.toLocaleString('en-GB')} sampled seasons. These percentages describe this model’s outcomes; they have not been calibrated against historical title races.</p>
      <section aria-labelledby="map-heading" className={styles.explorer}>
        <div className={styles.toolbar}><div><span className={styles.kicker}>THE POSSIBILITY MAP</span><h2 id="map-heading" tabIndex={-1}>SEASON PROJECTIONS</h2></div></div>
        <details className={styles.raceDisclosure} onToggle={e=>{if(!e.currentTarget.open){setView('championship');setPlaying(false);setInspectedPosition(null)}}}>
          <summary>Explore race outcomes</summary><p>Switch to individual race finishes for the selected driver.</p>
<div className={styles.mode} role="group" aria-label="Forecast view">{(['championship','race'] as const).map(v => <button key={v} aria-pressed={view===v} disabled={v==='race' && !data.remaining.some(e => e.race_pending)} onClick={() => {
          setView(v);setPlaying(false);setInspectedPosition(null)
          if (v==='race') { if (!event?.race_pending) setRound(data.remaining.find(e=>e.race_pending)?.round ?? 0); if (!driver.active) setCode(data.drivers.find(d=>d.active)!.driver_code) }
        }}>{v==='championship' ? 'Championship positions' : 'Race finishes'}</button>)}</div></details>
        <p className={styles.rosterNote}>Choose a driver to explore their outlook.</p>
        <div className={styles.driverPicker} role="group" aria-label="Follow a driver">{(includeOthers ? data.drivers : titleDrivers).map(d => <button key={d.driver_code} style={{'--team':teamColor(d.team)} as CSSProperties} disabled={view==='race' && !d.active} aria-pressed={code===d.driver_code} aria-label={`Follow ${names[d.driver_code] ?? d.driver_code}${!d.active?' (inactive)':''}`} onClick={() => {setCode(d.driver_code);setInspectedPosition(null)}}><i aria-hidden="true" /><span>{names[d.driver_code] ?? d.driver_code}{names[d.driver_code] && <small>{d.driver_code}</small>}</span></button>)}</div>
        {data.remaining.length ? <div className={styles.timeline}>
          <div className={styles.scrubber}><button className={styles.play} aria-label={playing?'Pause season':'Play season'} onClick={() => {
            if (playing) setPlaying(false)
            else { const start = view==='race' ? data.remaining.find(e=>e.race_pending)!.round : 0; setRound(start);setInspectedPosition(null);setPlaying(true) }
          }}>{playing?'Ⅱ':'▶'}<span>{playing?'PAUSE':'PLAY'}</span></button><label htmlFor="season-round">Choose a race</label><input id="season-round" type="range" min={0} max={stops.length-1} value={currentIndex} aria-valuetext={event?.race_name ?? 'Current standings'} onChange={e => { const target=stops[Number(e.target.value)]; if(view==='race' && !data.remaining.find(r=>r.round===target)?.race_pending) return; chooseRound(target) }} /></div>
          <div className={styles.racePicker} role="group" aria-label="Choose a remaining race">{stops.filter(r=>view==='championship' || data.remaining.find(e=>e.round===r)?.race_pending).map((r,i) => {
            const e = data.remaining.find(e=>e.round===r)
            return <button key={r} aria-pressed={round===r} onClick={()=>chooseRound(r)}><span className={styles.timelineDot} /><small>{r?`ROUND ${r}`:'START'}</small><b>{e?shortRace(e.race_name):'Now'}</b><span>{e ? new Date(e.race_start_utc).toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'UTC'}) : `${data.completed_races} races in`}{e?.sprint_pending?' + S':''}{i===stops.length-1?' / FINALE':''}</span></button>
          })}</div>
        </div> : <p className={styles.note}>No races remain on the recorded calendar. The map shows the final recorded standings.</p>}

        <div className={styles.visualLayout}>
          <div className={styles.mapPanel}><div className={styles.mapLegend}><span style={{color:teamColor(driver.team)}}><i className={styles.legendShape} />Shape width = probability · fixed 0–100%</span><span><i />{includeOthers || view==='race' ? 'Other drivers’ average paths' : 'Other contenders’ average paths'}</span><span>Click a race column to inspect it</span></div><FutureMap data={data} driver={driver} round={round} view={view} includeOthers={includeOthers} onRound={chooseRound} /><p className={styles.mapHint}>{includeOthers || view==='race' ? 'Full field shown' : 'Title contenders shown'} · Position range fits all their sampled outcomes across the season. Lines show averages, not a single possible season. Scroll the map sideways on smaller screens.</p></div>
          <aside className={styles.inspector} aria-labelledby="inspector-heading" style={{'--team':teamColor(driver.team)} as CSSProperties}>
            <p className={styles.estimate}>Exploratory simulation · uncalibrated</p><div className={styles.inspectorTop}><span className={styles.kicker}>{round ? `AFTER ROUND ${round}` : 'RECORDED STANDINGS'}</span><h3 id="inspector-heading">{event ? shortRace(event.race_name) : 'Right now'}</h3><p>{event?.circuit_name ?? `After round ${data.as_of_round}`}{event?.sprint_pending ? ' · includes sprint points' : ''}</p>{event?.awaiting_results && <p>Awaiting complete results</p>}</div>
            <div className={styles.driverIdentity}><strong>{code}</strong><span>{names[code] && <>{names[code]}<br /></>}{driver.team}<br />{mode} position</span></div>
            <div className={styles.range}><b>{round && band ? `P${band.low}` : `P${driver.current_position}`}</b><span>{round ? 'MIDDLE 80%' : 'ACTUAL POSITION'}<br />{round ? 'usual range' : 'recorded'}</span><b>{round && band ? `P${band.high}` : `P${driver.current_position}`}</b></div>
            {round>0 && <p className={styles.rangeExplanation}><strong>Typical outcomes, not absolute limits.</strong></p>}
            <div className={styles.barScale}><span>0%</span><span>Probability</span><span>100%</span></div>
            <div className={styles.spectrum} role="group" aria-label={`${code} exact position probabilities`}>
              {probabilities.map((p,i) => p >= .01 && <button key={i} aria-label={`P${i+1}: ${percent(p)}`} aria-pressed={inspectedPosition===i+1} onClick={() => setInspectedPosition(i+1)} style={{'--probability':`${p*100}%`} as CSSProperties}><small>P{i+1}</small><span className={styles.track}><span className={styles.bar} /></span><b>{percent(p)}</b></button>)}
              {probabilities.some(p => p > 0 && p < .01) && <p className={styles.rare}>Rarer positions (&lt;1% each) are on the map and in the selector.</p>}
            </div>
            <label className={styles.positionSelect}>Inspect position<select aria-label="Inspect position" value={inspectedPosition ?? ''} onChange={e=>setInspectedPosition(Number(e.target.value))}><option value="" disabled>Choose a position</option>{probabilities.map((_,i)=><option key={i} value={i+1}>P{i+1} · {percent(probabilities[i])}</option>)}</select></label><p className={styles.probabilityReadout} aria-live="polite">{inspectedPosition ? <>P{inspectedPosition} <b>{percent(probabilities[inspectedPosition-1] ?? 0)}</b> of simulated outcomes</> : 'Tap a position bar to see its probability.'}</p>
            <dl className={styles.stats}><div><dt>{round ? 'Expected total' : 'Current points'}</dt><dd>{points(scenario?.cumulative_points.mean ?? driver.current_points)} <small>PTS</small></dd></div>{round && <div><dt>Weekend points</dt><dd>+{points(scenario?.points.mean ?? 0)} <small>AVG</small></dd></div>}<div><dt>{driver.points_eliminated ? view==='race'?'Race top-10 chance':'Top-10 championship chance' : 'Simulated title share'}</dt><dd>{driver.points_eliminated ? percent(probabilities.slice(0,10).reduce((sum,p)=>sum+p,0)) : titleChance(driver)}</dd></div></dl>
          </aside>
        </div>

        <details className={styles.gridDisclosure}>
          <summary>Show all drivers’ position chances</summary>
          <FieldGrid data={data} round={round} view={view} code={code} names={names} onDriver={c => {setCode(c);setIncludeOthers(Boolean(data.drivers.find(d=>d.driver_code===c)?.points_eliminated));setInspectedPosition(null)}} />
        </details>
      </section>
      </details>
      {otherDrivers.length>0 && <details className={styles.otherDisclosure}>
        <summary>Other drivers’ season outlooks <span>{otherDrivers.length} out on points</span></summary>
        <p>These drivers cannot reach the leader’s current points total. Explore their remaining races and championship positions.</p>
        <div className={styles.driverPicker} role="group" aria-label="Other drivers">{otherDrivers.map(d=><button key={d.driver_code} onClick={()=>{setCode(d.driver_code);setView('championship');setIncludeOthers(true);setExploring(true);setInspectedPosition(null);requestAnimationFrame(()=>document.getElementById('map-heading')?.focus())}}>{names[d.driver_code] ?? d.driver_code}<small>Explore outlook ↗</small></button>)}</div>
      </details>}
      <details className={styles.method}><summary>How to read this forecast</summary><p>Current points and gaps come from recorded results. Points available, maximum totals and clinching conditions use the scheduled full-points scoring rules. The separate simulator uses hand-set form weights and uncertainty assumptions, and has not been validated as a championship probability model.</p>{data.warnings.map(w=><p key={w}>{w}</p>)}<p>The 80% range runs from the 10th to the 90th percentile. Rarer finishes can fall outside it. A dash in simulated title shares means the driver won none of the simulated titles but remains eligible on points. Zero sampled outcomes do not establish impossibility. Distributions are marginal: different drivers’ best cases cannot all happen together. Team-coloured lines connect average positions; they can cross or overlap and are not a predicted finishing order.</p><p>Absolute points bounds for {code}: {points(driver.current_points)}–{points(driver.maximum_points)}, assuming no future penalties. Snapshot: {new Date(data.generated_at).toLocaleString('en-GB')} · {data.model_version}. <a href="https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_a_general_provisions_-_iss_03_-_2026-06-25.pdf" target="_blank" rel="noopener noreferrer">FIA championship scoring and countback rules ↗</a></p>
        <details className={styles.exact}><summary>Exact position probabilities for {code}</summary><div className={styles.dataScroll}><table><caption>{code} · {mode} probabilities by round</caption><thead><tr><th scope="col">Position</th>{(view==='championship'?stops:stops.filter(r=>data.remaining.find(e=>e.round===r)?.race_pending)).map(r=><th scope="col" key={r}>{r?`R${r}`:'Now'}</th>)}</tr></thead><tbody>{probabilities.map((_,i)=><tr key={i}><th scope="row">P{i+1}</th>{(view==='championship'?stops:stops.filter(r=>data.remaining.find(e=>e.round===r)?.race_pending)).map(r=><td key={r}>{percent(distribution(data,driver,r,view)[i]??0)}</td>)}</tr>)}</tbody></table></div></details>
      </details>
    </>}
  </main><Footer /></>
}
