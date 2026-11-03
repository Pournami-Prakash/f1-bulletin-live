'use client'

import { useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { recordClaims, recordLenses, recordMoments, type Lens } from '@/lib/record-atlas'
import styles from './stats.module.css'

const periods = [{ id: 'all', label: 'Whole F1 career' }, { id: '2026', label: '2026' }, { id: '2025', label: '2025' }, { id: 'unstated', label: 'Year unstated / mixed' }] as const
export default function RecordBook() {
  const [period, setPeriod] = useState<string>('all')
  const [lens, setLens] = useState<Lens | null>(null)
  const [momentId, setMomentId] = useState<string>('monaco26')
  const [claimId, setClaimId] = useState<string | null>(null)
  const refs = useRef(new Map<string, HTMLButtonElement>())
  const inspectorRef = useRef<HTMLElement>(null)
  const moment = recordMoments.find(item => item.id === momentId)!
  const visible = recordClaims.filter(claim => (period === 'all' || (period === 'unstated' ? claim.year === null : claim.year === Number(period))) && (!lens || claim.lens === lens))
  const selected = visible.find(claim => claim.id === claimId)
  const related = visible.filter(claim => claim.momentIds.includes(moment.id))
  const linked = visible.filter(claim => claim.source).length
  const ordered = recordLenses.flatMap(group => visible.filter(claim => claim.lens === group.id))
  const tabStop = selected?.id ?? ordered[0]?.id
  function navigate(event: KeyboardEvent<HTMLButtonElement>, id: string) {
    const index = ordered.findIndex(claim => claim.id === id)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? ordered.length - 1 : ['ArrowRight', 'ArrowDown'].includes(event.key) ? (index + 1) % ordered.length : ['ArrowLeft', 'ArrowUp'].includes(event.key) ? (index + ordered.length - 1) % ordered.length : null
    if (next !== null) { event.preventDefault(); setClaimId(ordered[next].id); refs.current.get(ordered[next].id)?.focus() }
  }
  return <section id="record-book" className={styles.explorer} aria-labelledby="atlas-title">
    <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>01 / Follow the moments</p><h2 id="atlas-title">THE DOMINO EFFECT.</h2></div><p>One weekend can rewrite several lines in the record book.</p></div>
    <div className={styles.momentTrack} role="group" aria-label="Explore career moments">
      {recordMoments.map(item => <button type="button" key={item.id} aria-pressed={momentId === item.id} onClick={() => { setMomentId(item.id); setClaimId(null) }}><span className={styles.momentYear}>{item.year} · {item.date}</span><span className={styles.momentDot}>{item.glyph}</span><span className={styles.momentLabel}>{item.label}</span></button>)}
    </div>
    <p className={styles.trackNote}>Chronological stops, equally spaced. Select a moment to highlight related claims below.</p>
    <div className={styles.atlasHeading}><div><p className={styles.eyebrow}>02 / Explore the record atlas</p><h2>THE BIGGER PICTURE.</h2></div><div className={styles.filters} role="group" aria-label="Claim period">{periods.map(item => <button type="button" key={item.id} aria-pressed={period === item.id} onClick={() => { setPeriod(item.id); setClaimId(null) }}>{item.label}</button>)}</div></div>
    <div className={styles.atlasSummary}><p role="status"><strong>{visible.length}</strong> list entries <span>· {linked} linked to primary sources here</span></p><button type="button" disabled={!lens} onClick={() => { setLens(null); setClaimId(null) }}>All lenses {lens ? '↺' : '✓'}</button></div>
    <div className={styles.atlasLayout}>
      <div>
        <div className={styles.clusters} aria-label="Record claim atlas">
          {recordLenses.filter(group => !lens || group.id === lens).map(group => {
            const claims = visible.filter(claim => claim.lens === group.id)
            return <section className={styles.cluster} style={{ '--cluster-color': group.color } as CSSProperties} key={group.id} aria-label={`${group.label}: ${claims.length} entries`}>
              <button type="button" className={styles.clusterHeading} aria-pressed={lens === group.id} onClick={() => { setLens(lens === group.id ? null : group.id); setClaimId(null) }}><span>{group.label}</span><strong>{claims.length}</strong></button>
              <div className={styles.dots} role="group" aria-label={`${group.label} claims`}>{claims.map(claim => <button type="button" key={claim.id} ref={node => { if (node) refs.current.set(claim.id, node); else refs.current.delete(claim.id) }} tabIndex={claim.id === tabStop ? 0 : -1} title={claim.text} aria-label={claim.text} aria-pressed={claim.id === selected?.id} data-linked={!!claim.source} data-related={claim.momentIds.includes(moment.id)} className={styles.dot} onFocus={() => setClaimId(claim.id)} onClick={() => { setClaimId(claim.id); if (window.innerWidth <= 700) inspectorRef.current?.scrollIntoView({ block: 'start' }) }} onKeyDown={event => navigate(event, claim.id)}><span /></button>)}</div>
              {!claims.length && <p className={styles.empty}>No entries in this period.</p>}
            </section>
          })}
        </div>
        <div className={styles.legend}><span><i className={styles.solidDot} /> Primary-source link</span><span><i className={styles.ringDot} /> Supplied claim</span><span><i className={styles.dimDot} /> Other moment / no moment stated</span></div>
        <p className={styles.mapNote}>One dot = one line from your list. Combined lines stay together. Categories are browsing lenses, not independent records. Use arrow keys to move between dots.</p>
      </div>
      <aside ref={inspectorRef} className={styles.inspector} aria-label="Record detail" aria-live="polite">
        {selected ? <>
          <p className={styles.inspectorLabel}>{recordLenses.find(group => group.id === selected.lens)?.label} / {selected.id.replace('claim-', '#')}</p>
          <div className={styles.inspectorGlyph} aria-hidden="true">{selected.source ? '↗' : '◌'}</div>
          <p className={styles.sourceBadge}>{selected.source ? 'PRIMARY SOURCE LINKED' : 'FROM YOUR SUPPLIED LIST'}</p>
          <h3>{selected.sourceTitle ?? selected.text.split(':')[0]}</h3>
          <p>{selected.sourceDetail ?? selected.text}</p>
          {selected.source ? <a href={selected.source.url}>Read {selected.source.name} ↗</a> : <p className={styles.unverified}>This claim has not been independently verified here.</p>}
          {selected.source && <details className={styles.original}><summary>Original wording</summary><p>{selected.text}</p></details>}
          <button type="button" className={styles.backToMoment} onClick={() => setClaimId(null)}>← Back to {moment.label.toLowerCase()}</button>
        </> : <>
          <p className={styles.inspectorLabel}>{moment.year} / {moment.label}</p>
          <div className={styles.inspectorGlyph} aria-hidden="true">{moment.glyph}</div>
          <p className={styles.sourceBadge}>SOURCED CAREER MOMENT</p>
          <h3>{moment.title}</h3><p>{moment.note}</p>
          {moment.id === 'monaco26' && <div className={styles.slam} aria-label="Grand Slam: pole, win, fastest lap, every lap led">{['POLE', 'WIN', 'FASTEST LAP', 'ALL LAPS LED'].map(label => <span key={label}><b aria-hidden="true">✓</b>{label}</span>)}</div>}
          {moment.id === 'monza26' && <div className={styles.recovery} aria-label="Grid position 19 to finishing position 1"><span>P19</span><i aria-hidden="true" /><span>P1</span></div>}
          <a href={moment.source}>Read the primary source ↗</a>
          <div className={styles.relatedCount}><strong>{related.length}</strong><span>related list entries in this view<br />Different lenses can overlap.</span></div>
          <p className={styles.inspectorHint}>Tap a dot to inspect its exact claim.</p>
        </>}
      </aside>
    </div>
    <div className={styles.method}><strong>229 claims ≠ 229 separate breakthroughs.</strong><p>The supplied collection mixes outright records, age thresholds, team and nationality subsets, ties, and unofficial claims. The atlas preserves all 229 lines without expanding “youngest to 2, 3, 4…” into extra dots. Year filters use only years explicitly written in each line.</p></div>
  </section>
}
