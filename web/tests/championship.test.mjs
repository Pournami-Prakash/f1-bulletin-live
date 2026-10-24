import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const code=ts.transpileModule(readFileSync(new URL('../src/lib/championship.ts',import.meta.url),'utf8'),{
  compilerOptions:{ module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022 },
}).outputText
const loaded={exports:{}}
new Function('module','exports',code)(loaded,loaded.exports)
const {simulateChampionship,RACE_POINTS,SPRINT_POINTS}=loaded.exports

function fixture() {
  const calendar=Array.from({length:4},(_,i)=>({round:i+1,race_name:`Race ${i+1}`,circuit_name:`Track ${i+1}`,
    race_start_utc:`2026-0${i+1}-10T12:00:00Z`,is_sprint_weekend:i===2,sprint_date:i===2?'2026-03-09':null}))
  const results=[1,2].flatMap(round=>['A','B','C','D'].map((driver_code,i)=>({season:2026,round,
    driver_code,team:i<2?'Front Team':'Other Team',session_type:'R',circuit:`Track ${round}`,
    finish_position:i+1,grid_position:i+1,qualifying_position:i+1,points:RACE_POINTS[i],status:'Finished',expected_drivers:4})))
  return {season:2026,calendar,results,simulations:500,now:'2026-02-20T00:00:00Z'}
}

test('joint season samples allocate one championship position per driver and one title',()=>{
  const forecast=simulateChampionship(fixture())
  assert.equal(forecast.remaining.length,2)
  assert.equal(forecast.completed_races,2)
  assert.equal(forecast.races.length,8)
  assert.ok(Math.abs(forecast.drivers.reduce((sum,d)=>sum+d.title_probability,0)-1)<1e-9)
  for(let rank=0;rank<4;rank++) assert.ok(Math.abs(forecast.drivers.reduce((sum,d)=>sum+d.position_probabilities[rank],0)-1)<1e-9)
  for(const driver of forecast.drivers) {
    assert.ok(Math.abs(driver.position_probabilities.reduce((a,b)=>a+b,0)-1)<1e-9)
    assert.ok(driver.position.low>=1&&driver.position.high<=4)
    assert.ok(driver.points.low>=driver.current_points&&driver.points.high<=driver.maximum_points)
    assert.equal(driver.maximum_points-driver.current_points,58)
  }
})

test('already completed sprint points are counted once and excluded from remaining budget',()=>{
  const data=fixture()
  data.results.push(...['A','B','C','D'].map((driver_code,i)=>({season:2026,round:3,driver_code,team:'Team',
    session_type:'S',circuit:'Track 3',finish_position:i+1,grid_position:i+1,qualifying_position:i+1,
    points:SPRINT_POINTS[i],status:'Finished',expected_drivers:4})))
  const forecast=simulateChampionship(data)
  assert.equal(forecast.completed_sprints,1)
  assert.equal(forecast.remaining[0].sprint_pending,false)
  const a=forecast.drivers.find(d=>d.driver_code==='A')
  assert.equal(a.current_points,58)
  assert.equal(a.maximum_points,108)
})

test('partial, duplicate and invalid classifications fail closed',()=>{
  for(const mutate of [d=>d.results.pop(),d=>d.results.push({...d.results.at(-1)}),
    d=>{d.results.at(-1).points=NaN},d=>{d.results.at(-1).finish_position=1}]) {
    const data=fixture();mutate(data)
    assert.throws(()=>simulateChampionship(data),/Incomplete/)
  }
})

test('identical inputs are deterministic; inactive drivers retain points without future starts',()=>{
  const data=fixture()
  data.results.find(r=>r.round===2&&r.driver_code==='D').driver_code='NEW'
  const forecast=simulateChampionship(data)
  assert.deepEqual(forecast,simulateChampionship(data))
  const old=forecast.drivers.find(d=>d.driver_code==='D')
  assert.equal(old.active,false)
  assert.equal(old.maximum_points,old.current_points)
  assert.equal(old.points.low,old.current_points)
  assert.equal(old.points.high,old.current_points)
  assert.ok(forecast.races.filter(r=>r.driver_code==='D').every(r=>r.position_probabilities.every(p=>p===0)&&r.championship_position_probabilities.reduce((a,b)=>a+b,0)>0.999999))
})

test('season completion collapses ranges and countback resolves equal points',()=>{
  const data=fixture();data.calendar=data.calendar.slice(0,2)
  data.results.forEach(r=>{r.points=r.driver_code==='A'||r.driver_code==='B'?20:r.points})
  const forecast=simulateChampionship(data)
  assert.equal(forecast.remaining.length,0)
  assert.equal(forecast.drivers[0].driver_code,'A')
  assert.equal(forecast.drivers[0].title_probability,1)
  for(const d of forecast.drivers) assert.equal(d.points.low,d.points.high)
})

