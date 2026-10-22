import { neon } from '@neondatabase/serverless'

export const PRODUCTION_MODEL_PREFIX = 'prod_'

export function getNeonSql(access: 'read' | 'write' | 'operations' = 'read') {
  const url = (access === 'read' ? process.env.NEON_READ_DATABASE_URL
    : access === 'operations' ? process.env.NEON_OPERATIONS_DATABASE_URL : process.env.NEON_WRITE_DATABASE_URL)
    || process.env.NEON_DATABASE_URL
  if (!url) {
    throw new Error('NEON_DATABASE_URL not configured')
  }
  return neon(url, {
    // A fresh deadline per query, not one AbortSignal shared by a warm instance.
    fetchOptions: { get signal() { return AbortSignal.timeout(15_000) } },
  })
}

export type DbNumber = string | number | null | undefined

export function toNumber(value: DbNumber, fallback = 0) {
  if (value === null || value === undefined) return fallback
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : fallback
}
