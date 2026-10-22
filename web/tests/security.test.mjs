import test from 'node:test'
import assert from 'node:assert/strict'
import { load } from './load.mjs'
const logs = { logEvent: () => {} }
const api = load('../src/lib/api.ts', { '@/lib/observability': logs })
const policy = load('../src/lib/request-policy.ts')
const outbound = load('../src/lib/outbound-url.ts')
const http = load('../src/lib/fetch.ts')

test('ingestion auth fails closed and never accepts a URL secret', () => {
  const previous = process.env.INGEST_KEY
  try {
    process.env.INGEST_KEY = 'test-secret'
    const req = (token) => new Request('https://example.com/api/ingest/rss?key=test-secret', { headers: token ? { authorization: token } : {} })
    assert.equal(api.validateIngestAuth(req()), false)
    assert.equal(api.validateIngestAuth(req('Bearer wrong')), false)
    assert.equal(api.validateIngestAuth(req('Bearer test-secret')), true)
    delete process.env.INGEST_KEY
    assert.equal(api.validateIngestAuth(req('Bearer test-secret')), false)
  } finally { if (previous === undefined) delete process.env.INGEST_KEY; else process.env.INGEST_KEY = previous }
})
test('500 responses do not reveal exception or database details', async () => {
  const response = api.err('postgres://owner:password@private/db')
  assert.equal(response.status, 500)
  assert.doesNotMatch(JSON.stringify(await response.json()), /password|postgres|owner/)
  assert.equal(response.headers.get('cache-control'), 'no-store')
})
test('invalid input, duplicate parameters, and expensive ranges are rejected', () => {
  for (const query of ['days=-1', 'days=NaN', 'days=999999', 'limit=0', 'limit=50000', 'round=1abc', 'q=a&q=b', `q=${'x'.repeat(257)}`]) {
    assert.ok(policy.validateApiRequest(new URL(`https://example.com/api/news/stories?${query}`)), query)
  }
  for (const id of ['NaN', '-1', '0', '1junk', '2147483648']) assert.ok(policy.validateApiRequest(new URL(`https://example.com/api/racing/replay/${id}`)))
  assert.equal(policy.validateApiRequest(new URL('https://example.com/api/news/stories?limit=100&hours=720')), null)
})
test('article fetch policy rejects alternate schemes, private literals, credentials and deceptive hosts', () => {
  for (const url of ['http://www.bbc.com/news', 'https://127.0.0.1', 'https://www.bbc.com.evil.test/', 'https://user:pass@www.bbc.com/', 'https://www.bbc.com:8443/', 'file:///etc/passwd']) assert.equal(outbound.isArticleUrl(new URL(url)), false, url)
  assert.equal(outbound.isArticleUrl(new URL('https://www.bbc.com/sport/formula1')), true)
  for (const ip of ['127.0.0.1', '169.254.169.254', '10.0.0.1', '192.168.1.1', '::1', '::ffff:127.0.0.1', 'fc00::1']) assert.equal(outbound.isPublicAddress(ip), false, ip)
  assert.equal(outbound.isPublicAddress('1.1.1.1'), true)
})
test('retry delay grows exponentially, honors Retry-After and stays bounded', () => {
  assert.equal(http.retryDelay(0, null, 0, 0.5), 300)
  assert.equal(http.retryDelay(1, null, 0, 0.5), 600)
  assert.equal(http.retryDelay(2, '1', 0, 0.5), 1000)
  assert.equal(http.retryDelay(2, '999999', 0, 0.5), 2000)
})
test('upstream 503 is retried, successful body returned, POST never replayed', async () => {
  const original = globalThis.fetch
  let calls = 0
  try {
    globalThis.fetch = async () => ++calls === 1 ? new Response('busy', { status: 503, headers: { 'Retry-After': '0' } }) : new Response('ready')
    assert.equal(await (await http.fetchWithRetry('https://example.com', {}, 1000)).text(), 'ready')
    assert.equal(calls, 2)
    calls = 0
    assert.equal((await http.fetchWithRetry('https://example.com', { method: 'POST' }, 1000)).status, 503)
    assert.equal(calls, 1)
  } finally { globalThis.fetch = original }
})
test('body-read timeout and oversized streaming bodies cannot evade fetch bounds', async () => {
  const original = globalThis.fetch
  try {
    globalThis.fetch = async (_url, { signal }) => new Response(new ReadableStream({ start(controller) { signal.addEventListener('abort', () => controller.error(signal.reason), { once: true }) } }))
    // Keep the test event loop alive while AbortSignal.timeout's unref timer runs.
    const keepAlive = setInterval(() => {}, 100)
    try { await assert.rejects(http.fetchWithTimeout('https://example.com', {}, 20)) } finally { clearInterval(keepAlive) }
    globalThis.fetch = async () => new Response(new Uint8Array(http.MAX_RESPONSE_BYTES + 1))
    await assert.rejects(http.fetchWithTimeout('https://example.com', {}, 1000), /size limit/)
  } finally { globalThis.fetch = original }
})
test('RSS article and story writes commit together in one transaction', async () => {
  let transactions = 0
  let immediateWrites = 0
  const sql = (strings, ...values) => {
    const text = strings.join('?')
    if (/INSERT/.test(text)) immediateWrites++
    return { text, values }
  }
  sql.transaction = async queries => {
    transactions++
    assert.equal(queries.length, 3)
    assert.match(queries[1].text, /INSERT INTO event_f1_only/)
    assert.match(queries[2].text, /INSERT INTO story_timeline/)
    return [[], [{ inserted: true }], []]
  }
  const rss = load('../src/lib/rss-ingest.ts', {
    '@/lib/neon': { getNeonSql: () => sql },
    '@/lib/fetch': { fetchAllowedResponse: async () => new Response('<rss/>') },
    '@/lib/text': { EMPTY_FULL_TEXT: { full_title: '', meta_description: '', content_text: '' }, cleanSummary: s => s, parseRssFeed: () => [{ link: 'https://www.bbc.com/news/f1', title: 'Formula 1 news', summary: 'Race news', published_at: '2026-10-20T12:00:00Z' }] },
  })
  const result = await rss.ingestRssToNeon({ fetchHtml: false, tier: 'official' })
  assert.equal(transactions, 2)
  assert.equal(immediateWrites, 4)
  assert.equal(result.inserted, 2)
})
test('refresh stages every write and publishes a single transaction', async () => {
  let transactions = 0
  let immediateWrites = 0
  const sql = (strings, ...values) => {
    const text = strings.join('?')
    if (text.includes('SELECT url, title')) return Promise.resolve([{ url: 'https://example.com/f1', title: 'Hamilton wins for Ferrari', summary: 'Formula 1 race', event_ts: new Date(), priority_score: 90 }])
    immediateWrites++
    return { text, values }
  }
  sql.transaction = async queries => {
    transactions++
    assert.ok(queries.some(q => q.text.includes('INSERT INTO daily_briefings')))
    assert.ok(queries.some(q => q.text.includes('pg_advisory_xact_lock')))
    assert.ok(queries.some(q => q.text.includes('WHERE NOT EXISTS')))
    assert.ok(queries.length > 5)
    return []
  }
  const refresh = load('../src/lib/neon-intelligence-refresh.ts', { '@/lib/neon': { getNeonSql: () => sql } })
  await refresh.refreshNeonIntelligence()
  assert.equal(transactions, 1)
  assert.ok(immediateWrites > 5)
})

