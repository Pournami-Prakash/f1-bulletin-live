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
  let requestedHours: string | null = null;
  await page.route('**/api/news/stories?**', route => {
    requestedHours = new URL(route.request().url()).searchParams.get('hours');
    return route.fulfill({ json: { ok: true, data: [
      story('new', 'Ferrari upgrade unveiled today', 1, 20),
      story('older', 'Ferrari upgrade dominated yesterday', 48, 100),
    ] } });
  });
  await page.goto('/intelligence');
  await expect(page.getByText('Ferrari upgrade unveiled today').last()).toBeVisible();
  expect(requestedHours).toBe('72');
  const cluster = page.getByRole('button', { name: '1 MORE STORIES' }).locator('..');
  await expect(cluster).toContainText('Ferrari upgrade unveiled today');
  await expect(cluster).not.toContainText('Ferrari upgrade dominated yesterday');
  await page.getByRole('button', { name: '1 MORE STORIES' }).click();
  await expect(page.getByText('Ferrari upgrade dominated yesterday').last()).toBeVisible();
});
