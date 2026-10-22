import { randomUUID } from 'node:crypto';
import { getNeonSql } from '@/lib/neon';
import { logEvent } from '@/lib/observability';

export class JobBusyError extends Error {}

export async function runJob<T>(job: string, work: () => Promise<T>): Promise<T> {
  const sql = getNeonSql('write');
  const owner = randomUUID();
  const started = Date.now();
  // Longer than Vercel's enforced handler deadline; owner-qualified release
  // prevents an old timed-out worker from releasing a replacement worker's lease.
  const leases = await sql`
    INSERT INTO app_ops.job_leases (job, owner, expires_at)
    VALUES (${job}, ${owner}::uuid, now() + interval '5 minutes')
    ON CONFLICT (job) DO UPDATE SET owner = EXCLUDED.owner, expires_at = EXCLUDED.expires_at
    WHERE app_ops.job_leases.expires_at < now()
    RETURNING owner`;
  const audit = (outcome: string, errorCode: string | null = null) => sql`
    INSERT INTO app_ops.audit_log (request_id, job, outcome, duration_ms, error_code)
    VALUES (${owner}::uuid, ${job}, ${outcome}, ${Date.now() - started}, ${errorCode})`;
  if (!leases.length) { await audit('busy'); throw new JobBusyError('Job already running'); }
  try {
    await audit('started');
    const result = await work();
    await audit('succeeded');
    logEvent('info', 'job_succeeded', { job, requestId: owner, durationMs: Date.now() - started });
    return result;
  } catch (error) {
    await audit('failed', 'JOB_FAILED').catch(() => logEvent('error', 'job_audit_failed', { job, requestId: owner }));
    logEvent('error', 'job_failed', { job, requestId: owner, durationMs: Date.now() - started });
    throw error;
  } finally {
    await sql`DELETE FROM app_ops.job_leases WHERE job = ${job} AND owner = ${owner}::uuid`
      .catch(() => logEvent('error', 'job_release_failed', { job, requestId: owner }));
  }
}