test('every redirect is checked before a second outbound request', async () => {
  const original = globalThis.fetch
  let requests = 0
  const guarded = load('../src/lib/fetch.ts', { './outbound-url': { assertArticleUrl: async url => {
    if (!outbound.isArticleUrl(url)) throw new Error('Blocked destination')
  } } })
  try {
    globalThis.fetch = async () => { requests++; return new Response('', { status: 302, headers: { location: 'https://127.0.0.1/admin' } }) }
    await assert.rejects(guarded.fetchAllowedResponse('https://www.bbc.com/news', {}, 1000), /Blocked destination/)
    assert.equal(requests, 1)
  } finally { globalThis.fetch = original }
})
test('external links reject executable schemes and embedded credentials', () => {
  const { safeExternalUrl } = load('../src/lib/external-url.ts')
  for (const value of ['javascript:alert(1)', 'data:text/html,test', '//evil.test', 'https://a:b@example.com', null]) assert.equal(safeExternalUrl(value), '#')
  assert.equal(safeExternalUrl('https://www.bbc.com/sport'), 'https://www.bbc.com/sport')
})

test('public caching never caches errors or overrides explicit no-store', () => {
  assert.match(api.publicJson({ ok: true }).headers.get('cache-control'), /s-maxage=30/)
  assert.equal(api.publicJson({ error: 'failed' }, { status: 500 }).headers.get('cache-control'), 'no-store')
  assert.equal(api.publicJson({ ok: true }, { headers: { 'Cache-Control': 'no-store' } }).headers.get('cache-control'), 'no-store')
})

test('job leases exclude concurrent runs and record failures before release', async () => {
  let active = false
  const outcomes = []
  const sql = async (strings, ...values) => {
    const text = strings.join('?')
    if (text.includes('INSERT INTO app_ops.job_leases')) { if (active) return []; active = true; return [{ owner: values[1] }] }
    if (text.includes('INSERT INTO app_ops.audit_log')) outcomes.push(values[2])
    if (text.includes('DELETE FROM app_ops.job_leases')) active = false
    return []
  }
  const { runJob, JobBusyError } = load('../src/lib/jobs.ts', { '@/lib/neon': { getNeonSql: () => sql }, '@/lib/observability': logs })
  let release
  let workStarted
  const started = new Promise(resolve => { workStarted = resolve })
  const pending = runJob('test', () => { workStarted(); return new Promise(resolve => { release = resolve }) })
  await started
  await assert.rejects(runJob('test', async () => { throw new Error('must not execute') }), JobBusyError)
  assert.equal(active, true)
  release('done')
  assert.equal(await pending, 'done')
  assert.equal(active, false)
  await assert.rejects(runJob('test', async () => { throw new Error('upstream failed') }), /upstream failed/)
  assert.equal(active, false)
  assert.deepEqual(outcomes, ['started', 'busy', 'succeeded', 'started', 'failed'])
})
