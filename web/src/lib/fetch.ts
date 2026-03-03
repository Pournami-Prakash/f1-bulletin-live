/**
 * lib/fetch.ts
 * Lightweight HTTP helpers used by ingestion routes.
 */

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  retries = 1
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetchWithTimeout(url, init, timeoutMs);
    } catch (e) {
      lastError = e;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

export async function fetchFullTextSafe(
  url: string,
  timeoutMs: number
): Promise<import("./text").FullTextResult> {
  const { EMPTY_FULL_TEXT, extractFullText } = await import("./text");
  try {
    const res = await fetchWithRetry(
      url,
      {
        cache: "no-store",
        headers: {
          "user-agent": "f1-bulletin-ingestor/1.0",
          accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        },
      },
      timeoutMs,
      1
    );
    if (!res.ok) return EMPTY_FULL_TEXT;
    return extractFullText(await res.text());
  } catch {
    return EMPTY_FULL_TEXT;
  }
}
