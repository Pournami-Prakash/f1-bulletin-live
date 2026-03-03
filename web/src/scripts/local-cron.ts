/**
 * scripts/local-cron.ts
 * Local development cron runner.
 * For production, replace with a GitHub Actions scheduled workflow.
 *
 * Usage:
 *   INGEST_KEY=xxx npx tsx scripts/local-cron.ts
 */

import cron from "node-cron";

const INGEST_KEY = process.env.INGEST_KEY;
if (!INGEST_KEY) {
  console.error("[cron] INGEST_KEY is not set. Exiting.");
  process.exit(1);
}

const BASE_URL = process.env.APP_URL ?? "http://localhost:3000";

// Authorization header — no credentials in query params
const AUTH_HEADERS = {
  Authorization: `Bearer ${INGEST_KEY}`,
  "Content-Type": "application/json",
};

// ---------------------------------------------------------------------------
// HTTP helper (retry + timeout)
// ---------------------------------------------------------------------------

async function postWithRetry(
  url: string,
  { retries = 2, timeoutMs = 45_000 }: { retries?: number; timeoutMs?: number } = {}
): Promise<void> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(new Error(`timeout_${timeoutMs}ms`)), timeoutMs);

    try {
      const res = await fetch(url, { method: "POST", headers: AUTH_HEADERS, signal: ctrl.signal });
      clearTimeout(timer);

      const text = await res.text().catch(() => "");

      if (res.status >= 500 || res.status === 429) {
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      }

      try {
        console.log(`[cron] OK (${res.status}):`, JSON.parse(text));
      } catch {
        console.log(`[cron] OK (${res.status}):`, text.slice(0, 400));
      }
      return;
    } catch (e) {
      clearTimeout(timer);
      lastError = e;
      if (attempt < retries) {
        const backoff = 500 * 2 ** attempt;
        console.warn(`[cron] Attempt ${attempt + 1} failed, retrying in ${backoff}ms…`);
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
  }

  console.error("[cron] All retries exhausted:", (lastError as Error)?.message ?? lastError);
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

let running = false;

async function ingest(label: string, url: string, timeoutMs: number) {
  if (running) {
    console.log(`[cron] Skipping "${label}" — previous run still active`);
    return;
  }
  running = true;
  console.log(`[cron] Starting "${label}" at`, new Date().toISOString());
  try {
    await postWithRetry(url, { timeoutMs, retries: 2 });
  } finally {
    running = false;
  }
}

const RSS_URL          = `${BASE_URL}/api/ingest/rss`;
const RSS_HTML_URL     = `${BASE_URL}/api/ingest/rss?html=1&tier=official`;

// Every 5 minutes: fast RSS-only pass
cron.schedule("*/5 * * * *", () =>
  ingest("rss-only", RSS_URL, 45_000)
);

// Every 30 minutes: HTML enrichment for official tier
cron.schedule("*/30 * * * *", () =>
  ingest("html-official", RSS_HTML_URL, 90_000)
);

console.log("[cron] Started. RSS every 5 min · HTML official every 30 min.");

// Immediate startup run
ingest("rss-only (startup)", RSS_URL, 45_000);
