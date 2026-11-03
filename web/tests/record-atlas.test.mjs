import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { load } from './load.mjs'
const supplied = JSON.parse(readFileSync(new URL('../src/lib/kimi-record-claims.json', import.meta.url), 'utf8'))
const records = load('../src/lib/driver-records.ts')
const { recordClaims, recordLenses, recordMoments } = load('../src/lib/record-atlas.ts', { './kimi-record-claims.json': supplied, './driver-records': records })

test('the atlas preserves every supplied line once without expanding thresholds', () => {
  assert.equal(recordClaims.length, 229)
  assert.equal(new Set(recordClaims.map(c => c.id)).size, 229)
  assert.deepEqual(recordClaims.map(c => c.text), supplied)
  assert.equal(recordLenses.reduce((sum, lens) => sum + recordClaims.filter(c => c.lens === lens.id).length, 0), 229)
})
test('source links do not silently certify similar team and circuit variants', () => {
  assert.equal(recordClaims.filter(c => c.source).length, 11)
  assert.equal(recordClaims.find(c => c.text.startsWith('Youngest Mercedes pole sitter')).source, null)
  assert.equal(recordClaims.find(c => c.text.startsWith('Youngest pole sitter:')).source.name, 'Guinness World Records')
  assert.equal(recordClaims.find(c => c.text.startsWith('Most overtakes')).source, null)
})
test('year filters preserve unstated/mixed years and moments have primary sources', () => {
  assert.equal(recordClaims.find(c => c.text === 'Only teenage pole sitter').year, null)
  assert.equal(recordClaims.find(c => c.text.startsWith('Most points in a driver’s first two seasons')).year, null)
  assert.equal(recordClaims.find(c => c.text.startsWith('Youngest world champion:')).year, 2026)
  assert.equal(recordMoments.length, 8)
  for (const moment of recordMoments) assert.match(moment.source, /^https:\/\/(www\.)?(formula1\.com|fia\.com|mercedesamgf1\.com|guinnessworldrecords\.com)\//)
})
