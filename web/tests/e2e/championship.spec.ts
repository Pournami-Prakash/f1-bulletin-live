import { test, expect } from '@playwright/test'
import { simulateChampionship, RACE_POINTS, type SeasonResult } from '../../src/lib/championship'

const results: SeasonResult[] = ['AAA','BBB','CCC','DDD'].map((driver_code, i) => ({
  season: 2026, round: 1, session_type: 'R', circuit: 'Albert Park', driver_code,
  team: i < 2 ? 'Ferrari' : 'McLaren', finish_position: i+1, grid_position: i+1,
  qualifying_position: i+1, status: 'Finished', points: RACE_POINTS[i], expected_drivers: 4,
}))
const fixture = simulateChampionship({ season: 2026, simulations: 100, results, now: '2026-03-10T00:00:00Z',
  calendar: [
    { round: 1, race_name: 'Australian Grand Prix', circuit_name: 'Albert Park', race_start_utc: '2026-03-08T04:00:00Z', is_sprint_weekend: false, sprint_date: null },
    { round: 2, race_name: 'Chinese Grand Prix', circuit_name: 'Shanghai', race_start_utc: '2026-03-15T07:00:00Z', is_sprint_weekend: true, sprint_date: '2026-03-14' },
    { round: 3, race_name: 'Japanese Grand Prix', circuit_name: 'Suzuka', race_start_utc: '2026-03-29T05:00:00Z', is_sprint_weekend: false, sprint_date: null },
  ] })

test.beforeEach(async ({page}) => {
  await page.route('**/api/standings?*', route => route.fulfill({json:{standings:[]}}))
})

