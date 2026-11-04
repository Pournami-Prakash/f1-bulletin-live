'use client'

import { useState } from 'react'
import { seasons } from '@/lib/kimi-season-data'
import { headToHead, type Season } from '@/lib/kimi-stats'
import styles from './kimi.module.css'

export default function TeammateDuel() {
  const [year, setYear] = useState<Season>(2026)
  const score = headToHead(year)
  const races = seasons[year]
  const rows = [
    { id: 'quali', label: 'Qualifying', score: score.quali, ahead: (race: (typeof races)[number]) => race.quali !== null && race.teammateQuali !== null ? race.quali < race.teammateQuali : null },
    { id: 'race', label: 'Race finish', score: score.race, ahead: (race: (typeof races)[number]) => race.teammateFinish !== null ? race.finish < race.teammateFinish : null },
  ]
  return <section id="teammates" className={styles.section} aria-labelledby="duel-title">
    <header className={styles.sectionHead}>
      <p className={styles.kicker}><span>04</span> Inside the garage</p>
      <h2 id="duel-title">Kimi vs George.</h2>
      <p>The only driver with the same car. Who came out ahead, race by race.</p>
    </header>
    <div className={styles.segmented} role="group" aria-label="Season">
      {([2026, 2025] as const).map(item => <button type="button" key={item} aria-pressed={year === item} onClick={() => setYear(item)}>{item}</button>)}
    </div>
    <div className={styles.duel}>
      {rows.map(row => {
        const total = row.score.kimi + row.score.teammate
        return <div key={row.id} className={styles.duelRow}>
          <div className={styles.duelScore}>
            <span className={styles.champText}><b>{row.score.kimi}</b> Antonelli</span>
            <h3>{row.label}</h3>
            <span className={styles.rusText}>Russell <b>{row.score.teammate}</b></span>
          </div>
          <div className={styles.tug} role="img" aria-label={`${row.label} ${year}: Antonelli ahead ${row.score.kimi} times, Russell ahead ${row.score.teammate} times.`}>
            <i style={{ width: `${row.score.kimi / total * 100}%` }} /><i style={{ width: `${row.score.teammate / total * 100}%` }} />
            <span className={styles.tugMid} aria-hidden="true" />
          </div>
          <ol className={styles.duelDots} aria-hidden="true">
            {races.map(race => { const ahead = row.ahead(race); return <li key={race.round} title={`R${race.round} ${race.race}: ${ahead === null ? 'no comparison' : ahead ? 'Antonelli ahead' : 'Russell ahead'}`} data-ahead={ahead === null ? 'none' : ahead ? 'kimi' : 'george'} /> })}
          </ol>
        </div>
      })}
      <p className={styles.footnote}>Each square is one Grand Prix weekend, in calendar order. Teal: Kimi ahead. Silver: George ahead.</p>
    </div>
  </section>
}
