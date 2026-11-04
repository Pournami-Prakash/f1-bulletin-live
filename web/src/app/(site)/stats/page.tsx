import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { pageMetadata } from '@/lib/site-metadata'
import { SEASON_SOURCE } from '@/lib/kimi-season-data'
import Hero from './Hero'
import TitleRace from './TitleRace'
import RaceByRace from './RaceByRace'
import TheLeap from './TheLeap'
import TeammateDuel from './TeammateDuel'
import YoungestChampions from './YoungestChampions'
import RecordBook from './RecordBook'
import RecordWeekends from './RecordWeekends'
import MilestoneLadders from './MilestoneLadders'
import RecordMix from './RecordMix'
import styles from './kimi.module.css'

export const metadata = pageMetadata('F1 Stats & Records', 'Replay Kimi Antonelli’s 2026 title race, see every grid-to-flag comeback, compare his rookie and championship seasons, and explore the youngest world champions.', '/stats')

export default function StatsPage() {
  return <>
    <Header />
    <main id="main-content" className={styles.page}>
      <Hero />
      <TitleRace />
      <RaceByRace />
      <TheLeap />
      <TeammateDuel />
      <YoungestChampions />
      <section className={styles.section} aria-labelledby="record-book-title">
        <header className={styles.sectionHead}>
          <p className={styles.kicker}><span>06</span> The record book</p>
          <h2 id="record-book-title">229 lines of history.</h2>
          <p>A list of every record he has broken, plotted three ways: where they fell, the milestone ladders he climbed first, and who he was being compared with.</p>
        </header>
        <RecordWeekends />
        <MilestoneLadders />
        <RecordMix />
        <details className={styles.bookDisclosure}><summary>Browse all 229 lines</summary><RecordBook /></details>
      </section>
      <p className={styles.editorial}>Snapshot reviewed 3 Nov 2026, through the 2026 Mexico City Grand Prix. Results, qualifying and standings from the <a href={SEASON_SOURCE}>Jolpica F1 API</a>. Standings include sprint points; race charts show Grands Prix only.</p>
    </main>
    <Footer />
  </>
}