test('quick summary, full names and optional grid keep the driver outlook first', async ({page}) => {
  await page.route('**/api/championship', route => route.fulfill({json:{ok:true,...fixture}}))
  await page.route('**/api/standings?*', route => route.fulfill({json:{standings:[
    {Driver:{code:'AAA',givenName:'Alex',familyName:'Example'}},
    {Driver:{code:'BBB',givenName:'Blair',familyName:'Example'}},
  ]}}))
  await page.goto('/championship')
  await page.getByText('Explore contender projections',{exact:true}).click()
  const summary=page.getByRole('region',{name:'Championship at a glance'})
  await expect(summary).toContainText('Alex Example')
  await expect(summary).toContainText('7 pts')
  await expect(page.getByText(/Updated after Australian Grand Prix/)).toBeVisible()
  await expect(page.getByRole('button',{name:'Follow Alex Example',exact:true})).toBeVisible()
  const grid=page.getByRole('region',{name:'Whole-grid position probabilities'})
  await expect(grid).toBeHidden()
  const disclosure=page.getByText('Show all drivers’ position chances',{exact:true})
  const inspector=page.locator('aside[aria-labelledby="inspector-heading"]')
  expect(await inspector.evaluate((el)=>Boolean(el.compareDocumentPosition(document.querySelector('details[class*="gridDisclosure"]')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true)
  await disclosure.click()
  await expect(grid).toBeVisible()
  await expect(grid.getByRole('button',{name:'Alex Example AAA',exact:true})).toBeVisible()
  await disclosure.click()
  await expect(grid).toBeHidden()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)
  await page.evaluate(()=>window.scrollTo(0,0))
  await page.screenshot({path:`/tmp/championship-${test.info().project.name}.png`,fullPage:true})
})

test('championship possibility map supports drivers, race scrubbing and exact probabilities', async ({ page }) => {
  await page.route('**/api/championship', route => route.fulfill({ json: { ok: true, ...fixture } }))
  await page.goto('/championship')
  await page.getByText('Explore contender projections',{exact:true}).click()
  await expect(page.getByRole('heading', { name: /CHAMPIONSHIP OUTLOOK/ })).toBeVisible()
  await expect(page.getByText('2 RACES LEFT')).toBeVisible()
  await expect(page.getByText('1 SPRINTS LEFT')).toBeVisible()
  await page.getByText('Build a custom scenario (optional)', { exact: true }).click()
  await page.getByLabel('AAA sprint finish', { exact: true }).selectOption('1')
  await expect(page.getByText('CHOOSE FEASIBLE SPRINT FINISHES', { exact: true })).toBeHidden()
  await page.getByLabel('BBB sprint finish', { exact: true }).selectOption('1')
  await expect(page.getByText('CHOOSE FEASIBLE SPRINT FINISHES', { exact: true })).toBeVisible()
  await page.getByLabel('BBB sprint finish', { exact: true }).selectOption('2')
  await expect(page.getByText('CHOOSE FEASIBLE SPRINT FINISHES', { exact: true })).toBeHidden()
  const map = page.getByRole('region', { name: 'Interactive championship possibility map' })
  await expect(map.getByRole('img')).toBeVisible()
  for (const code of ['AAA','BBB','CCC','DDD']) await expect(page.getByRole('button', { name: `Follow ${code}`, exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Follow CCC', exact: true }).click()
  await expect(map.getByRole('img')).toHaveAccessibleName(/CCC championship possibilities/)
  await page.getByRole('group', { name: 'Choose a remaining race' }).getByRole('button', { name: /ROUND 2 Chinese/ }).click()
  await expect(page.getByRole('heading', { name: 'Chinese', exact: true })).toBeVisible()
  await page.getByLabel('Inspect position', { exact: true }).selectOption('2')
  const probability = fixture.races.find(r=>r.round===2&&r.driver_code==='CCC')!.championship_position_probabilities[1]
  await expect(page.locator('[aria-live="polite"]').filter({hasText:'of simulated outcomes'})).toContainText(`${(probability*100).toFixed(1)}%`)
  await page.getByText('Explore race outcomes',{exact:true}).click()
  await page.getByRole('button', { name: 'Race finishes', exact: true }).click()
  await expect(map.getByRole('img')).toHaveAccessibleName(/CCC race finishing possibilities/)
  await page.getByLabel('Choose a race', { exact: true }).fill('1')
  await expect(page.getByRole('heading', { name: 'Japanese', exact: true })).toBeVisible()
  await page.getByText('Show all drivers’ position chances', {exact:true}).click()
  const field = page.getByRole('region', { name: 'Whole-grid position probabilities' })
  await expect(page.getByRole('heading', { name: 'Japanese finishing order' })).toBeVisible()
  for (const code of ['AAA','BBB','CCC','DDD']) await expect(field.getByRole('button', { name: code, exact: true })).toBeVisible()
  await field.getByRole('button', { name: 'DDD', exact: true }).click()
  await expect(map.getByRole('img')).toHaveAccessibleName(/DDD race finishing possibilities/)
  await page.getByRole('button', { name: 'Follow CCC', exact: true }).click()
  await page.getByRole('button', { name: 'Play season', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Pause season', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Pause season', exact: true }).click()
  await page.getByText('How to read this forecast', { exact: true }).click()
  await expect(page.getByText(/not calibrated championship probabilities/)).toBeVisible()
  await page.getByText('Exact position probabilities for CCC', { exact: true }).click()
  await expect(page.getByRole('table', { name: /^CCC · .*probabilities by round/ })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth+1)).toBe(true)
  await expect(page.getByRole('link', { name: 'FIA championship scoring and countback rules' })).toHaveAttribute('rel', /noopener/)
})

test('championship handles a failed forecast and recovers on retry without preview data', async ({ page }) => {
  let failing = true
  await page.route('**/api/championship', route => {
    return failing ? route.fulfill({ status: 503, json: { ok: false, error: 'Waiting for complete race results.' } })
      : route.fulfill({ json: { ok: true, ...fixture } })
  })
  await page.goto('/championship')
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Waiting for complete race results.')
  failing = false
  await page.getByRole('button', { name: 'Try again' }).click()
  await page.getByText('Explore contender projections',{exact:true}).click()
  await expect(page.getByRole('region', { name: 'Interactive championship possibility map' })).toBeVisible()
})

test('championship end-of-season state shows final standings with no future events', async ({ page }) => {
  const final = simulateChampionship({ season: 2026, results, simulations: 100,
    calendar: fixture.remaining.length ? [{ round: 1, race_name: 'Australian Grand Prix', circuit_name: 'Albert Park', race_start_utc: '2026-03-08T04:00:00Z', is_sprint_weekend: false, sprint_date: null }] : [] })
  await page.route('**/api/championship', route => route.fulfill({ json: { ok: true, ...final } }))
  await page.goto('/championship')
  await page.getByText('Explore contender projections',{exact:true}).click()
  await expect(page.getByText('0 RACES LEFT')).toBeVisible()
  await expect(page.getByText(/No races remain on the recorded calendar/)).toBeVisible()
  await page.getByText('Explore race outcomes',{exact:true}).click()
  await expect(page.getByRole('button', { name: 'Race finishes', exact: true })).toBeDisabled()
  await expect(page.getByRole('region', { name: 'Interactive championship possibility map' }).getByRole('img')).toBeVisible()
})

test('clinch map combines rival conditions and prevents duplicate finishes', async ({ page }) => {
  const clinchFixture=simulateChampionship({season:2026,simulations:100,results:[...results,{...results[0],driver_code:'EEE',finish_position:5,points:0},{...results[0],driver_code:'FFF',finish_position:6,points:0}].map(r=>({...r,expected_drivers:6,points:r.driver_code==='AAA'?60:r.points})),
    now:'2026-03-10T00:00:00Z', calendar:[
      {round:1,race_name:'Australian Grand Prix',circuit_name:'Albert Park',race_start_utc:'2026-03-08T04:00:00Z',is_sprint_weekend:false,sprint_date:null},
      {round:2,race_name:'United States Grand Prix',circuit_name:'Austin',race_start_utc:'2026-10-25T19:00:00Z',is_sprint_weekend:false,sprint_date:null},
      {round:3,race_name:'Japanese Grand Prix',circuit_name:'Suzuka',race_start_utc:'2026-11-01T05:00:00Z',is_sprint_weekend:false,sprint_date:null},
    ]})
  await page.route('**/api/championship',route=>route.fulfill({json:{ok:true,...clinchFixture}}))
  await page.goto('/championship')
  await page.getByText('Build a custom scenario (optional)', { exact: true }).click()
  await expect(page.getByRole('heading',{name:/CAN THE TITLE BE WON/})).toBeVisible()
  await expect(page.getByText('AAA CLINCHES THE TITLE',{exact:true})).toBeVisible()
  await page.getByLabel('Contender race finish',{exact:true}).selectOption('0')
  const grid=page.getByRole('region',{name:'Title clinching conditions by rival finish'})
  await expect(grid.getByRole('button',{name:'BBB P6: Impossible classification',exact:true})).toBeDisabled()
  await grid.getByRole('button',{name:'BBB P1: Still blocks the clinch',exact:true}).click()
  await expect(page.getByText('THE TITLE RACE STAYS OPEN',{exact:true})).toBeVisible()
  await expect(page.getByText(/BBB can still catch AAA with this result/)).toBeVisible()
  await expect(grid.getByRole('button',{name:'CCC P1: Place already occupied',exact:true})).toBeDisabled()
  await grid.getByRole('button',{name:'CCC P2: Cannot stop the title',exact:true}).click()
  await grid.getByRole('button',{name:'DDD P3: Cannot stop the title',exact:true}).click()
  await expect(page.getByText('THE TITLE RACE STAYS OPEN',{exact:true})).toBeVisible()
  await grid.getByRole('button',{name:'BBB P4: Cannot stop the title',exact:true}).click()
  await expect(page.getByText('AAA CLINCHES THE TITLE',{exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Reset rivals',exact:true}).click()
  await page.getByLabel('Championship driver',{exact:true}).selectOption('BBB')
  await expect(page.getByText('BBB CANNOT CLINCH WITH NC',{exact:true})).toBeVisible()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)
})


test('full-season roster has consistent scales and collision-free labels for every driver', async ({page})=>{
  // Exercise 44 driver/view combinations, including WebKit scrolling between panels.
  test.setTimeout(120000)
  const roster=Array.from({length:23},(_,i)=>`D${String(i).padStart(2,'0')}`)
  const calendar=[1,2,3,4].map(round=>({round,race_name:round===3?'United States Grand Prix':`Race ${round}`,circuit_name:`Track ${round}`,
    race_start_utc:`2026-${String(round).padStart(2,'0')}-08T04:00:00Z`,is_sprint_weekend:false,sprint_date:null}))
  const classified=[1,2].flatMap(round=>roster.slice(0,round===1?23:22).map((driver_code,i)=>({
    season:2026,round,session_type:'R' as const,circuit:`Track ${round}`,driver_code,team:'Ferrari',
    finish_position:i+1,grid_position:i+1,qualifying_position:i+1,status:'Finished',points:RACE_POINTS[i]??0,expected_drivers:round===1?23:22,
  })))
  const large=simulateChampionship({season:2026,results:classified,calendar,simulations:100,now:'2026-02-10T00:00:00Z'})
  await page.route('**/api/championship',route=>route.fulfill({json:{ok:true,...large}}))
  await page.goto('/championship')
  await page.getByText('Explore contender projections',{exact:true}).click()
  await page.getByText('Show all drivers’ position chances', {exact:true}).click()
  const field=page.getByRole('region',{name:'Whole-grid position probabilities'})
  await expect(field.getByRole('row')).toHaveCount(24)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)
  await page.getByText('Explore race outcomes',{exact:true}).click()
  await page.getByRole('button',{name:'Race finishes',exact:true}).click()
  await expect(field.getByRole('row')).toHaveCount(23)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)
  const map=page.getByRole('region',{name:'Interactive championship possibility map'})
  for(const mode of ['Championship positions','Race finishes']) {
    await page.getByRole('button',{name:mode,exact:true}).click()
    for(const driver of large.drivers.filter(d=>d.active)) {
      await page.getByRole('button',{name:`Follow ${driver.driver_code}`,exact:true}).click()
      const overlaps=await map.evaluate(el=>{
        const labels=[...el.querySelectorAll('svg text')].map(t=>{const b=(t as SVGGraphicsElement).getBBox();return {text:t.textContent,x:b.x,y:b.y,w:b.width,h:b.height}})
        const collisions:string[]=[]
        for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++){
          const a=labels[i],b=labels[j]
          if(Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)>2&&Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)>2)collisions.push(`${a.text} / ${b.text}`)
        }
        return collisions
      })
      expect(overlaps,`${mode}: ${driver.driver_code}`).toEqual([])
      const bars=await page.locator('[class*="spectrum"] button').evaluateAll(elements=>elements.map(el=>({
        rank:Number(el.getAttribute('aria-label')!.match(/^P(\d+)/)![1]),
        ratio:el.querySelector('[class*="bar"]')!.getBoundingClientRect().width/el.querySelector('[class*="track"]')!.getBoundingClientRect().width,
      })))
      const event=large.races.find(r=>r.round===4&&r.driver_code===driver.driver_code)!
      const probabilities=mode==='Championship positions'?event.championship_position_probabilities:event.position_probabilities
      for(const bar of bars) expect(Math.abs(bar.ratio-probabilities[bar.rank-1]),`${driver.driver_code} P${bar.rank} bar scale`).toBeLessThan(.015)
      await expect(map.getByRole('img')).toHaveAccessibleDescription(/Positions P1 to P2[23].*fixed 0–100% scale/)
    }
  }
})


test('eliminated drivers stay out of the title fight and remain available in optional outlooks',async({page})=>{
  const out=simulateChampionship({season:2026,results:results.map(r=>({...r,points:r.driver_code==='AAA'?300:r.points})),simulations:100,
    now:'2026-03-10T00:00:00Z',calendar:[
      {round:1,race_name:'Australian Grand Prix',circuit_name:'Albert Park',race_start_utc:'2026-03-08T04:00:00Z',is_sprint_weekend:false,sprint_date:null},
      ...fixture.remaining.map(e=>({...e,is_sprint_weekend:false,sprint_date:null})),
    ]})
  await page.route('**/api/championship',r=>r.fulfill({json:{ok:true,...out}}))
  await page.goto('/championship')
  const fight=page.getByRole('region',{name:'The title fight',exact:true})
  await expect(fight.getByRole('button')).toHaveCount(1)
  await expect(fight).toContainText('AAA')
  await expect(fight).not.toContainText('BBB')
  await expect(page.getByRole('region',{name:'Interactive championship possibility map'})).toBeHidden()
  await page.getByText('Build a custom scenario (optional)',{exact:true}).click()
  await expect(page.getByLabel('Championship driver').locator('option')).toHaveCount(1)
  await page.getByText('Other drivers’ season outlooks',{exact:false}).click()
  await page.getByRole('group',{name:'Other drivers',exact:true}).getByRole('button',{name:/BBB/}).click()
  const map=page.getByRole('region',{name:'Interactive championship possibility map'})
  await expect(map.getByRole('img')).toHaveAccessibleName(/BBB championship possibilities/)
  await page.getByText('Explore race outcomes',{exact:true}).click()
  await page.getByRole('button',{name:'Race finishes',exact:true}).click()
  await expect(map.getByRole('img')).toHaveAccessibleName(/BBB race finishing possibilities/)
  await page.getByText('Explore race outcomes',{exact:true}).click()
  await expect(map.getByRole('img')).toHaveAccessibleName(/BBB championship possibilities/)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)
  await page.getByText('Explore contender projections',{exact:true}).click()
  await page.evaluate(()=>window.scrollTo(0,0))
  await page.getByText('Build a custom scenario (optional)',{exact:true}).click()
  await page.getByText('Other drivers’ season outlooks',{exact:false}).click()
  await page.evaluate(()=>window.scrollTo(0,0))
  await page.screenshot({path:`/tmp/championship-redesign-${test.info().project.name}.png`,fullPage:true})
})

