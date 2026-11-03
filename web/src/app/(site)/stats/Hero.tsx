'use client'

import { seasonSummary, youngestChampions } from '@/lib/kimi-stats'
import { titleRace2026 } from '@/lib/kimi-season-data'
import { useCountUp, useInView } from './hooks'
import styles from './kimi.module.css'

const season = seasonSummary(2026)
const [kimi, vettel] = youngestChampions
const gapDays = Math.round((vettel.age.decimal - kimi.age.decimal) * 365.25)
const rivals = Object.entries(titleRace2026).filter(([code]) => code !== 'ANT').map(([, points]) => points.at(-1)!)
const margin = season.points - Math.max(...rivals)

const tiles = [
  { value: season.wins, label: 'Grand Prix wins', note: `from ${season.races} races` },
  { value: season.poles, label: 'Pole positions', note: 'Saturday speed' },
  { value: season.podiums, label: 'Podiums', note: `${Math.round(season.podiums / season.races * 100)}% of races` },
  { value: season.points, label: 'Points', note: 'with sprints' },
  { value: margin, label: 'Point lead', note: 'over P2', prefix: '+' },
]

function Tile({ tile, run, index }: { tile: (typeof tiles)[number]; run: boolean; index: number }) {
  const value = useCountUp(tile.value, run, 900 + index * 150)
  return <li className={styles.tile}>
    <strong>{tile.prefix}{Math.round(value)}</strong>
    <span>{tile.label}</span>
    <small>{tile.note}</small>
  </li>
}

export default function Hero() {
  const [ref, seen] = useInView<HTMLElement>(0.1)
  const days = useCountUp(kimi.age.days, seen, 1400)
  return <section ref={ref} className={styles.hero} aria-labelledby="stats-title">
    <div className={styles.heroTop}>
      <div>
        <p className={styles.eyebrow}><span className={styles.pulse} aria-hidden="true" />Stats · The Kimi Antonelli file</p>
        <h1 id="stats-title" className={styles.heroTitle}>The youngest<br /><span>champion ever.</span></h1>
        <p className={styles.heroLede}>Rookie in 2025. World champion in 2026. Here are the numbers, plotted and playable.</p>
      </div>
      <div className={styles.ageBadge} aria-label={`Age at title: ${kimi.age.years} years ${kimi.age.days} days`}>
        <p>Age when he clinched it</p>
        <strong aria-hidden="true">{kimi.age.years}<small>Y</small> {Math.round(days)}<small>D</small></strong>
        <p className={styles.ageGap}><b>{Math.floor(gapDays / 365.25)}y {Math.round(gapDays % 365.25)}d</b> younger than Vettel’s 2010 record</p>
        <p className={styles.ageWhere}>Mexico City GP · 1 Nov 2026 · Car 12</p>
      </div>
    </div>
    <ul className={styles.tiles} aria-label="2026 season in numbers">
      {tiles.map((tile, index) => <Tile key={tile.label} tile={tile} run={seen} index={index} />)}
    </ul>
    <nav className={styles.jumps} aria-label="Jump to a chart">
      {[['#title-race', '▶ Replay the title race'], ['#race-by-race', 'Grid → flag'], ['#the-leap', 'Rookie vs champion'], ['#teammates', 'Kimi vs George'], ['#youngest', 'Youngest champions'], ['#record-book', 'Record book']].map(([href, label]) => <a key={href} href={href}>{label}</a>)}
    </nav>
  </section>
}
