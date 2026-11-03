'use client'

import { useState } from 'react'
import { ageRecords, cumulativeResults, decimalAge, resultSources, seasonResults, type RaceMetric } from '@/lib/kimi-chart-data'
import styles from './charts.module.css'

const gold = '#d5a43c'
const teal = '#729d94'
const labels = { podiums: 'Podiums', wins: 'Wins', top10: 'Top-10 finishes' }
export default function StatsCharts() {
  const [metric, setMetric] = useState<RaceMetric>('podiums')
  const [round, setRound] = useState(19)
  const [mode, setMode] = useState<'rate' | 'count'>('rate')
  const series = { 2025: cumulativeResults(2025, metric), 2026: cumulativeResults(2026, metric) }
  const max = metric === 'wins' ? 10 : 20
  const x = (r: number) => 54 + (r - 1) / 23 * 560
  const y = (v: number) => 284 - v / max * 240
  const path = (year: 2025 | 2026) => series[year].map((point, index) => `${index ? 'H' : 'M'}${x(point.round)}${index ? `V${y(point.total)}` : `,${y(point.total)}`}`).join(' ')
  return <section className={styles.charts} aria-label="Kimi Antonelli statistical charts">
    <div className={styles.chartGrid}>
      <figure className={styles.progress}>
        <figcaption><p className={styles.kicker}>01 / Cumulative line chart</p><h2>THE SECOND-SEASON LEAP.</h2><p>Actual Grand Prix results, one race at a time.</p></figcaption>
        <div className={styles.toolbar}><div className={styles.toggle} role="group" aria-label="Progress metric">{(['podiums','wins'] as const).map(key => <button type="button" key={key} aria-pressed={metric === key} onClick={() => setMetric(key)}>{labels[key]}</button>)}</div><div className={styles.legend}><span><i style={{background:teal}} />2025 · 24 GPs</span><span><i style={{background:gold}} />2026 · 19 GPs</span></div></div>
        <div className={styles.plot}>
          <svg viewBox="0 0 660 340" role="img" aria-label={`Cumulative ${metric} line chart: 2025 ends at ${series[2025].at(-1)!.total} after 24 races; 2026 ends at ${series[2026].at(-1)!.total} after 19 races.`} onPointerMove={event => { const rect = event.currentTarget.getBoundingClientRect(); const coordinate = (event.clientX - rect.left) / rect.width * 660; setRound(Math.max(1, Math.min(24, Math.round((coordinate - 54) / 560 * 23 + 1)))) }}>
            <text x="54" y="20" className={styles.axisTitle}>Cumulative {metric}</text>
            {[0,max/4,max/2,max*3/4,max].map(tick => <g key={tick}><line x1="54" x2="614" y1={y(tick)} y2={y(tick)} className={styles.gridline}/><text x="40" y={y(tick)+5} textAnchor="end">{tick}</text></g>)}
            {[1,6,12,19,24].map(tick => <text key={tick} x={x(tick)} y="308" textAnchor="middle">{tick}</text>)}
            <line x1={x(19)} x2={x(19)} y1="40" y2="284" className={styles.cutoff}/><text x={x(19)+7} y="38" className={styles.smallText}>2026 stops here</text>
            <path d={path(2025)} fill="none" stroke={teal} strokeWidth="3" strokeDasharray="6 4"/><path d={path(2026)} fill="none" stroke={gold} strokeWidth="3.5"/>
            <line x1={x(round)} x2={x(round)} y1="44" y2="284" className={styles.cursor}/>
            {([2025,2026] as const).map(year => { const point=series[year][round-1]; return point && <circle key={year} cx={x(round)} cy={y(point.total)} r="6" fill={year === 2026 ? gold : teal} stroke="var(--bg)" strokeWidth="2"/> })}
            <text x="334" y="334" textAnchor="middle" className={styles.axisTitle}>Grand Prix number within each season</text>
          </svg>
        </div>
        <label className={styles.scrubber}>Inspect race <strong>{round}</strong><input aria-label="Inspect Grand Prix number" type="range" min="1" max="24" value={round} onChange={event => setRound(Number(event.target.value))}/></label>
        <div className={styles.readout} aria-live="polite">{([2025,2026] as const).map(year => { const point=series[year][round-1]; return <p key={year}><strong style={{color:year===2026?gold:teal}}>{year}</strong>{point ? <><span>{point.race} · {point.position === null ? 'DNF' : `P${point.position}`}</span><b>{point.total} {metric}</b></> : <span>Outside this snapshot</span>}</p> })}</div>
        <p className={styles.note}>Same race number, different calendars. 2025 is complete; 2026 ends at Mexico. Sprint results excluded.</p>
      </figure>
      <figure className={styles.rates}>
        <figcaption><p className={styles.kicker}>02 / Grouped bar chart</p><h2>HOW OFTEN?</h2><p>Compare the frequency, or the raw totals.</p></figcaption>
        <div className={styles.toggle} role="group" aria-label="Season comparison scale">{(['rate','count'] as const).map(key => <button type="button" key={key} aria-pressed={mode===key} onClick={() => setMode(key)}>{key==='rate'?'Per-race rate':'Total count'}</button>)}</div>
        <div className={styles.barChart} role="img" aria-label={`Grouped bar chart of wins, podiums and top-10 finishes by season, showing ${mode === 'rate' ? 'percent of Grands Prix' : 'total counts'}.`}>
          <div className={styles.barAxis}><span>0</span><span>{mode==='rate'?'50%':'12'}</span><span>{mode==='rate'?'100%':'24'}</span></div>
          {(['wins','podiums','top10'] as const).map(key => <div key={key} className={styles.barGroup}><h3>{labels[key]}</h3>{([2025,2026] as const).map(year => { const count=cumulativeResults(year,key).at(-1)!.total; const races=seasonResults[year].length; const value=mode==='rate'?count/races*100:count; return <div key={year} className={styles.barRow}><span>{year}</span><div className={styles.barTrack}><span style={{width:`${mode==='rate'?value:value/24*100}%`,background:year===2026?gold:teal}} /></div><b>{mode==='rate'?`${value.toFixed(1)}%`:value}</b></div> })}</div>)}
        </div>
        <p className={styles.note}>2025: 24 Grands Prix. 2026: 19 Grands Prix through Mexico. Rates account for the unequal race counts.</p>
      </figure>
    </div>
    <figure className={styles.ages}>
      <figcaption><div><p className={styles.kicker}>03 / Age comparison plot</p><h2>HOW MUCH YOUNGER?</h2></div><div className={styles.legend}><span><i style={{background:gold}}/>Antonelli</span><span><i style={{background:teal}}/>Previous record · Vettel</span></div></figcaption>
      <div className={`${styles.plot} ${styles.desktopAges}`}><svg viewBox="0 0 1050 280" role="img" aria-label="Age comparison: world champion, Antonelli 20 years 68 days versus Vettel 23 years 134 days; Grand Prix pole, Antonelli 19 years 201 days versus Vettel 21 years 73 days.">
        {[18,19,20,21,22,23,24].map(age => <g key={age}><line x1={250+(age-18)/6*700} x2={250+(age-18)/6*700} y1="30" y2="218" className={styles.gridline}/><text x={250+(age-18)/6*700} y="248" textAnchor="middle">{age}</text></g>)}
        {ageRecords.map((record,index) => { const row=75+index*100; const newer=250+(decimalAge(record.kimi)-18)/6*700; const older=250+(decimalAge(record.previous)-18)/6*700; return <g key={record.record}><text x="0" y={row-3} className={styles.recordLabel}>{record.record}</text><text x="0" y={row+20} className={styles.smallText}>{record.event}</text><line x1={newer} x2={older} y1={row} y2={row} stroke="var(--t2)" strokeWidth="2"/><circle cx={newer} cy={row} r="8" fill={gold}/><circle cx={older} cy={row} r="8" fill={teal}/><text x={newer} y={row-20} textAnchor="middle">{record.kimi[0]}y {record.kimi[1]}d</text><text x={older} y={row+30} textAnchor="middle">{record.previous[0]}y {record.previous[1]}d</text></g> })}
        <text x="600" y="276" textAnchor="middle" className={styles.axisTitle}>Age at achievement (years) · axis begins at 18</text>
      </svg></div>
      <div className={styles.mobileAges}>{ageRecords.map(record => { const newer=20+(decimalAge(record.kimi)-18)/6*320; const older=20+(decimalAge(record.previous)-18)/6*320; return <div key={record.record}><h3>{record.record}</h3><p>{record.event}</p><svg viewBox="0 0 360 130" role="img" aria-label={`${record.record}: Antonelli ${record.kimi[0]} years ${record.kimi[1]} days, Vettel ${record.previous[0]} years ${record.previous[1]} days.`}>{[18,19,20,21,22,23,24].map(age=><g key={age}><line x1={20+(age-18)/6*320} x2={20+(age-18)/6*320} y1="12" y2="92" className={styles.gridline}/><text x={20+(age-18)/6*320} y="112" textAnchor="middle">{age}</text></g>)}<line x1={newer} x2={older} y1="48" y2="48" stroke="var(--t2)" strokeWidth="2"/><circle cx={newer} cy="48" r="6" fill={gold}/><circle cx={older} cy="48" r="6" fill={teal}/><text x={newer} y="28" textAnchor="middle">{record.kimi[0]}y {record.kimi[1]}d</text><text x={older} y="76" textAnchor="middle">{record.previous[0]}y {record.previous[1]}d</text><text x="180" y="129" textAnchor="middle">Age in years · axis starts at 18</text></svg></div> })}</div>
      <p className={styles.note}>Positions use years + days ÷ 365.25. Labels preserve the published years/days; pole age is measured on qualifying day.</p>
    </figure>
    <details className={styles.data}><summary>Chart data & primary sources</summary><div className={styles.tables}><table><caption>Grand Prix season totals</caption><thead><tr><th>Season</th><th>Races</th><th>Wins</th><th>Podiums</th><th>Top 10</th></tr></thead><tbody>{([2025,2026] as const).map(year => <tr key={year}><th>{year}</th><td>{seasonResults[year].length}</td>{(['wins','podiums','top10'] as const).map(key=><td key={key}>{cumulativeResults(year,key).at(-1)!.total}</td>)}</tr>)}</tbody></table><div><a href={resultSources[2025]}>Official 2025 race results ↗</a><a href={resultSources[2026]}>Official 2026 race results ↗</a>{ageRecords.map(record=><p key={record.record}>{record.record}: {record.sources.map((source,index)=><a key={source} href={source}>{index===0?'Antonelli source':'Vettel source'} ↗</a>)}</p>)}</div></div></details>
  </section>
}