test('automatic title paths and the full field are visible without choosing a driver or finish',async({page})=>{
  const data=structuredClone(fixture)
  data.remaining[0].is_sprint_weekend=false
  data.next_race_clinch={round:2,future_points:25,future_races:1,sprint_pending:false,conditional:[{driver_code:'AAA',position:1,samples:20,clinches:5}],
    drivers:results.map(r=>({driver_code:r.driver_code,active:true,current_points:r.driver_code==='AAA'?60:r.driver_code==='BBB'?43:0,race_finishes:r.driver_code==='AAA'?[4]:[0]}))}
  await page.route('**/api/championship',r=>r.fulfill({json:{ok:true,...data}}))
  await page.goto('/championship')
  const path=page.getByRole('article',{name:'AAA automatic clinching path 1'})
  await expect(path.getByText('MUST WIN',{exact:true})).toBeVisible()
  await page.evaluate(()=>window.scrollTo(0,0))
  await page.screenshot({path:`/tmp/championship-title-fight-${test.info().project.name}.png`,fullPage:true})
  await expect(path.getByText('BBB',{exact:true})).toBeVisible()
  await expect(path.getByText('P3–P4 or unclassified',{exact:true})).toBeVisible()
  await expect(path.getByText('25.0%',{exact:true})).toBeHidden()
  await path.getByText('Explore simulation estimate',{exact:true}).click()
  await expect(path.getByText('25.0%',{exact:true})).toBeVisible()
  const fight=page.getByRole('region',{name:'The title fight',exact:true})
  for(const code of ['AAA','BBB','CCC','DDD']) await expect(fight.getByRole('button',{name:`Explore ${code} championship outlook`,exact:true})).toBeVisible()
  await expect(page.getByLabel('Championship driver',{exact:true})).toBeHidden()
  await expect(page.getByLabel('Contender race finish',{exact:true})).toBeHidden()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)
  await page.getByText('Build a custom scenario (optional)',{exact:true}).click()
  await expect(page.getByLabel('Championship driver',{exact:true})).toBeVisible()
})


