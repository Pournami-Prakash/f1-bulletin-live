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

import crypto from "crypto";
import { createConnection, connectAsync, executeAsync, destroyAsync } from "@/lib/snowflake";
import { ok, err, unauthorized, methodNotAllowed, toErrorMessage, validateIngestAuth } from "@/lib/api";
import { parseRssFeed, extractFullText, EMPTY_FULL_TEXT, type FullTextResult } from "@/lib/text";
import { fetchWithRetry } from "@/lib/fetch";

// ---------------------------------------------------------------------------
// Feed registry
// ---------------------------------------------------------------------------

interface FeedDef {
  name: string;
  url: string;
  source_type: "news" | "reddit" | "official";
  tier: "official" | "media";
  timeoutMs?: number;
  headers?: Record<string, string>;
  enabled?: boolean;
}

const FEEDS: FeedDef[] = [
  {
    name: "fia-press-releases",
    url: "https://www.fia.com/rss/press-release",
    source_type: "official",
    tier: "official",
  },
  {
    name: "fia-news",
    url: "https://www.fia.com/rss/news",
    source_type: "official",
    tier: "official",
  },
  {
    name: "bbc-sport-f1",
    url: "https://feeds.bbci.co.uk/sport/formula1/rss.xml",
    source_type: "news",
    tier: "media",
  },
  {
    name: "motorsport-f1",
    url: "https://www.motorsport.com/rss/f1/news/",
    source_type: "news",
    tier: "media",
  },
  {
    name: "racefans",
    url: "https://www.racefans.net/feed/",
    source_type: "news",
    tier: "media",
  },
  {
    name: "reddit-f1-new",
    url: "https://www.reddit.com/r/formula1/new/.rss",
    source_type: "reddit",
    tier: "media",
    timeoutMs: 12_000,
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; f1-bulletin-ingestor/1.0)",
      accept: "application/rss+xml, application/atom+xml, text/xml, */*",
    },
  },
];

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

interface HashInput {
  link: string;
  title: string;
  summary: string;
  published_at: string;
  full_title: string;
  meta_description: string;
  content_text: string;
}

function computeContentHash(args: HashInput): string {
  const canonical = {
    ...args,
    content_text: args.content_text.slice(0, 20_000), // cap for cost
  };
  return crypto.createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

// ---------------------------------------------------------------------------
// Per-feed result
// ---------------------------------------------------------------------------

interface FeedResult {
  fetched: number;
  inserted: number;
  skipped: number;
  httpStatus?: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export async function GET() {
  const active = FEEDS.filter((f) => f.enabled !== false);
  return ok({ feeds: active.length, total: FEEDS.length, active: active.map((f) => f.name) });
}

export async function POST(req: Request) {
  if (!validateIngestAuth(req)) return unauthorized();

  const { searchParams } = new URL(req.url);
  const fetchHtml = searchParams.get("html") === "1";
  const tierFilter = (searchParams.get("tier") || "all").toLowerCase();

  const feeds = FEEDS.filter((f) => f.enabled !== false).filter(
    (f) => tierFilter === "all" || f.tier === tierFilter
  );

  const ingestId = `ing_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;

  const conn = createConnection({ schema: "RAW" });
  const perFeed: Record<string, FeedResult> = {};
  let totalAttempted = 0;
  let totalInserted = 0;
  let totalSkipped = 0;

  try {
    await connectAsync(conn);

    for (const feed of feeds) {
      const timeout = feed.timeoutMs ?? 15_000;
      const headers = {
        "user-agent": "f1-bulletin-ingestor/1.0",
        accept: "application/rss+xml, application/atom+xml, text/xml, */*",
        ...feed.headers,
      };

      // Fetch feed
      let feedRes: Response;
      try {
        feedRes = await fetchWithRetry(feed.url, { headers, cache: "no-store" }, timeout, 1);
      } catch (e) {
        perFeed[feed.name] = { fetched: 0, inserted: 0, skipped: 0, error: toErrorMessage(e) };
        continue;
      }

      if (!feedRes.ok) {
        perFeed[feed.name] = {
          fetched: 0, inserted: 0, skipped: 0,
          httpStatus: feedRes.status,
          error: `http_${feedRes.status}`,
        };
        continue;
      }

      const items = parseRssFeed(await feedRes.text());
      perFeed[feed.name] = { fetched: items.length, inserted: 0, skipped: 0, httpStatus: feedRes.status };

      for (const item of items) {
        totalAttempted++;
        const fetchedAt = new Date().toISOString();

        let full: FullTextResult = EMPTY_FULL_TEXT;
        if (fetchHtml) {
          const { fetchFullTextSafe } = await import("@/lib/fetch");
          full = await fetchFullTextSafe(item.link, timeout);
        }

        const contentHash = computeContentHash({
          link: item.link,
          title: item.title,
          summary: item.summary,
          published_at: item.published_at,
          full_title: full.full_title,
          meta_description: full.meta_description,
          content_text: full.content_text,
        });

        const payload = {
          source_type: feed.source_type,
          source_name: feed.name,
          title: item.title,
          link: item.link,
          summary: item.summary,
          published_at: item.published_at,
          full_title: full.full_title,
          meta_description: full.meta_description,
        };

        // Insert only if content hash differs from the latest stored row for this link.
        // This preserves history while deduplicating identical re-fetches.
        const sql = `
          INSERT INTO F1_BULLETIN.RAW.RSS_ITEMS
            (SOURCE, FEED_URL, PAYLOAD, INGEST_ID, CONTENT_HTML, CONTENT_TEXT, CONTENT_FETCHED_AT, CONTENT_HASH)
          SELECT ?, ?, PARSE_JSON(?), ?, ?, ?, ?, ?
          WHERE COALESCE(
            (
              SELECT CONTENT_HASH
              FROM F1_BULLETIN.RAW.RSS_ITEMS
              WHERE PAYLOAD:"link"::string = ?
              ORDER BY CONTENT_FETCHED_AT DESC
              LIMIT 1
            ),
            ''
          ) <> ?
        `;

        const [rows] = await executeAsync<{ "number of rows inserted": number }>(conn, sql, [
          feed.name,
          feed.url,
          JSON.stringify(payload),
          ingestId,
          full.content_html,
          full.content_text,
          fetchedAt,
          contentHash,
          item.link,    // subquery
          contentHash,  // compare
        ]);

        const inserted = (rows?.["number of rows inserted"] ?? 0) > 0;
        if (inserted) {
          totalInserted++;
          perFeed[feed.name].inserted++;
        } else {
          totalSkipped++;
          perFeed[feed.name].skipped++;
        }
      }
    }

    return ok({
      ingestId,
      attempted: totalAttempted,
      inserted: totalInserted,
      skipped: totalSkipped,
      fetchHtml,
      tier: tierFilter,
      feeds: feeds.map((f) => f.name),
      perFeed,
    });
  } catch (e) {
    return err(toErrorMessage(e));
  } finally {
    await destroyAsync(conn).catch(() => {});
  }
}

export function PUT() {
  return methodNotAllowed(["GET", "POST"]);
}
