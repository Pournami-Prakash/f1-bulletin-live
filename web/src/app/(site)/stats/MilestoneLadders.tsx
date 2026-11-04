'use client'

import { useState, type KeyboardEvent } from 'react'
import { ladders, weekends } from '@/lib/kimi-record-insights'
import { ageAt } from '@/lib/kimi-stats'
import { useChartWidth } from './hooks'
import AgeStrip from './AgeStrip'
import styles from './records.module.css'
import kimi from './kimi.module.css'

type LadderId = (typeof ladders)[number]['id']
const unit: Record<LadderId, [string, string]> = { wins: ['win', 'wins'], poles: ['pole', 'poles'], podiums: ['podium', 'podiums'], fastest: ['fastest lap', 'fastest laps'], points: ['points', 'points'] }
const age = (date: string) => { const value = ageAt('2006-08-25', date); return `${value.years}y ${value.days}d` }

export default function MilestoneLadders() {
  const [id, setId] = useState<LadderId>('wins')
  const ladder = ladders.find(item => item.id === id)!
  const [rungIndex, setRungIndex] = useState<number | null>(null)
  const [ref, width] = useChartWidth<HTMLDivElement>()
  const compact = width < 640
  const height = compact ? 220 : 280
  const pad = { left: 34, right: 12, top: 18, bottom: 40 }
  const column = (width - pad.left - pad.right) / weekends.length
  const x = (index: number) => pad.left + (index + 0.5) * column
  const plotBottom = height - pad.bottom
  const y = (count: number) => plotBottom - count / ladder.total * (plotBottom - pad.top)
  const indexOf = (race: string, year: number) => ladder.path.findIndex(point => point.race === race && point.year === year)
  const youngest = ladder.rungs.filter(rung => rung.youngest)
  const rung = ladder.rungs[rungIndex ?? ladder.rungs.length - 1]
  const point = ladder.path[indexOf(rung.race, rung.year)]
  const [one, many] = unit[id]
  const line = ladder.path.map((p, index) => `${index ? 'H' : 'M'}${(x(index) - column / 2).toFixed(1)}${index ? '' : `,${y(p.before).toFixed(1)}`}V${y(p.total).toFixed(1)}`).join('') + `H${(x(ladder.path.length - 1) + column / 2).toFixed(1)}`
  const ticks = [0, Math.round(ladder.total / 2), ladder.total]

  const move = (event: KeyboardEvent) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    event.preventDefault()
    setRungIndex(Math.max(0, Math.min(ladder.rungs.length - 1, (rungIndex ?? ladder.rungs.length - 1) + step)))
  }

  return <section id="milestones" className={`${kimi.section} ${styles.records}`} aria-labelledby="milestones-title">
    <header className={kimi.sectionHead}>
      <p className={kimi.kicker}><span>07</span> Milestone ladders</p>
      <h2 id="milestones-title">Climbing the ladders first.</h2>
      <p>Youngest to 2 wins, then 3, then 4: each ladder in the list as one climb. Filled rungs are counts he reached younger than anyone in F1 history.</p>
    </header>
    <div className={styles.tabs} role="group" aria-label="Milestone">
      {ladders.map(item => <button type="button" key={item.id} aria-pressed={item.id === id} onClick={() => { setId(item.id); setRungIndex(null) }}>
        {item.label}<small>{item.rungs.filter(r => r.youngest).length} records</small>
      </button>)}
    </div>
    <div ref={ref} className={styles.plot} tabIndex={0} role="group" aria-label={`${ladder.label} ladder. Use the left and right arrow keys to move between rungs.`} onKeyDown={move}>
      <svg width={width} height={height} role="img" aria-label={`Career ${many}: ${ladder.total}. Youngest ever to ${youngest[0].count}${youngest.length > 1 ? ` through ${youngest.at(-1)!.count}` : ''} ${many}.`}>
        {ticks.map(tick => <g key={tick} className={styles.gridLine}><line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} /><text x={pad.left - 8} y={y(tick) + 4} textAnchor="end">{tick}</text></g>)}
        <path className={styles.climb} d={line} />
        {ladder.rungs.map((item, index) => {
          const cx = x(indexOf(item.race, item.year))
          const isActive = item === rung
          return <g key={item.count} onPointerEnter={() => setRungIndex(index)} onClick={() => setRungIndex(index)} style={{ cursor: 'pointer' }}>
            <circle className={styles.rungHit} cx={cx} cy={y(item.count)} r={Math.max(9, column / 2)} />
            <circle className={styles.rung} data-youngest={item.youngest} data-active={isActive} cx={cx} cy={y(item.count)} r={isActive ? 6 : compact ? 3.5 : 4.5} />
          </g>
        })}
        <text className={styles.endLabel} x={x(ladder.path.length - 1)} y={y(ladder.total) - 12} textAnchor="end">{ladder.total} {many}</text>
        <AgeStrip x={x} column={column} y={plotBottom + 12} />
      </svg>
    </div>
    <p className={styles.rungCaption} aria-live="polite" data-youngest={rung.youngest}>
      <b>{rung.count} {rung.count === 1 ? one : many}</b> · {rung.race} GP {rung.year} · age {age(point.date)}
      <span>{rung.youngest ? `Youngest driver ever to reach ${rung.count} ${rung.count === 1 ? one : many}.` : 'Not the youngest ever for this count.'}</span>
    </p>
    {id === 'points' && <p className={styles.note}>Points include sprints. The list also has him as the fastest to 150 through 500 points, measured in races started.</p>}
  </section>
}
