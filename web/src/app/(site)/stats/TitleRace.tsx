'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { seasons, titleRace2026, titleRaceDrivers } from '@/lib/kimi-season-data'
import { leaderboardAt } from '@/lib/kimi-stats'
import { prefersReducedMotion, useChartWidth, useMediaQuery, useViewportHeight } from './hooks'
import styles from './kimi.module.css'

type Code = (typeof titleRaceDrivers)[number]
const drivers: Record<Code, { name: string; team: string; dashed?: boolean }> = {
  ANT: { name: 'Antonelli', team: 'Mercedes' },
  VER: { name: 'Verstappen', team: 'Red Bull' },
  HAM: { name: 'Hamilton', team: 'Ferrari' },
  RUS: { name: 'Russell', team: 'Mercedes', dashed: true },
  LEC: { name: 'Leclerc', team: 'Ferrari', dashed: true },
  NOR: { name: 'Norris', team: 'McLaren' },
}
const color = (code: Code) => `var(--c-${code.toLowerCase()})`
const races = seasons[2026]
const rounds = races.length
const moments: Record<number, string> = {
  1: 'Opening night in Melbourne: P2 behind his teammate.',
  2: 'Shanghai: first Grand Prix pole, first Grand Prix win.',
  3: 'Suzuka win puts him top of the table. Youngest championship leader ever.',
  6: 'Monaco grand slam: pole, win, fastest lap, every lap led.',
  7: 'Barcelona DNF. The lead survives.',
  9: 'Silverstone: from pole to P15. The gap shrinks.',
  13: 'Monza: P19 on the grid, home win at the flag.',
  15: 'Baku: P16 to P5 damage limitation.',
  18: 'Austin win. One hand on the trophy.',
  19: 'Third in Mexico City. Champion at 20.',
}

