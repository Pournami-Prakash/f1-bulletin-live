'use client'

import { kimiStanding } from '@/lib/kimi-season-data'
import { seasonSummary } from '@/lib/kimi-stats'
import { useChartWidth, useInView } from './hooks'
import styles from './kimi.module.css'

const rookie = seasonSummary(2025)
const champion = seasonSummary(2026)
type Row = { label: string; before: number; after: number; format?: (n: number) => string; lowerIsBetter?: boolean; scale?: number }
const rows: Row[] = [
  { label: 'Wins', before: rookie.wins, after: champion.wins },
  { label: 'Podiums', before: rookie.podiums, after: champion.podiums },
  { label: 'Poles', before: rookie.poles, after: champion.poles },
  { label: 'Fastest laps', before: rookie.fastestLaps, after: champion.fastestLaps },
  { label: 'Points per GP weekend', before: rookie.pointsPerRace, after: champion.pointsPerRace, format: n => n.toFixed(1), scale: 25 },
  { label: 'Average finish', before: rookie.averageFinish, after: champion.averageFinish, format: n => `P${n.toFixed(1)}`, lowerIsBetter: true },
  { label: 'Average qualifying', before: rookie.averageQuali, after: champion.averageQuali, format: n => `P${n.toFixed(1)}`, lowerIsBetter: true },
]
// Bars show strength, so lower-is-better rows invert onto the same 0–1 scale (P1 = full bar).
const strength = (row: Row, value: number) => row.lowerIsBetter ? (20 - value) / 19 : value / (row.scale ?? Math.max(row.before, row.after, 1))

function PointsPace() {
  const [ref, width] = useChartWidth<HTMLDivElement>(520)
  const height = width < 480 ? 130 : 220
  const pad = { left: 34, right: 54, top: 12, bottom: 26 }
  const x = (r: number) => pad.left + (r - 1) / 23 * (width - pad.left - pad.right)
  const y = (p: number) => pad.top + (1 - p / 400) * (height - pad.top - pad.bottom)
  const path = (year: 2025 | 2026) => kimiStanding[year].map(([points], index) => `${index ? 'L' : 'M'}${x(index + 1).toFixed(1)},${y(points).toFixed(1)}`).join('')
  const sameRound = kimiStanding[2025][kimiStanding[2026].length - 1][0]
  return <figure className={styles.pace}>
    <figcaption><b>Points pace</b> After {kimiStanding[2026].length} rounds: <span className={styles.rookieText}>{sameRound} as a rookie</span> vs <span className={styles.champText}>{champion.points} as champion</span>.</figcaption>
    <div ref={ref} className={styles.plotBox}>
      <svg width={width} height={height} role="img" aria-label={`Cumulative championship points by round. 2025: ${rookie.points} after 24 rounds. 2026: ${champion.points} after ${champion.races} rounds.`}>
        {[0, 100, 200, 300, 400].map(tick => <g key={tick} className={styles.grid}><line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} /><text x={pad.left - 8} y={y(tick) + 4} textAnchor="end">{tick}</text></g>)}
        {[1, 6, 12, 18, 24].map(r => <text key={r} x={x(r)} y={height - 6} textAnchor="middle" className={styles.axisLabel}>R{r}</text>)}
        <path d={path(2025)} fill="none" stroke="var(--c-rookie)" strokeWidth="2.5" strokeDasharray="5 4" />
        <path d={path(2026)} fill="none" stroke="var(--c-ant)" strokeWidth="4" strokeLinejoin="round" className={styles.kimiLine} />
        <text x={x(24) + 6} y={y(rookie.points) + 4} className={styles.seriesLabel} fill="var(--c-rookie)">2025</text>
        <text x={x(champion.races) + 8} y={y(champion.points) + 4} className={styles.seriesLabel} fill="var(--c-ant)">2026</text>
      </svg>
    </div>
  </figure>
}

export default function TheLeap() {
  const [ref, seen] = useInView<HTMLDivElement>()
  return <section id="the-leap" className={styles.section} aria-labelledby="leap-title">
    <header className={styles.sectionHead}>
      <p className={styles.kicker}><span>03</span> Rookie vs champion</p>
      <h2 id="leap-title">P{rookie.championshipPosition} to P{champion.championshipPosition} in one winter.</h2>
      <p>Same driver, same team, twelve months apart. Bars grow toward “better”.</p>
    </header>
    <div className={styles.leapLayout}>
      <div ref={ref} className={styles.butterfly} data-seen={seen}>
        <div className={styles.butterflyHead}><span className={styles.rookieText}>2025 · Rookie</span><span className={styles.champText}>2026 · Champion</span></div>
        {rows.map(row => {
          const format = row.format ?? String
          return <div key={row.label} className={styles.butterflyRow}>
            <span className={styles.bValue}>{format(row.before)}</span>
            <span className={styles.bTrack} data-side="left"><i style={{ width: `${strength(row, row.before) * 100}%` }} /></span>
            <span className={styles.bLabel}>{row.label}</span>
            <span className={styles.bTrack} data-side="right"><i style={{ width: `${strength(row, row.after) * 100}%` }} /></span>
            <span className={styles.bValue}>{format(row.after)}</span>
          </div>
        })}
      </div>
      <PointsPace />
    </div>
  </section>
}