test('qualifying countback and unresolved ties never use alphabetical order to award a title',()=>{
  const data=fixture();data.calendar=data.calendar.slice(0,2)
  const a=data.results.filter(r=>r.driver_code==='A'),b=data.results.filter(r=>r.driver_code==='B')
  a.forEach((r,i)=>{r.finish_position=i+1;r.points=20;r.qualifying_position=2})
  b.forEach((r,i)=>{r.finish_position=2-i;r.points=20;r.qualifying_position=1})
  let forecast=simulateChampionship(data)
  assert.equal(forecast.drivers.find(d=>d.driver_code==='B').title_probability,1)
  a[0].qualifying_position=1;b[0].qualifying_position=2
  forecast=simulateChampionship(data)
  assert.equal(forecast.unresolved_tie_probability,1)
  assert.equal(forecast.drivers.find(d=>d.driver_code==='A').title_probability,.5)
  assert.equal(forecast.drivers.find(d=>d.driver_code==='B').title_probability,.5)
})

test('an insurmountable lead has no simulated title chance for points-eliminated rivals',()=>{
  const data=fixture();data.results.filter(r=>r.driver_code==='A').forEach(r=>{r.points=300})
  const forecast=simulateChampionship(data)
  assert.equal(forecast.drivers[0].title_probability,1)
  for(const d of forecast.drivers.slice(1)){assert.equal(d.points_eliminated,true);assert.equal(d.title_probability,0)}
})

test('partial published grids cannot influence any driver forecast',()=>{
  const data=fixture(),baseline=simulateChampionship(data)
  data.predictions=[{round:3,driver_code:'D',predicted_position:1}]
  assert.deepEqual(simulateChampionship(data),baseline)
})


test('every round exposes normalized race and championship distributions, including inactive standings',()=>{
  const data=fixture()
  data.results.find(r=>r.round===2&&r.driver_code==='D').driver_code='NEW'
  const forecast=simulateChampionship(data)
  for(const event of forecast.remaining) {
    const rows=forecast.races.filter(r=>r.round===event.round)
    assert.equal(rows.length,5)
    for(const row of rows) {
      assert.ok(Math.abs(row.championship_position_probabilities.reduce((a,b)=>a+b,0)-1)<1e-9)
      const active=forecast.drivers.find(d=>d.driver_code===row.driver_code).active
      assert.ok(Math.abs(row.position_probabilities.reduce((a,b)=>a+b,0)-(active?1:0))<1e-9)
      if(active) assert.ok(Math.abs(row.position_probabilities[0]-row.win_probability)<1e-9)
    }
    for(let rank=0;rank<5;rank++) assert.ok(Math.abs(rows.reduce((sum,r)=>sum+r.championship_position_probabilities[rank],0)-1)<1e-9)
    for(let rank=0;rank<4;rank++) assert.ok(Math.abs(rows.reduce((sum,r)=>sum+r.position_probabilities[rank],0)-1)<1e-9)
  }
  for(const d of forecast.drivers) assert.deepEqual(forecast.races.find(r=>r.round===4&&r.driver_code===d.driver_code).championship_position_probabilities,d.position_probabilities)
})

test('clinch conditions use all future points and worst-case rival race countback',()=>{
  const {clinchAgainst}=loaded.exports
  const a={driver_code:'A',current_points:100,active:true,race_finishes:[6,0,0]}
  const b={driver_code:'B',current_points:75,active:true,race_finishes:[2,0,0]}
  const context={future_points:25,future_races:1}
  assert.equal(clinchAgainst(a,b,1,1,context),'occupied')
  assert.equal(clinchAgainst(a,b,0,0,context),'safe') // Equality, but six wins beat three.
  assert.equal(clinchAgainst({...a,race_finishes:[3,0,0]},b,0,0,context),'tie')
  assert.equal(clinchAgainst({...a,race_finishes:[2,0,0]},b,0,0,context),'alive')
  assert.equal(clinchAgainst(a,b,0,10,context),'alive') // A single point keeps B alive.
  assert.equal(clinchAgainst(a,b,0,0,{future_points:33,future_races:1}),'alive') // Include future sprint.
  assert.equal(clinchAgainst(a,b,0,0,context,0,1),'alive') // This weekend's sprint also counts.
  assert.equal(clinchAgainst(a,{...b,active:false},0,0,context),'safe')
})

test('next-race conditional clinch estimates count matching joint race outcomes',()=>{
  const data=fixture()
  data.results.filter(r=>r.driver_code==='A').forEach(r=>{r.points=300})
  const forecast=simulateChampionship(data)
  const context=forecast.next_race_clinch
  assert.equal(context.round,3)
  assert.equal(context.future_points,25)
  assert.equal(context.future_races,1)
  assert.equal(context.sprint_pending,true)
  assert.deepEqual(context.drivers.find(d=>d.driver_code==='A').race_finishes.slice(0,3),[2,0,0])
  for(const counter of context.conditional) {
    assert.ok(Number.isInteger(counter.samples)&&counter.samples>=0)
    assert.ok(counter.clinches>=0&&counter.clinches<=counter.samples)
    if(counter.driver_code==='A') assert.equal(counter.clinches,counter.samples)
    else assert.equal(counter.clinches,0)
  }
  assert.ok(context.conditional.find(c=>c.driver_code==='A'&&c.position===1).samples>0)
  data.calendar=data.calendar.slice(0,2)
  assert.equal(simulateChampionship(data).next_race_clinch,null)
})

