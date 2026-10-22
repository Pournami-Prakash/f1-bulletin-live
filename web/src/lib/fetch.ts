/** Bounded outbound reads: the deadline includes consuming the response body. */
export const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

export async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 10_000): Promise<Response> {
  const signal = init.signal
    ? AbortSignal.any([init.signal, AbortSignal.timeout(timeoutMs)])
    : AbortSignal.timeout(timeoutMs);
  const response = await fetch(url, { ...init, signal });
  const declaredLength = Number(response.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new Error('Upstream response exceeds size limit');
  }
  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    if (reader) while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw new Error('Upstream response exceeds size limit');
      chunks.push(value);
    }
    signal.throwIfAborted();
  } catch (error) {
    await reader?.cancel().catch(() => {});
    throw error;
  } finally { reader?.releaseLock(); }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return new Response([204, 205, 304].includes(response.status) ? null : body, {
    status: response.status, statusText: response.statusText, headers: response.headers,
  });
}

export function retryDelay(attempt: number, retryAfter: string | null, now = Date.now(), random = Math.random()) {
  const serverDelay = retryAfter === null ? NaN
    : /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - now;
  return Math.min(2000, Math.max(0, Number.isFinite(serverDelay)
    ? serverDelay : 300 * 2 ** attempt * (0.5 + random)));
}

export async function fetchWithRetry(url: string, init: RequestInit = {}, timeoutMs = 10_000, retries = 1): Promise<Response> {
  const safeMethod = ['GET', 'HEAD'].includes((init.method ?? 'GET').toUpperCase());
  const attempts = safeMethod ? Math.min(3, Math.max(0, retries)) : 0;
  for (let attempt = 0; ; attempt++) {
    let retryAfter: string | null = null;
    try {
      const response = await fetchWithTimeout(url, init, timeoutMs);
      if (!RETRYABLE.has(response.status) || attempt >= attempts) return response;
      retryAfter = response.headers.get('retry-after');
    } catch (error) {
      if (attempt >= attempts || init.signal?.aborted || (error instanceof Error && error.message.includes('size limit'))) throw error;
    }
    await new Promise<void>((resolve, reject) => {
      const signal = init.signal;
      const onAbort = () => { clearTimeout(timer); reject(signal?.reason); };
      const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, retryDelay(attempt, retryAfter));
      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted) onAbort();
    });
  }
}

export async function fetchAllowedResponse(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const { assertArticleUrl } = await import('./outbound-url');
  const deadline = AbortSignal.timeout(timeoutMs);
  const signal = init.signal ? AbortSignal.any([init.signal, deadline]) : deadline;
  let target = new URL(url);
  for (let hop = 0; hop <= 3; hop++) {
    await assertArticleUrl(target);
    signal.throwIfAborted();
    const response = await fetchWithRetry(target.href, { ...init, signal, redirect: 'manual' }, timeoutMs, 1);
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get('location');
    if (!location) throw new Error('Upstream redirect has no destination');
    target = new URL(location, target);
  }
  throw new Error('Too many upstream redirects');
}

export async function fetchFullTextSafe(url: string, timeoutMs: number): Promise<import('./text').FullTextResult> {
  const { EMPTY_FULL_TEXT, extractFullText } = await import('./text');
  try {
    const response = await fetchAllowedResponse(url, {
      cache: 'no-store', headers: { 'user-agent': 'f1-bulletin-ingestor/1.0', accept: 'text/html,application/xhtml+xml' },
    }, timeoutMs);
    if (!response.ok || !/text\/html|application\/xhtml\+xml/i.test(response.headers.get('content-type') ?? '')) return EMPTY_FULL_TEXT;
    return extractFullText(await response.text());
  } catch { return EMPTY_FULL_TEXT; }
}
