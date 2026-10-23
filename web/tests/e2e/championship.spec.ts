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

test('championship possibility map supports drivers, race scrubbing and exact probabilities', async ({ page }) => {
  await page.route('**/api/championship', route => route.fulfill({ json: { ok: true, ...fixture } }))
  await page.goto('/championship')
  await expect(page.getByRole('heading', { name: /THOUSANDS OF FUTURES/ })).toBeVisible()
  await expect(page.getByText('2 RACES LEFT')).toBeVisible()
  await expect(page.getByText('1 SPRINTS LEFT')).toBeVisible()
  const map = page.getByRole('region', { name: 'Interactive championship possibility map' })
  await expect(map.getByRole('img')).toBeVisible()
  for (const code of ['AAA','BBB','CCC','DDD']) await expect(page.getByRole('button', { name: `Follow ${code}`, exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Follow CCC', exact: true }).click()
  await expect(map.getByRole('img')).toHaveAccessibleName(/CCC championship possibilities/)
  await page.getByRole('group', { name: 'Choose a remaining race' }).getByRole('button', { name: /ROUND 2 Chinese/ }).click()
  await expect(page.getByRole('heading', { name: 'Chinese' })).toBeVisible()
  await page.getByLabel('Inspect position', { exact: true }).selectOption('2')
  const probability = fixture.races.find(r=>r.round===2&&r.driver_code==='CCC')!.championship_position_probabilities[1]
  await expect(page.locator('[aria-live="polite"]').filter({hasText:'of simulated outcomes'})).toContainText(`${(probability*100).toFixed(1)}%`)
  await page.getByRole('button', { name: 'Race finishes', exact: true }).click()
  await expect(map.getByRole('img')).toHaveAccessibleName(/CCC race finishing possibilities/)
  await page.getByLabel('SCRUB THE SEASON', { exact: true }).fill('1')
  await expect(page.getByRole('heading', { name: 'Japanese' })).toBeVisible()
  await page.getByRole('button', { name: 'Play season', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Pause season', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Pause season', exact: true }).click()
  await page.getByText('How to read this forecast', { exact: true }).click()
  await expect(page.getByText(/not calibrated championship probabilities/)).toBeVisible()
  await page.getByText('Exact position probabilities for CCC', { exact: true }).click()
  await expect(page.getByRole('table')).toBeVisible()
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
  await expect(page.getByRole('region', { name: 'Interactive championship possibility map' })).toBeVisible()
})

test('championship end-of-season state shows final standings with no future events', async ({ page }) => {
  const final = simulateChampionship({ season: 2026, results, simulations: 100,
    calendar: fixture.remaining.length ? [{ round: 1, race_name: 'Australian Grand Prix', circuit_name: 'Albert Park', race_start_utc: '2026-03-08T04:00:00Z', is_sprint_weekend: false, sprint_date: null }] : [] })
  await page.route('**/api/championship', route => route.fulfill({ json: { ok: true, ...final } }))
  await page.goto('/championship')
  await expect(page.getByText('0 RACES LEFT')).toBeVisible()
  await expect(page.getByText(/No races remain on the recorded calendar/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Race finishes', exact: true })).toBeDisabled()
  await expect(page.getByRole('region', { name: 'Interactive championship possibility map' }).getByRole('img')).toBeVisible()
})