test('Austin clinch boundary requires the win, Russell ninth or worse and Hamilton fifth or worse',()=>{
  const {clinchAgainst}=loaded.exports
  const ant={driver_code:'ANT',current_points:340,active:true,race_finishes:[8,0,0]}
  const rus={driver_code:'RUS',current_points:238,active:true,race_finishes:[3,0,0]}
  const ham={driver_code:'HAM',current_points:229,active:true,race_finishes:[1,0,0]}
  const afterAustin={future_points:125,future_races:5}
  assert.equal(clinchAgainst(ant,rus,1,9,afterAustin),'safe')
  assert.equal(clinchAgainst(ant,rus,1,8,afterAustin),'alive')
  assert.equal(clinchAgainst(ant,ham,1,5,afterAustin),'safe')
  assert.equal(clinchAgainst(ant,ham,1,4,afterAustin),'alive')
  assert.equal(clinchAgainst(ant,rus,2,0,afterAustin),'alive')
})

test('a proposed classification has enough classified cars to fill every selected place',()=>{
  const {feasibleClassification}=loaded.exports
  assert.equal(feasibleClassification(22,[1,9,5,2]),true)
  assert.equal(feasibleClassification(22,[1,0,22]),false)
  assert.equal(feasibleClassification(4,[0,4]),false)
  assert.equal(feasibleClassification(4,[0,3,2,1]),true)
  assert.equal(feasibleClassification(4,[1,1]),false)
  assert.equal(feasibleClassification(4,[0,0,0,0]),false)
})

test('automatic overview finds the Austin path for all 22 starters without selections',()=>{
  const {automaticClinchPaths}=loaded.exports
  const context={round:18,future_points:125,future_races:5,sprint_pending:false,conditional:[{driver_code:'ANT',position:1,samples:888,clinches:168}],
    drivers:Array.from({length:22},(_,i)=>({driver_code:['ANT','RUS','HAM'][i]??`D${i}`,active:true,current_points:[340,238,229][i]??0,race_finishes:[[8],[3],[1]][i]??[]}))}
  context.drivers.push({driver_code:'OLD',active:false,current_points:1,race_finishes:[]})
  const overview=automaticClinchPaths(context)
  assert.equal(overview.length,22)
  const ant=overview.find(d=>d.driver_code==='ANT')
  assert.equal(ant.status,'paths')
  assert.deepEqual(ant.paths,[{position:1,qualifying_needed:false,requirements:[
    {driver_code:'RUS',positions:[...Array.from({length:14},(_,i)=>i+9),0]},
    {driver_code:'HAM',positions:[...Array.from({length:18},(_,i)=>i+5),0]},
  ],samples:888,clinches:168}])
  assert.equal(overview.find(d=>d.driver_code==='RUS').status,'not_this_weekend')
  assert.equal(overview.find(d=>d.driver_code==='D3').status,'eliminated')
  context.sprint_pending=true
  assert.equal(automaticClinchPaths(context)[0].status,'sprint_pending')
  context.drivers[0].current_points=1000
  assert.equal(automaticClinchPaths(context)[0].status,'secured')
})

test('automatic paths agree with exhaustive valid classifications, including inactive rivals and countback ties',()=>{
  const {automaticClinchPaths,clinchAgainst,feasibleClassification}=loaded.exports
  const classifications=[]
  for(let a=0;a<=4;a++)for(let b=0;b<=4;b++)for(let c=0;c<=4;c++)for(let d=0;d<=4;d++) {
    const positions=[a,b,c,d]
    if(feasibleClassification(4,positions)) classifications.push(positions)
  }
  for(let trial=0;trial<30;trial++) {
    const context={round:2,future_points:trial%3*25,future_races:trial%3,sprint_pending:false,conditional:[],drivers:
      Array.from({length:5},(_,i)=>({driver_code:`D${i}`,active:i<4,current_points:(trial*17+i*13)%90,race_finishes:[(trial+i)%4,0,0,0]}))}
    const overview=automaticClinchPaths(context)
    for(let i=0;i<4;i++) {
      const candidate=context.drivers[i],row=overview[i]
      for(let position=0;position<=4;position++) {
        const possible=classifications.filter(grid=>grid[i]===position)
        const results=possible.map(grid=>context.drivers.filter((_,j)=>i!==j).map(rival=>clinchAgainst(candidate,rival,position,rival.active?grid[context.drivers.indexOf(rival)]:0,context)))
        const guaranteed=results.some(status=>status.every(s=>s==='safe'))
        const tied=results.some(status=>status.every(s=>s==='safe'||s==='tie'))
        const path=row.paths.find(p=>p.position===position)
        if(row.status==='secured') assert.ok(guaranteed)
        else {
          assert.equal(Boolean(path),tied,`trial ${trial}, D${i} P${position}`)
          if(path) assert.equal(path.qualifying_needed,!guaranteed)
        }
      }
    }
  }
})
