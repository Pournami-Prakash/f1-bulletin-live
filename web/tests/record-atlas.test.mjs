import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { load } from './load.mjs'
const supplied = JSON.parse(readFileSync(new URL('../src/lib/kimi-record-claims.json', import.meta.url), 'utf8'))
const records = load('../src/lib/driver-records.ts')
const { recordClaims } = load('../src/lib/record-atlas.ts', { './kimi-record-claims.json': supplied, './driver-records': records })

test('the record list preserves every supplied line once without expanding thresholds', () => {
  assert.equal(recordClaims.length, 229)
  assert.equal(new Set(recordClaims.map(c => c.id)).size, 229)
  assert.deepEqual(recordClaims.map(c => c.text), supplied)
})
test('source links do not silently certify similar team and circuit variants', () => {
  assert.equal(recordClaims.filter(c => c.source).length, 11)
  assert.equal(recordClaims.find(c => c.text.startsWith('Youngest Mercedes pole sitter')).source, null)
  assert.equal(recordClaims.find(c => c.text.startsWith('Youngest pole sitter:')).source.name, 'Guinness World Records')
  assert.equal(recordClaims.find(c => c.text.startsWith('Most overtakes')).source, null)
})
