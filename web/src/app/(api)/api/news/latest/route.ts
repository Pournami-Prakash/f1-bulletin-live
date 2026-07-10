/**
 * GET /api/latest
 *
 * Query params:
 *   source_type  all | news | reddit | official   (default: all)
 *   source       string  e.g. "motorsport-f1"     (default: all)
 *   q            string  full-text search          (default: "")
 *   limit        1–300                             (default: 100)
 */

import { ok, err, methodNotAllowed, toErrorMessage, clamp, toInt, toString, toEnum } from "@/lib/api";
import { getNeonSql } from "@/lib/neon";
import { cleanSummary } from "@/lib/text";

const SOURCE_TYPES = ["all", "news", "reddit", "official"] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LatestRow {
  id: string;
  source: string;
  source_type: string;
  feed_url: string;
  url: string;
  title: string;
  summary: string;
  published_at_raw: string;
  event_ts: string;
  content_hash: string;
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const sourceType = toEnum(searchParams.get("source_type"), SOURCE_TYPES, "all");
  const source = toString(searchParams.get("source"));
  const q = toString(searchParams.get("q"));
  const limit = clamp(toInt(searchParams.get("limit"), 100), 1, 300);

  const where: string[] = [];
  const binds: unknown[] = [];

  if (source) {
    where.push(`source = $${binds.length + 1}`);
    binds.push(source);
  }

  if (sourceType !== "all") {
    where.push(`LOWER(source_type) = $${binds.length + 1}`);
    binds.push(sourceType);
  }

  // FIA news feeds contain non-F1 content — filter it out when requested
  if (sourceType === "official" || source.toLowerCase() === "fia-news") {
    where.push(`
      (
        LOWER(source) <> 'fia-news'
        OR LOWER(title) LIKE '%formula 1%'
        OR LOWER(title) LIKE '%f1%'
        OR LOWER(url)   LIKE '%formula-1%'
        OR LOWER(url)   LIKE '%/f1-%'
      )
    `);
  }

  if (q) {
    where.push(`(title ILIKE $${binds.length + 1} OR summary ILIKE $${binds.length + 2} OR url ILIKE $${binds.length + 3})`);
    const like = `%${q}%`;
    binds.push(like, like, like);
  }

  const whereSql = where.length ? `WHERE ${where.join("\n  AND ")}` : "";

  const sql = `
    SELECT
      COALESCE(content_hash, url) AS id,
      source,
      source_type,
      NULL::text AS feed_url,
      url,
      title,
      summary,
      published_at_ts::text AS published_at_raw,
      event_ts::text,
      content_hash
    FROM event_f1_only
    ${whereSql}
    ORDER BY event_ts DESC NULLS LAST, updated_at DESC NULLS LAST
    LIMIT $${binds.length + 1}
  `;

  try {
    const db = getNeonSql();
    const rows = await db.query(sql, [...binds, limit]) as unknown as LatestRow[];

    const items = rows.map((r) => ({
      ...r,
      summary: cleanSummary(r.summary ?? "", r.source_type ?? ""),
    }));

    return ok(items, { count: items.length });
  } catch (e) {
    return err(toErrorMessage(e));
  }
}

export function POST() {
  return methodNotAllowed(["GET"]);
}
