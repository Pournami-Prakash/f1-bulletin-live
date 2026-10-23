'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import type { ChampionshipForecast, ChampionshipDriver, Band } from '@/lib/championship'
import styles from './championship.module.css'

const points = (value: number) => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 }).format(value)
const position = (value: number) => `P${Math.round(value)}`
const chance = (value: number, eliminated = false) => eliminated ? 'Out of reach' : value < .001 ? '<0.1%' : value > .999 ? '>99.9%' : `${(value * 100).toFixed(1)}%`
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
  return '#c3c4c8'
}

function RankBand({ band, field }: { band: Band; field: number }) {
  const scale = (rank: number) => (rank - 1) / Math.max(1, field - 1) * 100
  return <div className={styles.rankGraphic} aria-hidden="true">
    <span className={styles.rankTrack} />
    <span className={styles.rankFill} style={{ left: `${scale(band.low)}%`, width: `${Math.max(1, scale(band.high) - scale(band.low))}%` }} />
    <span className={styles.rankDot} style={{ left: `${scale(band.median)}%` }} />
  </div>
}

function SeasonPath({ data, driver }: { data: ChampionshipForecast; driver: ChampionshipDriver }) {
  const future = data.remaining.map(event => ({ event, scenario: data.races.find(r => r.round === event.round && r.driver_code === driver.driver_code) }))
  const observations = [{ low: driver.current_points, mean: driver.current_points, high: driver.current_points },
    ...future.map(({ scenario }) => scenario?.cumulative_points ?? { low: driver.current_points, mean: driver.current_points, high: driver.current_points })]
  const width = 900, height = 240, left = 58, right = 22, top = 20, bottom = 38
  const minimum = Math.max(0, Math.floor((Math.min(...observations.map(r => r.low)) - 10) / 25) * 25)
  const maximum = Math.max(minimum + 50, Math.ceil((Math.max(...observations.map(r => r.high)) + 10) / 25) * 25)
  const x = (i: number) => left + i * (width - left - right) / Math.max(1, observations.length - 1)
  const y = (value: number) => height - bottom - (value - minimum) / (maximum - minimum) * (height - top - bottom)
  const band = [...observations.map((r, i) => `${x(i)},${y(r.high)}`), ...observations.map((r, i) => `${x(i)},${y(r.low)}`).reverse()].join(' ')
  const ticks = Array.from({ length: 4 }, (_, i) => minimum + (maximum - minimum) * i / 3)
  return <figure className={styles.chart}>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby="season-path-title season-path-description">
      <title id="season-path-title">{driver.driver_code} projected championship points</title>
      <desc id="season-path-description">Starts at {points(driver.current_points)} points. The line shows the average simulated total; the shaded area contains the middle 80% of scenarios at each round. The table below lists every round.</desc>
      {ticks.map(value => <g key={value}><line x1={left} x2={width-right} y1={y(value)} y2={y(value)} className={styles.gridLine} /><text x={left-10} y={y(value)+4} textAnchor="end">{Math.round(value)}</text></g>)}
      <polygon points={band} fill={teamColor(driver.team)} opacity=".13" />
      <polyline points={observations.map((r, i) => `${x(i)},${y(r.mean)}`).join(' ')} fill="none" stroke={teamColor(driver.team)} strokeWidth="2.5" />
      {observations.map((r, i) => <g key={i}><circle cx={x(i)} cy={y(r.mean)} r="3" fill={teamColor(driver.team)} /><text x={x(i)} y={height-12} textAnchor="middle">{i===0 ? 'NOW' : `R${future[i-1].event.round}`}</text></g>)}
    </svg>
    <figcaption><span className={styles.lineKey} style={{ background: teamColor(driver.team) }} />Average points <span className={styles.bandKey} />80% scenario range</figcaption>
  </figure>
}

