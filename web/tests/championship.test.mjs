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
