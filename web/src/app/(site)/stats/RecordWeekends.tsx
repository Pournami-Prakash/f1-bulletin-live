'use client'

import { useState, type KeyboardEvent } from 'react'
import { recordGroups, recordScopes, weekendTally, weekends } from '@/lib/kimi-record-insights'
import { ageAt, circuitCode } from '@/lib/kimi-stats'
import { useChartWidth } from './hooks'
import AgeStrip from './AgeStrip'
import styles from './records.module.css'
import kimi from './kimi.module.css'

const order = recordGroups.map(group => group.id)
const records = new Map(weekendTally.map(entry => [entry.weekend.id, [...entry.records].sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group))]))
const active = weekends.filter(weekend => records.has(weekend.id))
const busiest = weekendTally.slice(0, 6)
const tied = weekendTally.reduce((sum, entry) => sum + entry.records.length, 0)
const scopeLabel = Object.fromEntries(recordScopes.map(scope => [scope.id, scope.label]))
// The card names the weekend once, so drop a line's trailing “(Place 2026)” or “(2026)”.
const withoutWeekend = (detail: string) => detail.replace(/\s*\((?:[^(),\d–]+ )?202[56]\)$/, '')
const age = (date: string) => { const value = ageAt('2006-08-25', date); return `${value.years}y ${value.days}d` }

export default function RecordWeekends() {
  const [selected, setSelected] = useState(weekendTally[0].weekend.id)
  const [ref, width] = useChartWidth<HTMLDivElement>()
  const compact = width < 640
  const pitch = compact ? 6 : 11
  const radius = compact ? 2.6 : 4.2
  // The top band holds the selected weekend's code above the tallest column's count.
  const pad = { left: 2, right: 2, top: compact ? 30 : 40, bottom: compact ? 34 : 40 }
  const column = (width - pad.left - pad.right) / weekends.length
  const tallest = weekendTally[0].records.length
  const base = pad.top + tallest * pitch
  const height = base + pad.bottom
  const x = (index: number) => pad.left + (index + 0.5) * column
  const weekend = weekends.find(item => item.id === selected)!
  const list = records.get(selected) ?? []
  // Narrow columns can't fit a count beside a neighbour, so phones label only the selected one.
  const labelled = new Set(weekendTally.slice(0, compact ? 0 : 8).map(entry => entry.weekend.id))

  const move = (event: KeyboardEvent) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    event.preventDefault()
    const at = active.findIndex(item => item.id === selected)
    setSelected(active[Math.max(0, Math.min(active.length - 1, at + step))].id)
  }

  return <section id="record-book" className={`${kimi.section} ${styles.records}`} aria-labelledby="record-book-title">
    <header className={kimi.sectionHead}>
      <p className={kimi.kicker}><span>07</span> The record book</p>
      <h2 id="record-book-title">Where the records fell.</h2>
      <p>One column per race weekend, one dot per record.</p>
    </header>
    <div className={styles.weekendLayout}>
      <div className={styles.weekendMain}>
        <ul className={styles.legend} aria-label="Record groups">
          {recordGroups.map(group => <li key={group.id} data-group={group.id}><i aria-hidden="true" />{group.label}</li>)}
        </ul>
        <div ref={ref} className={styles.plot} tabIndex={0} role="group" aria-label="Records per race weekend. Use the left and right arrow keys to move between weekends." onKeyDown={move}>
          <svg width={width} height={height} role="img" aria-label={`Records per race weekend. Busiest: ${busiest.map(entry => `${entry.weekend.race} GP ${entry.weekend.year}, ${entry.records.length}`).join('; ')}.`}>
            {weekends.map((item, index) => {
              const dots = records.get(item.id) ?? []
              const isSelected = item.id === selected
              return <g key={item.id} className={styles.column} data-selected={isSelected} onClick={() => dots.length && setSelected(item.id)} style={{ cursor: dots.length ? 'pointer' : 'default' }}>
                <rect className={styles.columnHit} x={x(index) - column / 2} y={4} width={column} height={base + 8} rx={4} />
                <line className={styles.tick} x1={x(index)} x2={x(index)} y1={base + 3} y2={base + 7} />
                {dots.map((record, stack) => <circle key={record.id} data-group={record.group} cx={x(index)} cy={base - pitch / 2 - stack * pitch} r={radius} />)}
                {dots.length > 0 && (labelled.has(item.id) || isSelected) && <text className={styles.count} x={x(index)} y={base - dots.length * pitch - 6} textAnchor="middle">{dots.length}</text>}
                {isSelected && <text className={styles.code} x={x(index)} y={compact ? 10 : 16} textAnchor="middle">{circuitCode(item.circuit)} ’{String(item.year).slice(2)}</text>}
              </g>
            })}
            <AgeStrip x={x} column={column} y={base + 12} />
          </svg>
        </div>
        <div className={styles.busiest} role="group" aria-label="Busiest weekends">
          {busiest.map(entry => <button type="button" key={entry.weekend.id} aria-pressed={entry.weekend.id === selected} onClick={() => setSelected(entry.weekend.id)}>
            <b>{entry.records.length}</b>{entry.weekend.race} ’{String(entry.weekend.year).slice(2)}
          </button>)}
        </div>
      </div>
      <article className={styles.weekendCard} aria-live="polite">
        <header>
          <p>{weekend.circuit} · {weekend.year} · age {age(weekend.date)}</p>
          <h4>{weekend.race} Grand Prix weekend</h4>
          <strong>{list.length}<small>{list.length === 1 ? 'record' : 'records'}</small></strong>
        </header>
        <ul>
          {list.map(record => {
            const [title, ...rest] = record.text.split(': ').map(withoutWeekend)
            return <li key={record.id} data-group={record.group}><i aria-hidden="true" /><span><b>{title}</b>{rest.some(Boolean) && <> · {rest.join(': ')}</>}<small>{scopeLabel[record.scope]}</small></span></li>
          })}
        </ul>
      </article>
    </div>
    <p className={styles.note}>The other {229 - tied} records span several races, a season or a 2024 practice session, so they aren’t plotted.</p>
  </section>
}
