import { createHmac } from 'node:crypto';
import { getNeonSql } from '@/lib/neon';

export async function consumeApiBudget(request: Request) {
  const url = new URL(request.url);
  // Trust this header only behind Vercel, which overwrites incoming values.
  // On other hosts, a single shared bucket is conservative and cannot be spoofed.
  const ip = process.env.VERCEL === '1' ? request.headers.get('x-vercel-forwarded-for') ?? 'unknown' : 'local';
  const salt = process.env.RATE_LIMIT_SALT || process.env.INGEST_KEY || process.env.NEON_DATABASE_URL;
  if (!salt) throw new Error('Rate limiter is not configured');
  const day = new Date().toISOString().slice(0, 10);
  const heavy = /\/racing\/(replay|driver)\/|\/intelligence\/newsletter/.test(url.pathname);
  const key = createHmac('sha256', salt).update(`${day}:${ip}:${heavy ? 'heavy' : 'read'}`).digest('hex');
  const sql = getNeonSql('operations');
  const [result] = await sql`SELECT app_ops.consume_budget(${key}, ${heavy ? 20 : 180}) AS allowed`;
  return result.allowed === true;
}
