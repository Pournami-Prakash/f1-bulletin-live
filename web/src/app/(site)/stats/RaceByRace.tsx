'use client'

import { useState } from 'react'
import { seasons, type Race } from '@/lib/kimi-season-data'
import { circuitCode, seasonSummary, type Season } from '@/lib/kimi-stats'
import { useChartWidth } from './hooks'
import styles from './kimi.module.css'

const code = (race: Race) => circuitCode(race.circuit)
const outcome = (race: Race) => race.dnf ? 'dnf' : race.finish === 1 ? 'win' : race.finish <= 3 ? 'podium' : race.finish <= 10 ? 'points' : 'none'
const outcomeLabel = { win: 'Win', podium: 'Podium', points: 'Points', none: 'No points', dnf: 'Did not finish' }
const defaults: Record<Season, number> = { 2025: 21, 2026: 13 }
// Format by hand: Node and browsers disagree on en-GB short months ("Sept" vs "Sep"), which breaks hydration.
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const date = (value: string) => { const [year, month, day] = value.split('-').map(Number); return `${day} ${months[month - 1]} ${year}` }

export default function RaceByRace() {
  const [year, setYear] = useState<Season>(2026)
  const [round, setRound] = useState(defaults[2026])
  const [ref, width] = useChartWidth<HTMLDivElement>()
  const races = seasons[year]
  const summary = seasonSummary(year)
  const race = races[round - 1]
  const best = races.filter(item => !item.dnf).reduce((top, item) => item.grid - item.finish > top.grid - top.finish ? item : top)
  const height = width < 560 ? 260 : 320
  const pad = { left: 34, right: 8, top: 14, bottom: 28 }
  const step = (width - pad.left - pad.right) / races.length
  const x = (r: number) => pad.left + (r - 0.5) * step
  const y = (position: number) => pad.top + (position - 1) / 19 * (height - pad.top - pad.bottom)
  const gained = race.grid - race.finish

  return <section id="race-by-race" className={styles.section} aria-labelledby="race-by-race-title">
    <header className={styles.sectionHead}>
      <p className={styles.kicker}><span>02</span> Grid → flag</p>
      <h2 id="race-by-race-title">Where he started. Where he finished.</h2>
      <p>Every Grand Prix as one line: hollow dot on the grid, solid dot at the flag. Long lines up mean big comebacks.</p>
    </header>
    <div className={styles.toolbar}>
      <div className={styles.segmented} role="group" aria-label="Season">
        {([2026, 2025] as const).map(item => <button type="button" key={item} aria-pressed={year === item} onClick={() => { setYear(item); setRound(defaults[item]) }}>{item}<small>{item === 2026 ? 'Champion' : 'Rookie'}</small></button>)}
      </div>
      <dl className={styles.chips}>
        <div><dt>Places gained</dt><dd>{summary.positionsGained > 0 ? '+' : ''}{summary.positionsGained}</dd></div>
        <div><dt>Best climb</dt><dd>P{best.grid}→P{best.finish}</dd></div>
        <div><dt>Avg finish</dt><dd>P{summary.averageFinish.toFixed(1)}</dd></div>
      </dl>
    </div>
    <div className={styles.flagLayout}>
      <div>
        <div ref={ref} className={styles.plotBox}>
          <svg width={width} height={height} role="img" aria-label={`${year} grid and finishing positions for each Grand Prix. Selected: ${race.race}, started P${race.grid}, ${race.dnf ? 'did not finish' : `finished P${race.finish}`}.`}>
            {[1, 5, 10, 15, 20].map(position => <g key={position} className={styles.grid}><line x1={pad.left} x2={width - pad.right} y1={y(position)} y2={y(position)} /><text x={pad.left - 8} y={y(position) + 4} textAnchor="end">P{position}</text></g>)}
            <rect x={x(round) - step / 2} y={pad.top - 8} width={step} height={height - pad.top - pad.bottom + 16} className={styles.selectedBand} />
            {races.map(item => {
              const kind = outcome(item)
              const finishY = y(Math.min(item.finish, 20))
              return <g key={item.round} className={styles.flagColumn} data-kind={kind} onClick={() => setRound(item.round)} style={{ opacity: item.round === round ? 1 : 0.82 }}>
                <rect x={x(item.round) - step / 2} y={0} width={step} height={height} fill="transparent" />
                <line x1={x(item.round)} x2={x(item.round)} y1={y(item.grid)} y2={finishY} strokeWidth={item.round === round ? 4 : 2.5} strokeLinecap="round" />
                <circle cx={x(item.round)} cy={y(item.grid)} r={Math.min(5, step / 3.4)} className={styles.gridDot} />
                {item.dnf
                  ? <text x={x(item.round)} y={finishY + 5} textAnchor="middle" className={styles.dnfMark}>✕</text>
                  : <circle cx={x(item.round)} cy={finishY} r={Math.min(item.finish === 1 ? 7 : 5.5, step / 2.6)} className={styles.finishDot} />}
                {(step > 26 || item.round % 2 === 1) && <text x={x(item.round)} y={height - 8} textAnchor="middle" className={styles.axisLabel}>{step > 26 ? code(item) : item.round}</text>}
              </g>
            })}
          </svg>
        </div>
        <div className={styles.form} role="group" aria-label={`${year} form guide`}>
          {races.map(item => <button type="button" key={item.round} data-kind={outcome(item)} aria-pressed={item.round === round} aria-label={`Round ${item.round}, ${item.race}: ${item.dnf ? 'DNF' : `P${item.finish}`}`} onClick={() => setRound(item.round)}>
            <small>{code(item)}</small><b>{item.dnf ? 'DNF' : `P${item.finish}`}</b>
          </button>)}
        </div>
        <ul className={styles.key} aria-label="Colour key">{(['win', 'podium', 'points', 'none', 'dnf'] as const).map(kind => <li key={kind} data-kind={kind}><i />{outcomeLabel[kind]}</li>)}</ul>
      </div>
      <article className={styles.raceCard} aria-live="polite" data-kind={outcome(race)}>
        <p className={styles.cardEyebrow}>Round {race.round} · {date(race.date)}</p>
        <h3>{race.race} GP</h3>
        <p className={styles.cardCircuit}>{race.circuit}</p>
        <div className={styles.cardJump}><span>P{race.grid}</span><i aria-hidden="true" /><span>{race.dnf ? 'DNF' : `P${race.finish}`}</span></div>
        <p className={styles.cardVerdict}>{race.dnf ? 'Out of the race.' : gained > 0 ? `+${gained} places on Sunday` : gained < 0 ? `${gained} places on Sunday` : 'Held station'}</p>
        <dl className={styles.cardStats}>
          <div><dt>Qualified</dt><dd>{race.quali ? `P${race.quali}` : '—'}</dd></div>
          <div><dt>Points</dt><dd>{race.points}</dd></div>
          <div><dt>Fastest lap rank</dt><dd>{race.fastestLapRank ? `#${race.fastestLapRank}` : '—'}</dd></div>
          <div><dt>vs Russell</dt><dd>{race.teammateFinish === null ? '—' : race.finish < race.teammateFinish ? 'Ahead' : 'Behind'}</dd></div>
        </dl>
        {race.quali && race.grid > race.quali + 2 && <p className={styles.cardNote}>Qualified P{race.quali} but lined up P{race.grid} on the grid.</p>}
        {race.fastestLapRank === 1 && <p className={styles.cardNote}>Fastest lap of the race.</p>}
      </article>
    </div>
  </section>
}
