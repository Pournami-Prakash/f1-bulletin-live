import { NextRequest, NextResponse } from 'next/server';
import { validateApiRequest } from '@/lib/request-policy';
import { consumeApiBudget } from '@/lib/rate-limit';
import { logEvent } from '@/lib/observability';

export async function proxy(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const headers = new Headers(request.headers);
  headers.set('x-request-id', requestId);
  const response = (message: string, status: number, extra: Record<string, string> = {}) => NextResponse.json(
    { ok: false, error: message }, { status, headers: { 'Cache-Control': 'no-store', 'X-Request-Id': requestId, ...extra } },
  );
  const validation = validateApiRequest(request.nextUrl);
  if (validation) return response(validation, 400);
  // Authentication stays in each write handler; unknown methods cannot reach DB reads.
  if (['GET', 'HEAD'].includes(request.method) && request.nextUrl.pathname !== '/api/health') {
    // Local browser tests can exercise rendering without production database access.
    // Production cannot disable the shared limiter through this switch.
    if (!(process.env.NODE_ENV === 'development' && process.env.E2E_TEST === '1')) {
      try {
        if (!await consumeApiBudget(request)) return response('Too many requests. Please try again shortly.', 429, { 'Retry-After': '60' });
      } catch {
        logEvent('error', 'rate_limiter_unavailable', { requestId });
        return response('Service temporarily unavailable. Please try again.', 503, { 'Retry-After': '30' });
      }
    }
  }
  const next = NextResponse.next({ request: { headers } });
  next.headers.set('X-Request-Id', requestId);
  return next;
}

export const config = { matcher: '/api/:path*' };
