/**
 * POST /api/ingest/rss
 *
 * Triggered by GitHub Actions or a cron job.
 * Auth: Authorization: Bearer <INGEST_KEY>
 *
 * Query params:
 *   html   "1" to fetch full HTML for each item  (default: false)
 *   tier   "all" | "official" | "media"          (default: all)
 *
 * GET /api/ingest/rss → health check (returns feed list)
 */

import { ok, err, unauthorized, methodNotAllowed, toErrorMessage, validateIngestAuth } from "@/lib/api";
import { ingestRssToNeon, RSS_FEEDS } from "@/lib/rss-ingest";

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export async function GET() {
  const active = RSS_FEEDS.filter((f) => f.enabled !== false);
  return ok({
    storage: "neon",
    feeds: active.length,
    total: RSS_FEEDS.length,
    active: active.map((f) => f.name),
  });
}

export async function POST(req: Request) {
  if (!validateIngestAuth(req)) return unauthorized();

  const { searchParams } = new URL(req.url);
  const fetchHtml = searchParams.get("html") === "1";
  const tierFilter = (searchParams.get("tier") || "all").toLowerCase();

  try {
    const result = await ingestRssToNeon({ fetchHtml, tier: tierFilter });
    return ok(result);
  } catch (e) {
    return err(toErrorMessage(e));
  }
}

export function PUT() {
  return methodNotAllowed(["GET", "POST"]);
}