test('zero sampled titles are distinct from mathematical points elimination', async ({page}) => {
  const data=structuredClone(fixture)
  const contender=data.drivers.find(d=>d.driver_code==='BBB')!
  contender.title_probability=0
  contender.points_eliminated=false
  const eliminated=data.drivers.find(d=>d.driver_code==='DDD')!
  eliminated.current_points=0
  eliminated.maximum_points=0
  eliminated.title_probability=0
  eliminated.points_eliminated=true
  await page.route('**/api/championship',r=>r.fulfill({json:{ok:true,...data}}))
  await page.goto('/championship')
  await expect(page.getByRole('heading',{level:1})).toHaveText('CHAMPIONSHIP OUTLOOK')
  const fight=page.getByRole('region',{name:'The title fight',exact:true})
  await expect(fight.getByRole('button',{name:'Explore BBB championship outlook',exact:true})).toBeVisible()
  await expect(fight.getByRole('button',{name:'Explore DDD championship outlook',exact:true})).toHaveCount(0)
  await expect(page.getByRole('region',{name:'Interactive championship possibility map'})).toBeHidden()
  await fight.getByRole('button',{name:'Explore BBB championship outlook',exact:true}).click()
  await page.getByRole('button',{name:'Follow BBB',exact:true}).click()
  await expect(page.locator('aside').locator('dl > div').filter({hasText:'Simulated title share'}).locator('dd')).toHaveText('—')
  await page.getByText('Show all drivers’ position chances',{exact:true}).click()
  const grid=page.getByRole('region',{name:'Whole-grid position probabilities'})
  await expect(grid.getByRole('columnheader',{name:'Simulated title share',exact:true})).toBeVisible()
  await expect(grid.getByRole('row').filter({has:page.getByRole('button',{name:'BBB',exact:true})}).getByRole('cell').last()).toHaveText('—')
  await expect(page.getByText('No sampled titles',{exact:false})).toHaveCount(0)
  await expect(grid.getByRole('row').filter({has:page.getByRole('button',{name:'DDD',exact:true})})).toContainText('Out on points')
  await expect(page.getByText(/Simulated title share covers all remaining races/)).toBeVisible()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)
})


