#!/usr/bin/env node
// Intentionally bounded and local-only: never accidentally stress production.
import { performance } from 'node:perf_hooks';
const url = new URL(process.argv[2] || 'http://127.0.0.1:3101/api/news/stories?limit=20');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('Load tests must target a local server');
const total = 50;
const concurrency = 5;
const timings = [];
const statuses = {};
let bytes = 0;
const started = performance.now();
await Promise.all(Array.from({ length: concurrency }, async (_, worker) => {
  for (let i = worker; i < total; i += concurrency) {
    const before = performance.now();
    try {
      const result = await fetch(url, { signal: AbortSignal.timeout(10000) });
      bytes += (await result.arrayBuffer()).byteLength;
      statuses[result.status] = (statuses[result.status] || 0) + 1;
    } catch { statuses.network_error = (statuses.network_error || 0) + 1; }
    timings.push(performance.now() - before);
  }
}));
timings.sort((a,b) => a-b);
const percentile = p => Math.round(timings[Math.min(timings.length - 1, Math.ceil(timings.length * p) - 1)]);
console.log(JSON.stringify({ total, concurrency, statuses, elapsedMs: Math.round(performance.now() - started), p50Ms: percentile(.5), p95Ms: percentile(.95), p99Ms: percentile(.99), bytes }, null, 2));
if (Object.keys(statuses).some(code => code !== '200')) process.exitCode = 1;
