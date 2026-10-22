import { NextResponse } from 'next/server';
import { getNeonSql } from '@/lib/neon';
import { validateIngestAuth } from '@/lib/api';
import { logEvent } from '@/lib/observability';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'no-store' };
  if (new URL(request.url).searchParams.get('ready') !== '1') {
    return NextResponse.json({ ok: true, status: 'alive' }, { headers });
  }
  if (!validateIngestAuth(request)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401, headers });
  try {
    const sql = getNeonSql("write");
    const [row] = await sql`
      SELECT
        (SELECT MAX(run_at) FROM pipeline_run_log WHERE status LIKE '%success%') AS last_success,
        (SELECT MAX(occurred_at) FROM app_ops.audit_log WHERE job = 'rss-ingest' AND outcome = 'succeeded') AS last_ingest,
        (SELECT COUNT(*)::int FROM app_ops.audit_log WHERE outcome = 'failed' AND occurred_at > now() - interval '3 hours') AS recent_failures,
        pg_database_size(current_database()) AS database_bytes`;
    const fresh = (value: unknown) => value !== null && Date.now() - new Date(String(value)).getTime() < 3 * 60 * 60 * 1000;
    const ready = fresh(row.last_success) && fresh(row.last_ingest) && row.recent_failures === 0;
    return NextResponse.json({ ok: ready, status: ready ? 'ready' : 'degraded', ...row }, { status: ready ? 200 : 503, headers });
  } catch {
    logEvent('error', 'readiness_failed', { requestId: request.headers.get('x-request-id') });
    return NextResponse.json({ ok: false, status: 'unavailable' }, { status: 503, headers });
  }
}
