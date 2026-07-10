import { neon } from '@neondatabase/serverless'

export const PRODUCTION_MODEL_PREFIX = 'prod_'

export function getNeonSql() {
  const url = process.env.NEON_DATABASE_URL
  if (!url) {
    throw new Error('NEON_DATABASE_URL not configured')
  }
  return neon(url)
}

export type DbNumber = string | number | null | undefined

export function toNumber(value: DbNumber, fallback = 0) {
  if (value === null || value === undefined) return fallback
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : fallback
}