export default function TitleRace() {
  const [round, setRound] = useState(rounds)
  const [playing, setPlaying] = useState(false)
  const [focus, setFocus] = useState<Code | null>(null)
  const [ref, width] = useChartWidth<HTMLDivElement>()
  const viewport = useViewportHeight()
  // Matches the CSS breakpoint that hides the standings table; the end labels then carry the points.
  const labelled = useMediaQuery('(max-width: 1050px)')

  useEffect(() => {
    if (!playing) return
    const timer = setInterval(() => setRound(current => {
      if (current >= rounds) { setPlaying(false); return current }
      return current + 1
    }), prefersReducedMotion() ? 900 : 620)
    return () => clearInterval(timer)
  }, [playing])

  const play = () => { if (round >= rounds) setRound(1); setPlaying(true) }
  const compact = width < 560
  // The rest of the section takes about 470px; the chart gets what's left of the screen.
  const height = compact ? 280 : Math.max(260, Math.min(380, viewport - 470))
  const pad = { left: compact ? 30 : 40, right: labelled ? 66 : compact ? 40 : 56, top: 16, bottom: 30 }
  const max = 400
  const x = (r: number) => pad.left + (r - 1) / (rounds - 1) * (width - pad.left - pad.right)
  const y = (points: number) => pad.top + (1 - points / max) * (height - pad.top - pad.bottom)
  const board = leaderboardAt(round)
  const leader = board[0]
  const race = races[round - 1]
  // Push end-of-line labels apart so bunched drivers stay readable.
  const labelY = new Map<Code, number>()
  board.slice().reverse().reduce((floor, entry) => { const next = Math.min(y(entry.points) + 4, floor - 14); labelY.set(entry.code, next); return next }, Infinity)
  const line = (code: Code) => titleRace2026[code].slice(0, round).map((points, index) => `${index ? 'L' : 'M'}${x(index + 1).toFixed(1)},${y(points).toFixed(1)}`).join('')

  return <section id="title-race" className={styles.section} aria-labelledby="title-race-title">
    <header className={styles.sectionHead}>
      <p className={styles.kicker}><span>01</span> The title race</p>
      <h2 id="title-race-title">Watch him run away with it.</h2>
      <p>Championship points after every round of 2026. Press play and watch the season unfold.</p>
    </header>
    <div className={styles.raceLayout}>
      <div className={styles.raceChart}>
        <div className={styles.controls}>
          <button type="button" className={styles.playButton} onClick={() => playing ? setPlaying(false) : play()} aria-label={playing ? 'Pause season replay' : 'Play season replay'}>
            <span aria-hidden="true">{playing ? '❚❚' : round >= rounds ? '↻' : '▶'}</span>{playing ? 'Pause' : round >= rounds ? 'Replay 2026' : 'Play'}
          </button>
          <label className={styles.slider}>
            <span>Round <b>{round}</b>/{rounds}</span>
            <input type="range" min="1" max={rounds} value={round} aria-label="Championship round" onChange={event => { setPlaying(false); setRound(Number(event.target.value)) }} />
          </label>
        </div>
        <div ref={ref} className={styles.plotBox}>
          <svg width={width} height={height} role="img" aria-label={`Championship points after round ${round}, ${race.race} Grand Prix: ${board.map(entry => `${drivers[entry.code].name} ${entry.points}`).join(', ')}.`}
            onPointerMove={event => { if (playing) return; const rect = event.currentTarget.getBoundingClientRect(); const r = Math.round((event.clientX - rect.left - pad.left) / (width - pad.left - pad.right) * (rounds - 1) + 1); setRound(Math.max(1, Math.min(rounds, r))) }}>
            {[0, 100, 200, 300, 400].map(tick => <g key={tick} className={styles.grid}><line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} /><text x={pad.left - 8} y={y(tick) + 4} textAnchor="end">{tick}</text></g>)}
            {races.map(item => (compact ? item.round % 3 === 1 : true) && <text key={item.round} className={styles.axisLabel} x={x(item.round)} y={height - 8} textAnchor="middle">{item.round}</text>)}
            <line className={styles.cursorLine} x1={x(round)} x2={x(round)} y1={pad.top} y2={height - pad.bottom} />
            {titleRaceDrivers.slice().reverse().map(code => {
              const points = titleRace2026[code][round - 1]
              const dim = focus && focus !== code
              return <g key={code} style={{ opacity: dim ? 0.18 : 1 }} className={styles.series}>
                <path d={line(code)} fill="none" stroke={color(code)} strokeWidth={code === 'ANT' ? 4 : 2.25} strokeDasharray={drivers[code].dashed ? '6 5' : undefined} strokeLinejoin="round" strokeLinecap="round" className={code === 'ANT' ? styles.kimiLine : undefined} />
                <circle cx={x(round)} cy={y(points)} r={code === 'ANT' ? 6.5 : 4.5} fill={color(code)} stroke="var(--bg)" strokeWidth="2" />
                {(code === 'ANT' || !compact || labelled) && <text x={x(round) + 10} y={labelY.get(code)} className={styles.seriesLabel} fill={color(code)}>{code}{labelled && ` ${points}`}</text>}
              </g>
            })}
          </svg>
        </div>
        <p className={styles.moment} aria-live="polite"><b>R{round} · {race.race}</b> {moments[round] ?? `Kimi ${race.dnf ? 'DNF' : `P${race.finish}`} from P${race.grid} on the grid.`}</p>
      </div>
      {/* Rows keep a stable DOM order so rank changes can slide; the chart label carries the ordered standings. */}
      <ol className={styles.board} aria-hidden="true" style={{ height: titleRaceDrivers.length * 52 }}>
        {titleRaceDrivers.map(code => {
          const rank = board.findIndex(entry => entry.code === code)
          const points = titleRace2026[code][round - 1]
          return <li key={code} style={{ transform: `translateY(${rank * 52}px)`, '--bar': color(code) } as CSSProperties} data-kimi={code === 'ANT'} onPointerEnter={() => setFocus(code)} onPointerLeave={() => setFocus(null)}>
            <span className={styles.boardPos}>{rank + 1}</span>
            <span className={styles.boardName}><b>{drivers[code].name}</b><small>{drivers[code].team}</small></span>
            <span className={styles.boardBar}><i style={{ width: `${points / Math.max(leader.points, 1) * 100}%` }} /></span>
            <span className={styles.boardPts}>{points}<small>{rank ? `−${leader.points - points}` : 'LEADER'}</small></span>
          </li>
        })}
      </ol>
    </div>
  </section>
}
