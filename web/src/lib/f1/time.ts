/**
 * lib/f1/time.ts
 * Timestamp parsing and formatting helpers.
 * All functions are SSR + CSR safe (no window/document).
 */

/**
 * Parse a timestamp string that may be:
 *  - ISO 8601 with Z or offset  →  parse directly
 *  - Snowflake NTZ "YYYY-MM-DD HH:MM:SS[.fff]"  →  treat as UTC
 */
export function parseTs(ts?: string | null): Date | null {
  if (!ts) return null;

  // Already has explicit timezone
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(ts)) {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  }

  // Snowflake NTZ: normalize space → T and append Z (treat as UTC)
  const normalized = ts.includes("T") ? ts : ts.replace(" ", "T");
  const d = new Date(normalized + "Z");
  return isNaN(d.getTime()) ? null : d;
}

/** Minutes elapsed since the given timestamp. Returns null if unparseable. */
export function minutesAgo(ts?: string | null): number | null {
  const d = parseTs(ts);
  return d ? Math.round((Date.now() - d.getTime()) / 60_000) : null;
}

/** "2026-02-19" — used as the grouping key for day buckets. */
export function dayKey(ts?: string | null): string {
  const d = parseTs(ts);
  return d ? d.toISOString().slice(0, 10) : "Unknown day";
}

/** "2026-02-19T14" — used as the grouping key for hour buckets. */
export function hourKey(ts?: string | null): string {
  const d = parseTs(ts);
  return d ? d.toISOString().slice(0, 13) : "Unknown hour";
}

/** "2026-02-19 14:35" — human-readable display string. */
export function formatTs(ts?: string | null): string {
  if (!ts) return "";
  return ts.toString().replace("T", " ").slice(0, 16);
}

/** Best available timestamp from a FeedItem — prefers event_ts, falls back gracefully. */
export function getItemTs(item: {
  event_ts?: string | null;
  published_at_raw?: string | null;
  last_seen_at?: string | null;
  first_seen_at?: string | null;
}): string | null {
  return item.event_ts ?? item.published_at_raw ?? item.last_seen_at ?? item.first_seen_at ?? null;
}
