'use client'

import { earliestTitles, italianDroughts, titleFirsts, titleSources } from '@/lib/title-milestones'
import { useInView } from './hooks'
import styles from './kimi.module.css'

const year = 2026
const longest = Math.max(...italianDroughts.map(item => year - item.from))
const mostLeft = earliestTitles[0].left
const sources = [...new Set([...italianDroughts, ...titleFirsts].map(item => item.source))].map(id => titleSources[id])

export default function TitleContext() {
  const [ref, seen] = useInView<HTMLDivElement>()
  return <section id="title-context" className={styles.section} aria-labelledby="title-context-title">
    <header className={styles.sectionHead}>
      <p className={styles.kicker}><span>06</span> What the title ended</p>
      <h2 id="title-context-title">Waits that ended in 2026.</h2>
      <p>Beyond the age record: the Italian droughts he closed and where his title sits in history.</p>
    </header>
    <div ref={ref} className={styles.contextLayout} data-seen={seen}>
      <figure className={styles.contextCard}>
        <figcaption><b>Italian droughts, in years</b><span>Time since an Italian last did it</span></figcaption>
        <ol className={styles.waitBars}>
          {italianDroughts.map((item, index) => {
            const wait = year - item.from
            return <li key={item.id}>
              <span>{item.label}<small>Last: {item.last} {item.from}</small></span>
              <span className={styles.waitTrack}><i style={{ width: `${wait / longest * 100}%`, transitionDelay: `${index * 120}ms` }} /></span>
              <b>{wait}<small> yrs</small></b>
            </li>
          })}
        </ol>
      </figure>
      <figure className={styles.contextCard}>
        <figcaption><b>Races left at the clinch</b><span>The earliest titles, by Grands Prix still to run</span></figcaption>
        <ol className={styles.clinchBars}>
          {earliestTitles.map(item => <li key={`${item.driver}-${item.year}`} data-kimi={'kimi' in item}>
            <span>{item.driver} <small>{item.year}</small></span>
            <span className={styles.waitTrack}><i style={{ width: `${item.left / mostLeft * 100}%` }} /></span>
            <b>{item.left}</b>
          </li>)}
        </ol>
      </figure>
      <ul className={styles.firsts} aria-label="Title firsts">
        {titleFirsts.map(item => <li key={item.id}>
          <strong>{item.value}</strong>
          <span>{item.label}</span>
          <small>{item.note}</small>
        </li>)}
      </ul>
    </div>
    <p className={styles.footnote}>Sources: {sources.map((source, index) => <span key={source.url}>{index ? ' · ' : ''}<a href={source.url}>{source.name}</a></span>)}.</p>
  </section>
}
