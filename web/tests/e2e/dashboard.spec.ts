import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('f1b_booted', '1'));
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    let body: unknown = { ok: true, data: [] };
    if (url.pathname === '/api/calendar') body = [];
    if (url.pathname === '/api/intelligence/briefing') body = { ok: true, briefing: { headline: 'Verified race bulletin' } };
    if (url.pathname === '/api/news/stories') body = { ok: true, data: [{ story_id: 'fixture', story_title: 'Verified racing story', latest_source: 'BBC', latest_url: 'https://www.bbc.com/sport/formula1', events_count: 3, momentum_score: 40, latest_event_ts: new Date().toISOString() }] };
    if (url.pathname === '/api/standings') body = { standings: [{ Driver: { code: 'VER' }, Constructors: [{ name: 'Red Bull Racing' }], Constructor: { name: 'Red Bull Racing' }, points: '123' }] };
    if (url.pathname === '/api/stories' || /\/api\/standings\//.test(url.pathname)) return route.fulfill({ status: 404, json: { error: 'Obsolete route' } });
    await route.fulfill({ json: body });
  });
});

test('home loads news and standings through their actual API contracts', async ({ page }) => {
  const obsolete: string[] = [];
  page.on('request', req => { if (/\/api\/stories\?|\/api\/standings\//.test(req.url())) obsolete.push(req.url()); });
  await page.goto('/');
  await expect(page.locator('body')).toContainText('Verified racing story');
  await expect(page.locator('body')).toContainText('123');
  expect(obsolete).toEqual([]);
});

test('external news markup is displayed as text', async ({ page }) => {
  const payload = '<img src=x onerror="window.pwned=1">';
  await page.route('**/api/news/stories?**', route => route.fulfill({ json: { ok: true, data: [{ story_id: 'xss', story_title: payload, latest_url: 'https://www.bbc.com/sport/formula1', events_count: 1 }] } }));
  await page.goto('/stories');
  await expect(page.locator('body')).toContainText(payload);
  expect(await page.evaluate(() => Object.hasOwn(window, 'pwned'))).toBe(false);
});

test('stories show an actionable error when the API fails', async ({ page }) => {
  await page.route('**/api/news/stories?**', route => route.fulfill({ status: 503, json: { ok: false } }));
  await page.goto('/stories');
  await expect(page.getByText('Stories could not be loaded. Please try again.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
});

test('API rejects invalid inputs and unauthorized writes; security headers are present', async ({ request }) => {
  expect((await request.get('/api/racing/replay/1junk')).status()).toBe(400);
  expect((await request.post('/api/intelligence/refresh?key=invalid')).status()).toBe(401);
  const health = await request.get('/api/health');
  expect(health.status()).toBe(200);
  expect(health.headers()['x-content-type-options']).toBe('nosniff');
  expect(health.headers()['content-security-policy']).toContain("object-src 'none'");
  expect((await request.get('/api/health?ready=1')).status()).toBe(401);
});


test('intelligence leads each cluster with fresh news ahead of older high scores', async ({ page }) => {
  const now = Date.now();
  const story = (id: string, title: string, hours: number, momentum: number) => ({
    story_id: id, story_title: title, latest_source: 'BBC',
    latest_url: 'https://www.bbc.com/sport/formula1', events_count: 1,
    momentum_score: momentum, latest_event_ts: new Date(now - hours * 3600000).toISOString(),
  });
  let requestedAdaptive: string | null = null;
  await page.route('**/api/news/stories?**', route => {
    requestedAdaptive = new URL(route.request().url()).searchParams.get('adaptive');
    return route.fulfill({ json: { ok: true, data: [
      story('new', 'Ferrari upgrade unveiled today', 1, 20),
      story('older', 'Ferrari upgrade dominated yesterday', 48, 100),
    ] } });
  });
  await page.goto('/intelligence');
  await expect(page.getByText('Ferrari upgrade unveiled today').last()).toBeVisible();
  expect(requestedAdaptive).toBe('1');
  const cluster = page.getByRole('button', { name: '1 MORE STORIES' }).locator('..');
  await expect(cluster).toContainText('Ferrari upgrade unveiled today');
  await expect(cluster).not.toContainText('Ferrari upgrade dominated yesterday');
  await page.getByRole('button', { name: '1 MORE STORIES' }).click();
  await expect(page.getByText('Ferrari upgrade dominated yesterday').last()).toBeVisible();
});

test('quiet-week coverage labels older stories as context below current developments', async ({ page }) => {
  await page.route('**/api/news/stories?**', route => route.fulfill({ json: {
    ok: true,
    feed: { mode: 'between-races', windowHours: 168, currentHours: 72, halfLifeHours: 72, raceName: null, raceTerms: [] },
    data: [
      { story_id: 'today', story_title: 'Fresh driver contract confirmed', latest_source: 'fia', latest_event_ts: new Date().toISOString(), feed_section: 'current', feed_score: 40 },
      { story_id: 'context', story_title: 'Earlier engine rules explained', latest_source: 'BBC', latest_event_ts: new Date(Date.now() - 6 * 86400000).toISOString(), feed_section: 'context', feed_score: 15, is_breaking: false },
    ],
  } }));
  await page.goto('/intelligence');
  await expect(page.getByText('LATEST DEVELOPMENTS · 7-day coverage')).toBeVisible();
  const context = page.locator('section').filter({ hasText: 'Recent context' });
  await expect(context).toContainText('Earlier engine rules explained');
  await expect(context).toContainText('6d ago');
  await expect(context).not.toContainText('BREAKING');
  await expect(context).not.toContainText('Fresh driver contract confirmed');
  const fresh = page.getByText('Fresh driver contract confirmed').first();
  await expect(fresh).toBeVisible();
  expect(await fresh.evaluate((el) => el.getBoundingClientRect().top)).toBeLessThan(await context.evaluate((el) => el.getBoundingClientRect().top));
});

test('predictions show concise ranges without expandable details on desktop and mobile', async ({ page }) => {
  await page.route(url => url.pathname === '/api/predictions/rounds', route => route.fulfill({ json: { rounds: [{ round: 10, gp_name: 'Test Grand Prix' }] } }));
  await page.route(url => url.pathname === '/api/predictions', route => route.fulfill({ json: {
    season: 2026, round: 10, gp_name: 'Test Grand Prix', circuit: 'Test',
    model_version: 'prod_v7_coherent_robust_xgb_mc', confidence: .5,
    simulation_runs: 500, data_weight_2026: .9, training_seasons: '2021,2022,2023,2024,2025,2026',
    predicted_at: '2026-10-01T12:00:00Z', has_actuals: false, accuracy: null, championship: [],
    drivers: ['VER','NOR','LEC'].map((driver_code, i) => ({
      driver_code, team: 'Test Team', predicted_position: i+1, grid_position: i+1,
      win_probability: [0.5,0.3,0.2][i], podium_probability: 1,
      points_expected: 20-i, confidence: .5, elo_rating: 1500,
      gap_to_pole_ms: i*100, rolling_avg_finish: 3, is_upset_pick: false,
      upset_score: 0, actual_position: null, actual_points: null, position_error: null,
      forecast_details: { finish_p10: 1, finish_p90: 3, model_rank_spread: 2, mc_win_standard_error: .02,
        range_basis: i === 0 ? 'simulation_calibrated' : 'simulation', range_calibration_races: i === 0 ? 12 : 0 },
    })),
  } }));
  await page.goto('/predictions');
  await expect(page.getByText('Wide finishing uncertainty').first()).toBeVisible();
  await expect(page.getByText('Uncertainty details',{exact:true})).toHaveCount(0);
  await expect(page.locator('[title="P1–P3 · 80% target, unadjusted"]').first()).toBeVisible();
  await expect(page.locator('[title="P1–P3 · 80% target, history-adjusted"]').first()).toBeVisible();
  for (const range of await page.getByText('Wide finishing uncertainty',{exact:true}).all()) {
    if (!await range.isVisible()) continue;
    const bounds = await range.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  }
});


test('prediction screenshot distinguishes rank from win chance and preserves wide uncertainty',async({page})=>{
  await page.route(url=>url.pathname==='/api/predictions/rounds',r=>r.fulfill({json:{rounds:[{round:18,gp_name:'United States Grand Prix'}]}}))
  await page.route(url=>url.pathname==='/api/predictions',r=>r.fulfill({json:{
    season:2026,round:18,gp_name:'United States Grand Prix',circuit:'Austin',model_version:'prod_v8_calibrated_robust_xgb_mc',confidence:.71,
    simulation_runs:500,data_weight_2026:.9,training_seasons:'2025,2026',predicted_at:'2026-10-24T23:14:00Z',has_actuals:false,accuracy:null,championship:[],
    drivers:Array.from({length:22},(_,i)=>({driver_code:['VER','ANT','LEC'][i]??`D${i}`,team:'Test Team',predicted_position:i+1,grid_position:i+1,
      win_probability:i===0?.243:i===1?.415:.342/20,podium_probability:.65,points_expected:20-i/2,confidence:.71,elo_rating:1500,
      gap_to_pole_ms:i*100,rolling_avg_finish:3,is_upset_pick:false,upset_score:0,actual_position:null,actual_points:null,position_error:null,
      forecast_details:{finish_p10:1,finish_p90:i===1?20:6,model_rank_spread:i===1?1:3,range_basis:'simulation'},
    })),
  }}))
  await page.goto('/predictions')
  const summary=page.getByRole('region',{name:'Ranking and win probability explained'})
  await expect(summary).toContainText('Finish-order leader: VER')
  await expect(summary).toContainText('Highest win chance: ANT (41.5%)')
  await expect(page.getByText('DATA EVIDENCE',{exact:true})).toBeVisible()
  await expect(page.getByText('Heuristic · not forecast accuracy',{exact:true})).toBeVisible()
  await expect(page.getByText('Wide finishing uncertainty').first()).toBeVisible()
  await expect(page.getByText('1 places',{exact:false})).toHaveCount(0)
  for(const card of await page.locator('.pred-podium-order > div > div').all()) await expect(card).toHaveCSS('opacity','1')
  await page.getByText('FINISH-ORDER RANKING',{exact:true}).locator('..').locator('..').screenshot({animations:'disabled',style:'header { visibility: hidden !important; }',path:`/tmp/prediction-labels-${test.info().project.name}.png`})
  await expect(page.getByText('Uncertainty details',{exact:true})).toHaveCount(0)
  await expect(page.locator('[title="P1–P20 · 80% target, unadjusted"]').first()).toBeVisible()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)
})