test('contender map omits empty positions and preserves rare outcomes across the timeline',async({page})=>{
  const data=structuredClone(fixture)
  // A long season roster should not force empty positions into a contender-only chart.
  for(let i=0;i<19;i++) data.drivers.push({...data.drivers[0],driver_code:`X${i}`,current_position:i+5,active:false,points_eliminated:true,title_probability:0})
  for(const d of data.drivers) {
    const values=Array(23).fill(0)
    values[Math.min(d.current_position,23)-1]=1
    d.position_probabilities=values
  }
  for(const r of data.races) {
    r.championship_position_probabilities=[...r.championship_position_probabilities,...Array(19).fill(0)]
  }
  // One rare P7 outcome at a different round must remain in the axis range.
  const rare=data.races.find(r=>r.driver_code==='BBB'&&r.round===2)!
  const donor=rare.championship_position_probabilities.findIndex(p=>p>.001)
  rare.championship_position_probabilities[donor]-=.001
  rare.championship_position_probabilities[6]=.001
  await page.route('**/api/championship',r=>r.fulfill({json:{ok:true,...data}}))
  await page.goto('/championship')
  await page.getByRole('button',{name:'Explore AAA championship outlook',exact:true}).click()
  const map=page.getByRole('region',{name:'Interactive championship possibility map'})
  await expect(map.getByRole('img')).toHaveAccessibleDescription(/Positions P1 to P7/)
  await expect(map.getByText('P7',{exact:true})).toBeVisible()
  await expect(map.getByText('P8',{exact:true})).toHaveCount(0)
  const box=await map.getByRole('img').getAttribute('viewBox')
  await page.getByRole('button',{name:'Follow BBB',exact:true}).click()
  await page.getByRole('group',{name:'Choose a remaining race'}).getByRole('button',{name:/ROUND 2 Chinese/}).click()
  await expect(map.getByRole('img')).toHaveAttribute('viewBox',box!)
  await page.getByText('Other drivers’ season outlooks',{exact:false}).click()
  await page.getByRole('group',{name:'Other drivers',exact:true}).getByRole('button',{name:/X18/}).click()
  await expect(map.getByRole('img')).toHaveAccessibleDescription(/Positions P1 to P23/)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)
})


