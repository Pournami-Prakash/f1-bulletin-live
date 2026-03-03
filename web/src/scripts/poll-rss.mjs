// scripts/poll-rss.mjs
import { setTimeout as sleep } from "node:timers/promises";

const KEY = process.env.INGEST_KEY;
if (!KEY) {
  console.error("Missing INGEST_KEY in env.");
  process.exit(1);
}

const INGEST_URL = `http://localhost:3000/api/ingest/rss?key=${encodeURIComponent(KEY)}`;

function withTimeout(ms) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(new Error(`timeout_${ms}ms`)), ms);
  return { controller, clear: () => clearTimeout(t) };
}

async function fetchWithRetry(url, options, { retries = 2, timeoutMs = 25000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const { controller, clear } = withTimeout(timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clear();

      // Retry only on 5xx / 429 (server issues / rate-limit)
      if (res.status >= 500 || res.status === 429) {
        const body = await res.text().catch(() => "");
        throw new Error(`HTTP_${res.status} ${body.slice(0, 200)}`);
      }

      return res;
    } catch (e) {
      clear();
      lastErr = e;

      // backoff: 0.5s, 1s, 2s ...
      const backoff = 500 * Math.pow(2, attempt);
      await sleep(backoff);
    }
  }
  throw lastErr;
}

let isRunning = false;

async function runOnce() {
  if (isRunning) {
    console.log(new Date().toISOString(), "skip: previous run still running");
    return;
  }
  isRunning = true;

  try {
    const res = await fetchWithRetry(
      INGEST_URL,
      { method: "POST" },
      { timeoutMs: 30000, retries: 2 }
    );

    const text = await res.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text.slice(0, 500) };
    }

    console.log(new Date().toISOString(), "status", res.status, payload);
  } catch (e) {
    console.error(new Date().toISOString(), "ingest failed:", e?.message || e);
  } finally {
    isRunning = false;
  }
}

await runOnce();
setInterval(runOnce, 5 * 60 * 1000);
