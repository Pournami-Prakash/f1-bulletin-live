#!/usr/bin/env node
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(new URL('../web/package.json', import.meta.url));
require('@next/env').loadEnvConfig(`${root}/web`);
const { Client, neonConfig } = require('@neondatabase/serverless');
neonConfig.webSocketConstructor = globalThis.WebSocket;
const plan = process.argv.includes('--plan');
const check = process.argv.includes('--check');
const client = new Client({ connectionString: process.env.NEON_MIGRATION_DATABASE_URL || process.env.NEON_DATABASE_URL, connectionTimeoutMillis: 10000, query_timeout: 30000 });
try {
  await client.connect();
  await client.query('BEGIN');
  await client.query("SET LOCAL lock_timeout = '2s'; SET LOCAL statement_timeout = '25s'");
  await client.query('SELECT pg_advisory_xact_lock(2026, 2318)');
  await client.query('CREATE SCHEMA IF NOT EXISTS app_ops; REVOKE ALL ON SCHEMA app_ops FROM PUBLIC');
  await client.query('CREATE TABLE IF NOT EXISTS app_ops.schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
  for (const name of readdirSync(`${root}/sql/migrations`).filter(n => n.endsWith('.sql')).sort()) {
    const source = readFileSync(`${root}/sql/migrations/${name}`, 'utf8');
    const checksum = createHash('sha256').update(source).digest('hex');
    const { rows } = await client.query('SELECT checksum FROM app_ops.schema_migrations WHERE name=$1', [name]);
    if (rows[0]) {
      if (rows[0].checksum !== checksum) throw new Error('Applied migration checksum changed');
      console.log(JSON.stringify({ migration: name, status: 'applied' }));
      continue;
    }
    if (check) throw new Error(`Pending migration: ${name}`);
    await client.query(source);
    await client.query('INSERT INTO app_ops.schema_migrations(name, checksum) VALUES ($1,$2)', [name, checksum]);
    console.log(JSON.stringify({ migration: name, status: plan ? 'validated_in_rollback' : 'ready' }));
  }
  await client.query(plan || check ? 'ROLLBACK' : 'COMMIT');
  console.log(JSON.stringify({ status: plan ? 'plan_passed_no_changes' : check ? 'up_to_date' : 'migrations_applied' }));
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error(JSON.stringify({ status: 'failed', code: error.code ?? 'MIGRATION_ERROR' }));
  process.exitCode = 1;
} finally { await client.end().catch(() => {}); }
