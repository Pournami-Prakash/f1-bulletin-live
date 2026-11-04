import { useState, type CSSProperties } from 'react'
import { reachablePositions, type ChampionshipForecast, type ChampionshipDriver } from '@/lib/championship'
import styles from './championship.module.css'

export default function PositionBattles({ data, champion, names, color, onDriver }: {
  data: ChampionshipForecast; champion: ChampionshipDriver; names: Record<string, string>
  color: (team: string) => string; onDriver: (code: string) => void
}) {
  const [target, setTarget] = useState(2)
  const standings = [...data.drivers].sort((a, b) => a.current_position - b.current_position)
  const remaining = standings.filter(d => d.driver_code !== champion.driver_code)
  const rows = remaining.filter(d => {
    const bounds = reachablePositions(d, data.drivers)
    return bounds.best <= target && bounds.worst >= target
  })
  // Fit the selected battle, preserving every non-zero sampled outcome.
  const supported = rows.flatMap(d => [d.current_position, ...d.position_probabilities.flatMap((p, i) => p > 0 ? [i + 1] : [])])
  const first = Math.min(target, ...supported)
  const last = Math.max(target, ...supported)
  const ranks = Array.from({ length: last - first + 1 }, (_, i) => first + i)
  const x = (rank: number) => 20 + (rank - first) / Math.max(1, last - first) * 600
  const points = (n: number) => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 }).format(n)
  return <section className={styles.positionBattles} aria-labelledby="position-battles-heading">
    <div className={styles.fightHeading}>
      <div><span className={styles.kicker}>{data.remaining.length ? 'STILL TO PLAY FOR' : 'FINAL CLASSIFICATION'}</span><h2 id="position-battles-heading">{data.remaining.length ? 'The battle for the remaining places' : 'Where everyone finished'}</h2></div>
      <label className={styles.battleSelect}>Focus on position<select value={target} onChange={e => setTarget(Number(e.target.value))}>
        {remaining.map((_, i) => <option key={i} value={i + 2}>P{i + 2}{i === 0 ? ' · Runner-up' : i === 1 ? ' · Final podium place' : ''}</option>)}
      </select></label>
    </div>
    <p className={styles.fightNote}>{data.remaining.length ? `${rows.length} drivers can still reach P${target} on points. Ties remain in contention pending countback.` : `Recorded results for P${target}.`}</p>
    <div className={styles.battleLegend}><span><i />Current position</span><span><i />Simulated average</span><span><i />Middle 80% of scenarios</span></div>
    <p className={styles.rosterNote}>The chart is an uncalibrated season simulation. It shows a range of outcomes, not a promised finishing order.</p>
    <div className={styles.battleAxis} aria-hidden="true"><span>Driver / points / gap ahead</span><svg viewBox="0 0 640 28">{ranks.map((rank, i) => i % Math.max(1, Math.ceil((ranks.length - 1) / 7)) === 0 || i === ranks.length - 1 ? <text key={rank} x={x(rank)} y="18" textAnchor="middle">P{rank}</text> : null)}</svg><span>Season outlook</span></div>
    {rows.map(d => {
      const ahead = standings.find(r => r.current_position === d.current_position - 1)
      const gap = ahead ? ahead.current_points - d.current_points : 0
      const support = d.position_probabilities.flatMap((p, i) => p > 0 ? [i + 1] : [])
      return <button key={d.driver_code} className={styles.battleRow} style={{ '--team': color(d.team) } as CSSProperties} onClick={() => onDriver(d.driver_code)} aria-label={`Explore ${names[d.driver_code] ?? d.driver_code} championship outlook`} aria-controls="season-explorer">
        <span className={styles.pointsIdentity}><b>P{d.current_position} · {names[d.driver_code] ?? d.driver_code}</b><small>{points(d.current_points)} pts · {d.current_position === 2 ? 'Current runner-up' : gap === 0 ? 'Level on points with driver ahead' : `${points(gap)} pts to P${d.current_position - 1}`}{!d.active ? ' · Inactive' : ''}</small></span>
        <span className={styles.battlePlot} role="img" aria-label={`${d.driver_code}: current P${d.current_position}, simulated average P${d.position.mean.toFixed(1)}, middle 80% P${d.position.low} to P${d.position.high}`}>
          <svg viewBox="0 0 640 48" aria-hidden="true">
            <line x1="20" x2="620" y1="24" y2="24" className={styles.pointsBaseline} />
            <line x1={x(target)} x2={x(target)} y1="3" y2="45" className={styles.pointsLeader} />
            {support.length > 0 && <line x1={x(Math.min(...support))} x2={x(Math.max(...support))} y1="24" y2="24" stroke="var(--team)" strokeWidth="2" opacity=".4" />}
            <line x1={x(d.position.low)} x2={x(d.position.high)} y1="24" y2="24" stroke="var(--team)" strokeWidth="10" opacity=".45" />
            <path d={`M${x(d.current_position)},17 l7,7 -7,7 -7,-7 Z`} fill="var(--bg)" stroke="var(--team)" strokeWidth="2" />
            <circle cx={x(d.position.mean)} cy="24" r="5" fill="var(--team)" />
          </svg>
        </span>
        <span className={styles.battleOutcome}><b>P{d.position.low}{d.position.high !== d.position.low ? `–P${d.position.high}` : ''}</b><small>{data.remaining.length ? 'Middle 80% · explore ↗' : 'Recorded finish · explore ↗'}</small></span>
      </button>
    })}
  </section>
}