export default function ChampionshipPage() {
  const [data, setData] = useState<ChampionshipForecast | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [selectedDriver, setSelectedDriver] = useState('')
  const [selectedRound, setSelectedRound] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setError('')
    fetch('/api/championship', { signal: controller.signal }).then(async response => {
      const body = await response.json()
      if (!response.ok || !body.ok) throw new Error(body.error || 'Championship scenarios could not be loaded.')
      if (!controller.signal.aborted) {
        setData(body)
        setSelectedDriver(body.drivers[0]?.driver_code ?? '')
        setSelectedRound(body.remaining[0]?.round ?? 0)
      }
    }).catch((reason: Error) => { if (!controller.signal.aborted) setError(reason.message) })
    return () => controller.abort()
  }, [attempt])
  const driver = data?.drivers.find(d => d.driver_code === selectedDriver) ?? data?.drivers[0]
  const event = data?.remaining.find(e => e.round === selectedRound)
  const raceRows = data?.races.filter(r => r.round === selectedRound).sort((a, b) => a.position.mean - b.position.mean) ?? []
  const maximumPoints = data?.remaining.reduce((sum, r) => sum + (r.race_pending ? 25 : 0) + (r.sprint_pending ? 8 : 0), 0) ?? 0
  return <>
    <Header />
    <main className={styles.page} id="main-content">
      <div className={styles.eyebrow}><span />CHAMPIONSHIP INTELLIGENCE <span className={styles.experimental}>EXPERIMENTAL OUTLOOK</span></div>
      <div className={styles.masthead}>
        <div><h1>THE ROAD<br />TO THE <em>TITLE.</em></h1><p>Every driver. Every remaining weekend.<br />See how the championship could unfold.</p></div>
        <nav className={styles.sectionNav} aria-label="Championship sections"><a href="#season-outlook">Final standings ↗</a><a href="#remaining-races">Race by race ↗</a><Link href="/predictions">Race predictions ↗</Link></nav>
      </div>
      {!data && !error && <div className={styles.state} role="status" aria-live="polite">Building the remaining-season outlook…</div>}
      {error && <div className={styles.state} role="alert"><h2>Season outlook unavailable</h2><p>{error}</p><button onClick={() => setAttempt(a => a+1)}>Try again</button></div>}
      {data && <>
        <div className={styles.snapshot}><span>{data.season} SEASON</span><span>AFTER ROUND {data.as_of_round}</span><span>{data.remaining.filter(r => r.race_pending).length} RACES LEFT</span><span>{data.remaining.filter(r => r.sprint_pending).length} SPRINTS LEFT</span><span>{maximumPoints} POINTS AVAILABLE</span></div>
        <p className={styles.rangeNote}>Best and worst cases below show the middle 80% of simulated outcomes. They are plausible scenarios, not absolute limits or guaranteed coverage.</p>
        {driver && <section className={styles.pathSection} aria-labelledby="driver-path-heading">
          <div className={styles.sectionHeading}><div><span className={styles.kicker}>FOLLOW A DRIVER</span><h2 id="driver-path-heading">{driver.driver_code} · THE RUN-IN</h2></div><div className={styles.selectLabel}><label htmlFor="championship-driver">Driver</label><select id="championship-driver" value={selectedDriver} onChange={e => setSelectedDriver(e.target.value)}>{data.drivers.map(d => <option key={d.driver_code} value={d.driver_code}>{d.driver_code} · {d.team}</option>)}</select></div></div>
          <div className={styles.driverSummary}><strong>{points(driver.current_points)}<small>POINTS NOW</small></strong><span aria-hidden="true">→</span><strong style={{ color: teamColor(driver.team) }}>{points(driver.points.mean)}<small>PROJECTED TOTAL</small></strong><p>Finishing range <b>{position(driver.position.low)}–{position(driver.position.high)}</b><br />Points range <b>{points(driver.points.low)}–{points(driver.points.high)}</b></p></div>
          {data.remaining.length > 0 ? <><SeasonPath data={data} driver={driver} /><div className={styles.scroll} tabIndex={0} role="region" aria-label={`${driver.driver_code} race-by-race points`}><table className={styles.pathTable}><caption className={styles.srOnly}>Cumulative points and championship position for {driver.driver_code}</caption><thead><tr><th scope="col">AFTER</th>{data.remaining.map(e => <th scope="col" key={e.round}>R{e.round} · {shortRace(e.race_name)}</th>)}</tr></thead><tbody><tr><th scope="row">Projected points</th>{data.remaining.map(e => <td key={e.round}>{points(data.races.find(r => r.round===e.round && r.driver_code===driver.driver_code)?.cumulative_points.mean ?? driver.current_points)}</td>)}</tr><tr><th scope="row">80% points range</th>{data.remaining.map(e => { const r=data.races.find(r => r.round===e.round && r.driver_code===driver.driver_code); return <td key={e.round}>{points(r?.cumulative_points.low ?? driver.current_points)}–{points(r?.cumulative_points.high ?? driver.current_points)}</td> })}</tr></tbody></table></div></> : <p className={styles.rangeNote}>The season is complete. These are the final recorded standings.</p>}
          <p className={styles.smallPrint}>Absolute points floor: {points(driver.current_points)} · ceiling: {points(driver.maximum_points)}{!driver.active ? ' · no future starts assumed for this driver' : ''}. Assumes no future penalties.</p>
        </section>}
        <section id="season-outlook" aria-labelledby="outlook-heading">
          <div className={styles.sectionHeading}><div><span className={styles.kicker}>THE FULL GRID</span><h2 id="outlook-heading">WHERE COULD EVERYONE FINISH?</h2></div><span className={styles.muted}>Select a driver to follow their path above.</span></div>
          <div className={styles.scroll} tabIndex={0} role="region" aria-label="All-driver championship forecast"><table className={styles.standings}><caption className={styles.srOnly}>Projected championship standings. Best and worst are 10th and 90th position percentiles.</caption><thead><tr><th scope="col">PROJ.</th><th scope="col">DRIVER</th><th scope="col">NOW</th><th scope="col">PROJECTED PTS</th><th scope="col">TITLE CHANCE</th><th scope="col">BEST CASE</th><th scope="col">WORST CASE</th><th scope="col">FINISH RANGE</th></tr></thead><tbody>{data.drivers.map(d => <tr key={d.driver_code} className={d.driver_code===selectedDriver ? styles.selected : ''}>
            <td className={styles.place}>{position(d.projected_position)}</td><th scope="row"><button className={styles.driverButton} onClick={() => setSelectedDriver(d.driver_code)} aria-pressed={d.driver_code===selectedDriver}><span className={styles.teamMarker} style={{ background: teamColor(d.team) }} /><span><b>{d.driver_code}</b><small>{d.team}{!d.active ? ' · inactive' : ''}</small></span></button></th>
            <td>{points(d.current_points)}<small>P{d.current_position}</small></td><td><b>{points(d.points.mean)}</b><small>{points(d.points.low)}–{points(d.points.high)} range</small></td><td><span className={d.points_eliminated ? styles.muted : styles.probability}>{chance(d.title_probability,d.points_eliminated)}</span><div className={styles.probabilityTrack} aria-hidden="true"><span style={{ width: `${d.title_probability*100}%`, background: teamColor(d.team) }} /></div></td><td className={styles.best}>{position(d.position.low)}</td><td>{position(d.position.high)}</td><td><RankBand band={d.position} field={data.drivers.length} /></td>
          </tr>)}</tbody></table></div>
        </section>
        <section id="remaining-races" aria-labelledby="races-heading">
          <div className={styles.sectionHeading}><div><span className={styles.kicker}>ONE WEEKEND AT A TIME</span><h2 id="races-heading">THE REMAINING CALENDAR</h2></div><span className={styles.muted}>Each weekend is simulated within a complete season path.</span></div>
          {data.remaining.length === 0 ? <p className={styles.rangeNote}>No races remain on the recorded calendar.</p> : <>
            <div className={styles.racePicker} role="group" aria-label="Choose a remaining race">{data.remaining.map(e => <button key={e.round} onClick={() => setSelectedRound(e.round)} aria-pressed={selectedRound===e.round}><small>ROUND {e.round}{e.sprint_pending ? ' + SPRINT' : ''}</small><b>{shortRace(e.race_name)}</b><span>{new Date(e.race_start_utc).toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'UTC'})}</span></button>)}</div>
            {event && <div className={styles.eventTitle}><h3>{event.race_name}</h3><span>{event.circuit_name}{event.awaiting_results ? ' · awaiting complete results' : ''}</span></div>}
            <div className={styles.scroll} tabIndex={0} role="region" aria-label="Selected race forecast"><table className={styles.raceTable}><caption className={styles.srOnly}>All-driver forecast for {event?.race_name}</caption><thead><tr><th scope="col">DRIVER</th><th scope="col">RACE OUTLOOK</th><th scope="col">BEST CASE</th><th scope="col">WORST CASE</th><th scope="col">WEEKEND PTS</th><th scope="col">TITLE POSITION AFTER</th></tr></thead><tbody>{raceRows.map((r, index) => { const d=data.drivers.find(d => d.driver_code===r.driver_code)!; return <tr key={r.driver_code}><th scope="row"><button className={styles.driverButton} onClick={() => setSelectedDriver(r.driver_code)}><span className={styles.teamMarker} style={{background:teamColor(d.team)}} /><span><b>{r.driver_code}</b><small>{d.team}</small></span></button></th><td>{r.position.mean ? position(index + 1) : 'Sprint only'}<small>{r.position.mean ? `Average ${r.position.mean.toFixed(1)}` : 'Race already scored'}</small></td><td className={styles.best}>{r.position.low ? position(r.position.low) : '—'}</td><td>{r.position.high ? position(r.position.high) : '—'}</td><td>{points(r.points.mean)}<small>{points(r.points.low)}–{points(r.points.high)} range</small></td><td>{position(r.championship_position.median)}<small>{position(r.championship_position.low)}–{position(r.championship_position.high)} range</small></td></tr> })}</tbody></table></div>
          </>}
        </section>
        <details className={styles.method}><summary>How to read this forecast</summary>{data.warnings.map(w => <p key={w}>{w}</p>)}<p>Projected standings are ordered by average championship position across {data.simulations.toLocaleString()} simulated seasons. Points ranges and position ranges are marginal outcomes; everyone’s best case cannot happen together. Available points assume full-distance scoring, including any unscored sprints.</p><p>Snapshot: {new Date(data.generated_at).toLocaleString('en-GB')} · {data.model_version}. <a href="https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_a_general_provisions_-_iss_02_-_2026-02-27.pdf" target="_blank" rel="noopener noreferrer">FIA championship scoring and countback rules ↗</a></p></details>
      </>}
    </main>
    <Footer />
  </>
}
