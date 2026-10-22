#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const require = createRequire(new URL('../web/package.json', import.meta.url));
require('@next/env').loadEnvConfig(fileURLToPath(new URL('../web/', import.meta.url)));
const { neon } = require('@neondatabase/serverless');
const options = { fetchOptions: { get signal() { return AbortSignal.timeout(15000); } } };
const writer = neon(process.env.NEON_DATABASE_URL, options);
const reader = neon(process.env.NEON_READ_DATABASE_URL, options);
const operations = neon(process.env.NEON_OPERATIONS_DATABASE_URL, options);
const appWriter = neon(process.env.NEON_WRITE_DATABASE_URL, options);
const key = createHash('sha256').update(`verification:${randomUUID()}`).digest('hex');
try {
  const [role] = await reader`SELECT rolcreatedb,rolcreaterole,rolbypassrls,rolsuper FROM pg_roles WHERE rolname=current_user`;
  assert.ok(Object.values(role).every(value => value === false));
  const [grants] = await reader`SELECT has_table_privilege('public.story_timeline', 'SELECT') AS can_read, has_table_privilege('public.story_timeline', 'INSERT') AS can_write, has_schema_privilege('app_ops', 'USAGE') AS can_access_operations`;
  assert.equal(grants.can_read, true); assert.equal(grants.can_write, false); assert.equal(grants.can_access_operations, false);
  await reader`SELECT story_id FROM story_timeline LIMIT 1`;
  console.log(JSON.stringify({ reader: 'read_allowed_write_denied_no_admin_privileges' }));
  const results = await Promise.all(Array.from({ length: 40 }, () => operations`SELECT app_ops.consume_budget(${key}, 10) AS allowed`));
  assert.equal(results.filter(rows => rows[0].allowed).length, 10);
  const [writeGrants] = await appWriter`SELECT has_table_privilege('public.event_f1_only', 'INSERT') AS can_ingest, has_table_privilege('public.predictions', 'INSERT') AS can_change_predictions, has_table_privilege('public.event_f1_only', 'DELETE') AS can_delete_content`;
  assert.equal(writeGrants.can_ingest, true); assert.equal(writeGrants.can_change_predictions, false); assert.equal(writeGrants.can_delete_content, false);
  const owner = randomUUID();
  const job = `verification-${owner}`;
  await appWriter.transaction([
    appWriter`INSERT INTO app_ops.job_leases(job, owner, expires_at) VALUES (${job}, ${owner}::uuid, now() + interval '1 minute')`,
    appWriter`DELETE FROM app_ops.job_leases WHERE job=${job} AND owner=${owner}::uuid`,
  ]);
  console.log(JSON.stringify({ appWriter: 'ingest_allowed_predictions_and_content_deletion_denied', leaseRls: 'verified' }));
  console.log(JSON.stringify({ distributedRateLimit: '40_concurrent_requests_exactly_10_allowed' }));
  const indexes = await reader`SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname IN ('idx_replay_session_lap_frame_driver','idx_sentiment_lower_name_type_date')`;
  assert.equal(indexes.length, 2);
  const [size] = await reader`SELECT round(pg_database_size(current_database()) / 1024.0 / 1024.0, 1) AS mb`;
  console.log(JSON.stringify({ indexes: 'verified', databaseMiB: Number(size.mb) }));
} catch (error) {
  console.error(JSON.stringify({ status: 'verification_failed', code: error.code ?? error.name })); process.exitCode = 1;
} finally {
  await writer`DELETE FROM app_ops.rate_budgets WHERE key_hash=${key}`.catch(() => {});
}
