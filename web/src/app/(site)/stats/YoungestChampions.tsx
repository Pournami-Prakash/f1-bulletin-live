'use client'

import { useState } from 'react'
import { youngestChampions } from '@/lib/kimi-stats'
import { useInView } from './hooks'
import styles from './kimi.module.css'

const min = 18
const max = 26
const ticks = [18, 20, 22, 24, 26]
const position = (age: number) => (age - min) / (max - min) * 100

export default function YoungestChampions() {
  const [ref, seen] = useInView<HTMLDivElement>()
  const [active, setActive] = useState('ANT')
  const kimi = youngestChampions[0]
  const selected = youngestChampions.find(item => item.short === active)!
  const gap = Math.round((selected.age.decimal - kimi.age.decimal) * 365.25)
  return <section id="youngest" className={styles.section} aria-labelledby="youngest-title">
    <header className={styles.sectionHead}>
      <p className={styles.kicker}><span>05</span> The record that matters most</p>
      <h2 id="youngest-title">The youngest world champions.</h2>
      <p>Age on the day each driver clinched his first title. Tap a name to measure the gap.</p>
    </header>
    <div ref={ref} className={styles.ladder} data-seen={seen}>
      <div className={styles.ladderAxis} aria-hidden="true">{ticks.map(tick => <span key={tick} style={{ left: `${position(tick)}%` }}>{tick}</span>)}</div>
      <ol>
        {youngestChampions.map((champion, index) => <li key={champion.short} data-kimi={index === 0}>
          <button type="button" aria-pressed={active === champion.short} onClick={() => setActive(champion.short)}>
            <span className={styles.ladderName}><b>{champion.name}</b><small>{champion.season}</small></span>
            <span className={styles.ladderTrack}>
              <i style={{ width: `${position(champion.age.decimal)}%`, transitionDelay: `${index * 90}ms` }} />
              <em style={{ left: `${position(champion.age.decimal)}%` }}>{champion.age.years}y {champion.age.days}d</em>
            </span>
          </button>
        </li>)}
      </ol>
      <p className={styles.ladderCallout} aria-live="polite">{selected.short === 'ANT'
        ? <>Pick a champion to see how much younger Kimi was when he clinched.</>
        : <>Kimi was <b>{Math.floor(gap / 365.25)} years, {Math.round(gap % 365.25)} days</b> younger than {selected.name} was in {selected.season}.</>}</p>
      <p className={styles.footnote}>Ages are calculated from birth date to the race where the title was mathematically won.</p>
    </div>
  </section>
}
