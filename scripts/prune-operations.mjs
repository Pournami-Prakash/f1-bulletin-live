import { createRequire } from 'node:module';
const require = createRequire(new URL('../web/package.json', import.meta.url));
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.NEON_DATABASE_URL, { fetchOptions: { signal: AbortSignal.timeout(15000) } });
try {
  await sql.transaction([
    sql`DELETE FROM app_ops.rate_budgets WHERE expires_at < now()`,
    sql`DELETE FROM app_ops.job_leases WHERE expires_at < now() - interval '1 day'`,
    sql`DELETE FROM app_ops.audit_log WHERE occurred_at < now() - interval '90 days'`,
  ]);
  console.log(JSON.stringify({ status: 'operational_retention_applied' }));
} catch { console.error(JSON.stringify({ status: 'operational_retention_failed' })); process.exitCode = 1; }