test('main championship tracker uses scoring facts and keeps uncalibrated frequencies optional',async({page})=>{
  const data=structuredClone(fixture)
  data.drivers.find(d=>d.driver_code==='BBB')!.title_probability=0
  await page.route('**/api/championship',r=>r.fulfill({json:{ok:true,...data}}))
  await page.goto('/championship')
  const fight=page.getByRole('region',{name:'The title fight',exact:true})
  const challenger=fight.getByRole('button',{name:'Explore BBB championship outlook',exact:true})
  await expect(challenger).toContainText('+8 vs leader')
  await expect(challenger).toContainText('76') // 18 recorded points + 2 races (50) + 1 sprint (8).
  await expect(fight).not.toContainText('%')
  await expect(page.getByText('58 POINTS AVAILABLE',{exact:true})).toBeVisible()
  await expect(page.getByRole('region',{name:'Interactive championship possibility map'})).toBeHidden()
  await page.screenshot({path:`/tmp/championship-facts-${test.info().project.name}.png`,fullPage:true})
  await challenger.click()
  await expect(page.getByText(/percentages describe this model’s outcomes/)).toBeVisible()
  await expect(page.locator('aside')).toContainText('Simulated title share')
  await expect(page.getByText(/calibrated against historical title races/)).toBeVisible()
})
