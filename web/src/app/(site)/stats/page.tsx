import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { pageMetadata } from '@/lib/site-metadata'
import RecordBook from './RecordBook'
import StatsCharts from './StatsCharts'
import styles from './stats.module.css'

export const metadata = pageMetadata('F1 Stats & Records', 'Plot Kimi Antonelli’s race-by-race progress, compare 2025 and 2026 performance, and explore age records against the previous holders.', '/stats')

export default function StatsPage() {
  return <>
    <Header />
    <main id="main-content" className={styles.page}>
      <div className={styles.masthead}><span>STATS / THE RECORD ATLAS</span><span>ITA · CAR 12 · MERCEDES</span></div>
      <section className={styles.introduction} aria-labelledby="stats-title"><div><p className={styles.eyebrow}>The Kimi Antonelli collection</p><h1 id="stats-title">ONE KIMI.<br /><span>A WHOLE LOT OF HISTORY.</span></h1></div><p>The records, plotted.<br />Compare ages. Track the leap. Explore the season.</p></section>
      <StatsCharts />
      <details className={styles.atlasDisclosure}><summary>Explore the 229-claim record atlas</summary><RecordBook /></details>
      <p className={styles.editorial}>Edition reviewed 03 Nov 2026 · Through the 2026 Mexico City Grand Prix. The atlas maps the supplied 229-entry collection; primary-source links are attached only where checked. This is a dated editorial snapshot.</p>
    </main>
    <Footer />
  </>
}
