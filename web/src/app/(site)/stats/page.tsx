import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { pageMetadata } from '@/lib/site-metadata'
import { kimiRecords, RECORDS_THROUGH } from '@/lib/driver-records'
import RecordBook from './RecordBook'
import styles from './stats.module.css'

export const metadata = pageMetadata('F1 Stats & Records', 'Explore Kimi Antonelli’s career records, his record-breaking 2026 season, and the stories behind the numbers.', '/stats')

export default function StatsPage() {
  return <>
    <Header />
    <main id="main-content" className={styles.page}>
      <div className={styles.masthead}><span>STATS / THE RECORD BOOK</span><span>VOL. 01 · KIMI ANTONELLI</span></div>
      <section className={styles.hero} aria-labelledby="stats-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Bologna’s own. History’s youngest.</p>
          <h1 id="stats-title">KIMI.<br /><span>REWRITING</span><br />THE RECORDS.</h1>
          <p className={styles.intro}>Some careers fill a trophy cabinet. This one is already rearranging the history books.</p>
          <a className={styles.jump} href="#record-book">Open the record book <span aria-hidden="true">↘</span></a>
        </div>
        <aside className={styles.cover} aria-label="Kimi Antonelli, youngest Formula 1 World Champion">
          <div className={styles.coverTop}><span>ANDREA KIMI ANTONELLI</span><span>ITA / 12</span></div>
          <div className={styles.twelve} aria-hidden="true">12</div>
          <div className={styles.champion}><span>2026 WORLD CHAMPION</span><strong>20 YEARS.<br />68 DAYS.</strong><p>The youngest to take the crown.</p></div>
          <a href="https://www.guinnessworldrecords.com/world-records/youngest-formula-one-world-champion">Mexico City · 01 Nov 2026 <span aria-hidden="true">↗</span></a>
        </aside>
      </section>
      <div className={styles.edition}><span>THE KIMI COLLECTION</span><p>Career highlights, through the {RECORDS_THROUGH}.</p><span>REVIEWED 03 NOV 2026</span></div>
      <RecordBook records={kimiRecords} />
      <section className={styles.extra} aria-labelledby="trivia-title">
        <div><p className={styles.eyebrow}>A little perspective</p><h2 id="trivia-title">ONE RECORD<br />STILL IN MAX’S HANDS.</h2></div>
        <details className={styles.trivia}><summary>Is Kimi the youngest Grand Prix winner, too? <span aria-hidden="true">+</span></summary><p>No. Max Verstappen retains that record. Kimi’s China victory made him the second-youngest Grand Prix winner, while setting the record for the youngest winner <em>from pole</em>.</p><a href="https://www.fia.com/news/f1-antonelli-takes-first-grand-prix-win-ahead-russell-and-hamilton">FIA · China race report ↗</a></details>
      </section>
      <p className={styles.editorial}>A curated collection, not an exhaustive list. “Career” includes junior racing; “2026” shows records achieved this season. Each entry links to its source. This edition is a dated snapshot, not a live records feed.</p>
    </main>
    <Footer />
  </>
}
