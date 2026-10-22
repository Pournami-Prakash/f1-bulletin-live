#!/usr/bin/env node
import { createRequire } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const require = createRequire(new URL('../web/package.json', import.meta.url));
const web = fileURLToPath(new URL('../web/', import.meta.url));
require('@next/env').loadEnvConfig(web);
const needles = [];
for (const name of ['NEON_DATABASE_URL','NEON_WRITE_DATABASE_URL','NEON_READ_DATABASE_URL','NEON_OPERATIONS_DATABASE_URL','INGEST_KEY']) {
  const value = process.env[name];
  if (value?.length > 12) needles.push([name, value]);
  if (value?.startsWith('postgres')) { const password = decodeURIComponent(new URL(value).password); if (password.length > 12) needles.push([`${name}:password`, password]); }
}
let checked = 0;
let failed = false;
function walk(path) {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const name = `${path}/${entry.name}`;
    if (entry.isDirectory()) walk(name);
    else if (/\.(js|map|html)$/.test(entry.name)) {
      checked++;
      const source = readFileSync(name, 'utf8');
      for (const [key, secret] of needles) if (source.includes(secret)) { console.error(JSON.stringify({ status: 'secret_in_client_bundle', key })); failed = true; }
    }
  }
}
walk(`${web}/.next/static`);
console.log(JSON.stringify({ status: failed ? 'failed' : 'no_configured_secrets_in_client_bundles', filesChecked: checked }));
if (failed) process.exitCode = 1;
