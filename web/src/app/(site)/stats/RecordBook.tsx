'use client'

import { useState } from 'react'
import type { DriverRecord } from '@/lib/driver-records'
import styles from './stats.module.css'

const filters = [{ id: 'career', label: 'Whole career' }, { id: '2026', label: '2026 season' }, { id: 'earlier', label: 'Before 2026' }] as const
export default function RecordBook({ records }: { records: DriverRecord[] }) {
  const [filter, setFilter] = useState<(typeof filters)[number]['id']>('2026')
  const visible = records.filter(record => filter === 'career' || (filter === '2026' ? record.year === 2026 : record.year < 2026))
  return <section id="record-book" className={styles.book} aria-labelledby="book-title">
    <div className={styles.bookHeading}><div><p className={styles.eyebrow}>The milestones that moved the bar</p><h2 id="book-title">{filter === '2026' ? 'WHAT A YEAR.' : filter === 'earlier' ? 'BEFORE THE CROWN.' : 'THE STORY SO FAR.'}</h2></div>
      <div className={styles.filters} role="group" aria-label="Record period">{filters.map(item => <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}</button>)}</div>
    </div>
    <p className={styles.count} role="status">{visible.length} selected records · {filter === 'career' ? '2024–2026' : filter === 'earlier' ? '2024–2025' : '2026'} · earliest first</p>
    <ol className={styles.records}>{visible.map((record, index) => <li key={record.id}>
      <article className={styles.record} aria-labelledby={`record-${record.id}`}>
        <span className={styles.recordNumber}>{String(index + 1).padStart(2, '0')}</span>
        <div className={styles.recordMain}><div className={styles.recordMeta}><time dateTime={record.date}>{new Date(`${record.date}T12:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })}</time><span>{record.category}</span></div><h3 id={`record-${record.id}`}>{record.title}</h3><p>{record.detail}</p><div className={styles.recordFoot}><span>{record.event}</span><a href={record.source.url} aria-label={`Source for ${record.title}: ${record.source.name}`}>Source · {record.source.name} <span aria-hidden="true">↗</span></a></div></div>
        <span className={styles.recordMark} aria-hidden="true">{record.mark}</span>
      </article>
    </li>)}</ol>
  </section>
}
