'use client'

import { useState } from 'react'
import { clinchAgainst, feasibleClassification, RACE_POINTS, SPRINT_POINTS, type ChampionshipForecast } from '@/lib/championship'
import styles from './championship.module.css'

const label = (p: number) => p ? `P${p}` : 'NC'
const pct = (p: number) => `${(p*100).toFixed(1)}%`

export default function ClinchMap({ data }: { data: ChampionshipForecast }) {
  const [code,setCode] = useState(() => [...data.drivers].sort((a,b)=>a.current_position-b.current_position)[0].driver_code)
  const [finish,setFinish] = useState(1)
  const [rivalFinishes,setRivalFinishes] = useState<Record<string,number>>({})
  const [sprints,setSprints] = useState<Record<string,number>>({})
  const context = data.next_race_clinch
  if (!context) return null
  const event = data.remaining.find(e=>e.round===context.round)!
  const candidate = context.drivers.find(d=>d.driver_code===code)!
  const positions = [...Array.from({length:context.drivers.filter(d=>d.active).length},(_,i)=>i+1),0]
  const score = (position: number) => RACE_POINTS[position-1] ?? 0
  const sprint = (driver: string) => context.sprint_pending ? SPRINT_POINTS[(sprints[driver]??0)-1] ?? 0 : 0
  const evaluate = (rival: typeof candidate, p: number, cp=finish) => clinchAgainst(candidate,rival,cp,p,context,sprint(code),sprint(rival.driver_code))
  const rivals = context.drivers.filter(d=>d.driver_code!==code).filter(d=>positions.some(p=>{
    // Include every potential threat even when the chosen finish already covers them.
    const status=clinchAgainst(candidate,d,0,p,context,0,context.sprint_pending?8:0)
    return status==='alive'||status==='tie'
  })).map(r=>({r,blocks:positions.some(p=>['alive','tie'].includes(evaluate(r,p)))}))
    // Rivals who can still stop the clinch lead; the rest sink and fade.
    .sort((a,b)=>Number(b.blocks)-Number(a.blocks)||b.r.current_points-a.r.current_points).map(x=>x.r)
  const blocking = (rival: typeof candidate) => positions.some(p=>['alive','tie'].includes(evaluate(rival,p)))
  const sprintConflict = context.sprint_pending && !feasibleClassification(positions.length-1,[sprints[code]??0,...rivals.filter(r=>r.active).map(r=>sprints[r.driver_code]??0)])
  const chosen = rivals.filter(r=>rivalFinishes[r.driver_code]!==undefined)
  const allChosen = chosen.length===rivals.length
  const classificationValid = feasibleClassification(positions.length-1,[finish,...chosen.filter(r=>r.active).map(r=>rivalFinishes[r.driver_code])])
  const allSafe = classificationValid && rivals.every(r=>rivalFinishes[r.driver_code]!==undefined
    ? evaluate(r,rivalFinishes[r.driver_code])==='safe'
    : positions.filter(p=>evaluate(r,p)!=='occupied').every(p=>evaluate(r,p)==='safe')) && !sprintConflict
  const impossible = rivals.some(r=>!positions.some(p=>['safe','tie'].includes(evaluate(r,p))))
  const unresolved = chosen.some(r=>evaluate(r,rivalFinishes[r.driver_code])==='tie')
  const outcome = context.conditional.find(c=>c.driver_code===code&&c.position===finish)
  const postPoints = candidate.current_points+score(finish)+sprint(code)
  const requirements = (rival: typeof candidate) => {
    const safe = positions.filter(p=>evaluate(rival,p)==='safe' && feasibleClassification(positions.length-1,rival.active?[finish,p]:[finish]))
    if (!safe.length) return 'No finish guarantees the title against this rival'
    const classified=safe.filter(Boolean)
    const description=classified.length ? classified.length===positions.length-2 ? 'Any other classified finish' : classified.length===1 ? label(classified[0]) : `P${classified[0]}–P${classified.at(-1)}` : ''
    // A candidate's occupied place can make the acceptable set non-contiguous.
    const holes=classified.some((p,i)=>i>0&&p!==classified[i-1]+1)
    return `${holes ? classified.map(label).join(', ') : description}${safe.includes(0) ? `${description?' or ':''}unclassified` : ''}`
  }
  const sprintSelect = (driver: string) => <select aria-label={`${driver} sprint finish`} value={sprints[driver]??0} onChange={e=>setSprints({...sprints,[driver]:Number(e.target.value)})}><option value={0}>0 points</option>{Array.from({length:8},(_,i)=><option key={i} value={i+1}>P{i+1} (+{8-i})</option>)}</select>
  return <section className={styles.clinchSection} aria-labelledby="clinch-heading">
    <div className={styles.clinchIntro}><div><span className={styles.kicker}>THE TITLE EQUATION / ROUND {context.round}</span><h2 id="clinch-heading">CAN THE TITLE BE WON <em>IN {event.race_name.replace(' Grand Prix','').toUpperCase()}?</em></h2></div><p>Choose a finish. See what every rival must do. <b>All rival conditions must happen together.</b></p></div>
    <div className={styles.clinchControls}>
      <label>IF<select aria-label="Title contender" value={code} onChange={e=>{setCode(e.target.value);setRivalFinishes({});setSprints({})}}>{data.drivers.filter(d=>d.active).sort((a,b)=>a.current_position-b.current_position).map(d=><option key={d.driver_code}>{d.driver_code}</option>)}</select></label>
      <label>FINISHES<select aria-label="Contender race finish" value={finish} onChange={e=>{setFinish(Number(e.target.value));setRivalFinishes({})}}>{positions.map(p=><option key={p} value={p}>{p?`P${p} · +${score(p)} pts`:'Unclassified · 0 pts'}</option>)}</select></label>
      {context.sprint_pending && <label>SPRINT FINISH{sprintSelect(code)}</label>}
      <div className={styles.clinchArithmetic}><strong>{postPoints}</strong><span>points after this race<br />{context.future_points} still available afterwards</span></div>
    </div>
    <div className={styles.clinchAnswer} aria-live="polite"><strong>{allSafe ? `${code} CLINCHES THE TITLE` : sprintConflict ? 'CHOOSE FEASIBLE SPRINT FINISHES' : impossible ? `${code} CANNOT CLINCH WITH ${label(finish)}` : allChosen ? unresolved ? 'QUALIFYING COUNTBACK STILL MATTERS' : 'THE TITLE RACE STAYS OPEN' : `FOR ${code} TO CLINCH HERE…`}</strong><p>{allSafe ? 'This finish and the rival conditions shown secure the championship, even if rivals score every remaining point.' : impossible ? 'At least one rival can still catch this total even if they score nothing this weekend.' : allChosen ? 'Change the rival finishes below to explore another combination.' : rivals.length ? 'Green cells remove that rival from the title fight. Pick one finish per rival to test a complete combination.' : 'No rival can catch this total, regardless of their result.'}</p></div>
    {!context.sprint_pending && outcome && <div className={styles.clinchEstimate}><b>{outcome.samples ? pct(outcome.clinches/outcome.samples) : 'No samples'}</b><span>model chance of clinching here, given only {code} finishes {label(finish)}<small>{outcome.clinches} clinching outcomes / {outcome.samples} matching simulations. Rival finishes are still simulated; this estimate does not condition on cells you select below.{outcome.samples<100?' Small sample: this estimate is unstable.':''} Uncalibrated season model.</small></span></div>}
    <div className={styles.clinchLegend}><span>✓ Rival cannot stop the title</span><span>– Rival still blocks the clinch</span><span>? Qualifying countback unresolved</span><span>× Occupied or impossible classification</span></div>
    {rivals.length>0 && <div className={styles.clinchScroll} role="region" aria-label="Title clinching conditions by rival finish" tabIndex={0}>
      <div className={styles.clinchGrid} style={{gridTemplateColumns:`170px repeat(${positions.length},minmax(40px,1fr))`}}>
        <div className={styles.clinchCorner}>RIVAL MUST FINISH →</div>{positions.map(p=><div key={p} className={styles.clinchColumn}>{label(p)}</div>)}
        {rivals.map(rival=><div className={`${styles.clinchRow} ${blocking(rival)?'':styles.settled}`} key={rival.driver_code}>
          <div className={styles.clinchRival}><b>{rival.driver_code}</b><small>{requirements(rival)}</small>{context.sprint_pending && sprintSelect(rival.driver_code)}</div>
          {positions.map(p=>{
            const status=evaluate(rival,p)
            // The first finish from which this rival can no longer stop the title.
            const threshold=status==='safe'&&p>1&&['alive','tie'].includes(evaluate(rival,p-1))
            const occupied=status==='occupied'||(p>0&&Object.entries(rivalFinishes).some(([driver,value])=>driver!==rival.driver_code&&value===p))
            const impossiblePlace = !feasibleClassification(positions.length-1,[finish,...chosen.filter(r=>r.active&&r.driver_code!==rival.driver_code).map(r=>rivalFinishes[r.driver_code]),...(rival.active?[p]:[])])
            const blocked = occupied || impossiblePlace
            const text=impossiblePlace&&!occupied?'Impossible classification':occupied?'Place already occupied':status==='safe'?'Cannot stop the title':status==='tie'?'Qualifying countback unresolved':'Still blocks the clinch'
            return <button key={p} disabled={blocked||(!rival.active&&p!==0)} className={`${styles.clinchCell} ${styles[status]} ${blocked?styles.occupied:''} ${threshold&&!blocked?styles.threshold:''}`} aria-label={`${rival.driver_code} ${label(p)}: ${text}`} aria-pressed={rivalFinishes[rival.driver_code]===p} onClick={()=>setRivalFinishes({...rivalFinishes,[rival.driver_code]:p})}><span>{blocked?'×':threshold?label(p):status==='safe'?'✓':status==='tie'?'?':'–'}</span></button>
          })}
        </div>)}
      </div>
    </div>}
    {chosen.length>0 && <div className={styles.chosenScenario} aria-live="polite"><span>YOUR SCENARIO</span><b>{code} {label(finish)}</b>{chosen.map(r=><b key={r.driver_code}>{r.driver_code} {label(rivalFinishes[r.driver_code])}</b>)}<button onClick={()=>setRivalFinishes({})}>Reset rivals</button></div>}
    <p className={styles.note}>This map uses current recorded points and race countback, full points for all scheduled races and sprints, and no future penalties. Green on equal points means the race-result countback is already secured. “?” means unknown qualifying results can still decide it. NC means unclassified with zero points; it does not imply every retirement scores zero. This is the next unscored weekend; later-race conditions depend on results still to come. <a href="https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_a_general_provisions_-_iss_03_-_2026-06-25.pdf" target="_blank" rel="noopener noreferrer">FIA scoring and countback rules ↗</a></p>
  </section>
}
