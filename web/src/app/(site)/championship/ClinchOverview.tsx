'use client'

import { automaticClinchPaths, type AutomaticClinchPath, type ChampionshipForecast } from '@/lib/championship'
import styles from './championship.module.css'

const finishText = (positions: number[]) => {
  const ranked=positions.filter(Boolean).sort((a,b)=>a-b)
  const contiguous=ranked.every((p,i)=>i===0||p===ranked[i-1]+1)
  const text=ranked.length===1 ? `P${ranked[0]}` : contiguous&&ranked.length ? `P${ranked[0]}–P${ranked.at(-1)}` : ranked.map(p=>`P${p}`).join(', ')
  return `${text}${positions.includes(0)?`${text?' or ':''}unclassified`:''}`
}
function grouped(paths: AutomaticClinchPath[]) {
  const groups=new Map<string,{positions:number[];requirements:AutomaticClinchPath['requirements'];qualifying:boolean;samples:number;clinches:number}>()
  for(const path of paths) {
    const key=JSON.stringify([path.qualifying_needed,path.requirements])
    const group=groups.get(key)??{positions:[],requirements:path.requirements,qualifying:path.qualifying_needed,samples:0,clinches:0}
    group.positions.push(path.position);group.samples+=path.samples;group.clinches+=path.clinches;groups.set(key,group)
  }
  return [...groups.values()]
}

export default function ClinchOverview({data,drivers}:{data:ChampionshipForecast;drivers:ReturnType<typeof automaticClinchPaths>}) {
  const context=data.next_race_clinch
  if(!context) return null
  const event=data.remaining.find(e=>e.round===context.round)!
  const ready=drivers.filter(d=>d.status==='paths'||d.status==='secured')
  const waiting=drivers.filter(d=>d.status==='not_this_weekend')
  const sprint=drivers.filter(d=>d.status==='sprint_pending')
  return <section className={styles.autoClinch} aria-labelledby="auto-clinch-heading">
    <div className={styles.autoIntro}><span className={styles.kicker}>AUTOMATIC TITLE SCENARIOS / ROUND {context.round}</span><h2 id="auto-clinch-heading">WHO CAN CLINCH <em>AT THE {event.race_name.toUpperCase()}?</em></h2><p>The results that would secure the championship at the next Grand Prix.</p></div>
    {ready.length===0&&sprint.length===0&&<p className={styles.autoNone}>No driver can clinch the title at this race with any valid finishing order.</p>}
    {ready.map(d=>d.status==='secured'?<article className={styles.automaticPath} key={d.driver_code} aria-label={`${d.driver_code} title already secured`}><h3>{d.driver_code}</h3><strong>THE TITLE IS ALREADY SECURED</strong><p>No further result is needed under the current points and calendar assumptions.</p></article>:grouped(d.paths).map((group,i)=><article className={styles.automaticPath} key={`${d.driver_code}-${i}`} aria-label={`${d.driver_code} automatic clinching path ${i+1}`}>
      <div className={styles.pathDriver}><span>CONTENDER</span><h3>{d.driver_code}</h3><strong>{group.positions.length===1&&group.positions[0]===1?'MUST WIN':`FINISH ${finishText(group.positions)}`}</strong></div>
      <div className={styles.pathConditions}><span className={styles.kicker}>AND ALL OF THESE MUST HAPPEN</span>{group.requirements.length?group.requirements.map(r=><p key={r.driver_code}><b>{r.driver_code}</b><span>{finishText(r.positions)}</span></p>):<p className={styles.anyResult}>No restrictions on rival finishes.</p>}<small>{group.requirements.length?'All other drivers may finish anywhere available. ':''}Finishes must form one valid race classification.{group.qualifying?' Qualifying countback must also favour the contender; this is not a guaranteed clinch.':''}</small></div>
      <div className={styles.pathOutcome}><strong>{group.qualifying?'COUNTBACK DEPENDENT':'TITLE SECURED'}</strong>{group.samples>0&&<p><b>{(group.clinches/group.samples*100).toFixed(1)}%</b> model chance of clinching, given {d.driver_code} finishes {finishText(group.positions)}<small>{group.clinches}/{group.samples} matching simulated races. An uncalibrated estimate; the finishing requirements are calculated separately.</small></p>}</div>
    </article>))}
    <div className={styles.autoStatus} role="region" aria-label="Championship contender status">
      {waiting.length>0&&<p>{waiting.length} {waiting.length===1?'contender remains':'contenders remain'} in the title fight but cannot clinch at this race.</p>}
      {sprint.length>0&&<p>Clinch scenarios will update after the Sprint results are recorded.</p>}
    </div>
    <p className={styles.note}>{context.future_points} points remain available after this weekend. Conditions assume full points and no future penalties.{context.sprint_pending?' Exact race-only paths will appear once the Sprint points are recorded.':''} Later-race conditions depend on the intervening results and update as those races are recorded.</p>
  </section>
}
