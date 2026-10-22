#!/usr/bin/env node
// Creates a distinct login and stores its credential only in ignored local env.
// Never prints passwords or URLs. Production cutover is an explicit env update.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const require = createRequire(new URL('../web/package.json', import.meta.url));
const web = fileURLToPath(new URL('../web/', import.meta.url));
require('@next/env').loadEnvConfig(web);
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.NEON_DATABASE_URL, { fetchOptions: { signal: AbortSignal.timeout(15000) } });
try {
  for (const [role, group, envName, timeout] of [
    ['f1_web_read_login', 'f1_web_reader', 'NEON_READ_DATABASE_URL', '10s'],
    ['f1_web_rate_login', 'f1_rate_limiter', 'NEON_OPERATIONS_DATABASE_URL', '3s'],
    ['f1_app_write_login', 'f1_app_writer', 'NEON_WRITE_DATABASE_URL', '15s'],
  ]) {
    const existing = await sql`SELECT 1 FROM pg_roles WHERE rolname=${role}`;
    if (existing.length) {
      if (!process.env[envName]) throw new Error('Existing login needs manual credential recovery');
      console.log(JSON.stringify({ role, status: 'already_configured' }));
      continue;
    }
    const password = randomBytes(32).toString('hex');
    // Role/group names come only from this fixed array, password is hex.
    await sql.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS IN ROLE ${group}`);
    await sql.query(`ALTER ROLE ${role} SET statement_timeout = '${timeout}'`);
    const url = new URL(process.env.NEON_DATABASE_URL);
    url.username = role; url.password = password;
    const path = `${web}/.env.local`;
    const source = readFileSync(path, 'utf8');
    writeFileSync(path, `${source.replace(new RegExp('^' + envName + '=.*\\n?', 'gm'), '').trimEnd()}\n${envName}=${url.href}\n`, { mode: 0o600 });
    chmodSync(path, 0o600);
    console.log(JSON.stringify({ role, status: 'provisioned_local_env_only' }));
  }
} catch (error) { console.error(JSON.stringify({ status: 'access_provisioning_failed', code: error.code ?? 'CONFIGURATION_ERROR' })); process.exitCode = 1; }
