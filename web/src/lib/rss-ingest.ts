import crypto from "crypto";
import { getNeonSql } from "@/lib/neon";
import { fetchWithRetry } from "@/lib/fetch";
import {
  cleanSummary,
  EMPTY_FULL_TEXT,
  parseRssFeed,
  type FullTextResult,
} from "@/lib/text";

export interface FeedDef {
  name: string;
  url: string;
  source_type: "news" | "reddit" | "official";
  tier: "official" | "media";
  timeoutMs?: number;
  headers?: Record<string, string>;
  enabled?: boolean;
}

export const RSS_FEEDS: FeedDef[] = [
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

interface HashInput {
  link: string;
  title: string;
  summary: string;
  published_at: string;
  full_title: string;
  meta_description: string;
  content_text: string;
}

export interface FeedResult {
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
  httpStatus?: number;
  error?: string;
}

export interface NeonRssIngestResult {
  ingestId: string;
  attempted: number;
  inserted: number;
  updated: number;
  skipped: number;
  fetchHtml: boolean;
  tier: string;
  feeds: string[];
  perFeed: Record<string, FeedResult>;
  storage: "neon";
}

function computeContentHash(args: HashInput): string {
  const canonical = {
    ...args,
    content_text: args.content_text.slice(0, 20_000),
  };
  return crypto.createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function stableId(prefix: string, value: string): string {
  return `${prefix}_${crypto.createHash("sha1").update(value).digest("hex").slice(0, 24)}`;
}

function parsePublishedAt(raw: string): string | null {
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function textForRelevance(title: string, summary: string, full: FullTextResult) {
  return [
    title,
    summary,
    full.full_title,
    full.meta_description,
    full.content_text.slice(0, 3000),
  ].join(" ").toLowerCase();
}

function isF1Relevant(feed: FeedDef, title: string, summary: string, full: FullTextResult) {
  if (feed.source_type !== "official") return true;
  const text = textForRelevance(title, summary, full);
  return /\b(f1|formula 1|formula one|fia formula one|fia formula 1|formula-1|\/formula-1\/)\b/i.test(text);
}

function topicCluster(title: string, summary: string) {
  const text = `${title} ${summary}`.toLowerCase();
  if (/\b(fia|steward|penalty|appeal|regulation|technical directive|scrutineering)\b/.test(text)) return "REGULATORY";
  if (/\b(contract|seat|rookie|driver|verstappen|norris|piastri|hamilton|leclerc|russell|alonso|sainz)\b/.test(text)) return "DRIVER_NEWS";
  if (/\b(ferrari|mercedes|mclaren|red bull|williams|aston martin|alpine|haas|sauber|racing bulls|cadillac)\b/.test(text)) return "TEAM_NEWS";
  if (/\b(qualifying|sprint|race|practice|session|pole|podium|win)\b/.test(text)) return "RACE_WEEKEND";
  return "GENERAL_F1";
}

function priorityFor(feed: FeedDef, title: string, summary: string) {
  const text = `${title} ${summary}`.toLowerCase();
  let score = feed.source_type === "official" ? 74 : feed.source_type === "reddit" ? 42 : 58;
  if (/\b(breaking|penalty|disqualified|investigation|appeal|crash|fire|injury|cancelled|canceled)\b/.test(text)) score += 18;
  if (/\b(wins|pole|championship|stewards|fia|technical directive|regulation)\b/.test(text)) score += 10;
  score = Math.max(0, Math.min(100, score));
  const tier = score >= 85 ? "P0" : score >= 70 ? "P1" : score >= 50 ? "P2" : "P3";
  return { score, tier };
}

export async function ingestRssToNeon(options: {
  fetchHtml: boolean;
  tier: string;
}): Promise<NeonRssIngestResult> {
  const sql = getNeonSql();
  const tierFilter = options.tier.toLowerCase();
  const feeds = RSS_FEEDS
    .filter((f) => f.enabled !== false)
    .filter((f) => tierFilter === "all" || f.tier === tierFilter);

  const ingestId = `ing_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
  const perFeed: Record<string, FeedResult> = {};
  let totalAttempted = 0;
  let totalInserted = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;

  for (const feed of feeds) {
    const timeout = feed.timeoutMs ?? 15_000;
    const headers = {
      "user-agent": "f1-bulletin-ingestor/1.0",
      accept: "application/rss+xml, application/atom+xml, text/xml, */*",
      ...feed.headers,
    };

    let feedRes: Response;
    try {
      feedRes = await fetchWithRetry(feed.url, { headers, cache: "no-store" }, timeout, 1);
    } catch (e) {
      perFeed[feed.name] = { fetched: 0, inserted: 0, updated: 0, skipped: 0, error: (e as Error).message };
      continue;
    }

    if (!feedRes.ok) {
      perFeed[feed.name] = {
        fetched: 0,
        inserted: 0,
        updated: 0,
        skipped: 0,
        httpStatus: feedRes.status,
        error: `http_${feedRes.status}`,
      };
      continue;
    }

    const items = parseRssFeed(await feedRes.text());
    perFeed[feed.name] = { fetched: items.length, inserted: 0, updated: 0, skipped: 0, httpStatus: feedRes.status };

    for (const item of items) {
      totalAttempted++;
      let full: FullTextResult = EMPTY_FULL_TEXT;
      if (options.fetchHtml) {
        const { fetchFullTextSafe } = await import("@/lib/fetch");
        full = await fetchFullTextSafe(item.link, timeout);
      }

      if (!isF1Relevant(feed, item.title, item.summary, full)) {
        totalSkipped++;
        perFeed[feed.name].skipped++;
        continue;
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
      const publishedAt = parsePublishedAt(item.published_at);
      const eventTs = publishedAt ?? new Date().toISOString();
      const summary = cleanSummary(item.summary, feed.source_type);
      const cluster = topicCluster(item.title, summary);
      const priority = priorityFor(feed, item.title, summary);
      const textAll = [item.title, summary, full.full_title, full.meta_description, full.content_text].filter(Boolean).join("\n\n");
      const storyId = stableId("rss", `${cluster}:${item.title.toLowerCase().replace(/\s+/g, " ").trim()}`);

      const [eventRow] = await sql`
        INSERT INTO event_f1_only (
          url,
          source_type, source, title, summary,
          published_at_ts, event_ts, content_hash, rn, event_type,
          source_count, is_multi_source, n_10m, n_60m, is_spike,
          update_score, spike_score, credibility_score,
          freshness_minutes, priority_score, priority_tier,
          body_text, text_all, relevance_score, controversy_score,
          topic_cluster, topic_scope, is_f1_relevant
        )
        VALUES (
          ${item.link},
          ${feed.source_type}, ${feed.name}, ${item.title}, ${summary},
          ${publishedAt}, ${eventTs}, ${contentHash}, 1, 'NEW',
          1, FALSE, 0, 0, FALSE,
          0, 0, ${feed.source_type === "official" ? 0.95 : 0.75},
          GREATEST(0, EXTRACT(EPOCH FROM (NOW() - ${eventTs}::timestamptz)) / 60),
          ${priority.score}, ${priority.tier},
          ${full.content_text || null}, ${textAll || null}, 100, 0,
          ${cluster}, 'article', TRUE
        )
        ON CONFLICT (url) DO UPDATE SET
          source_type = EXCLUDED.source_type,
          source = EXCLUDED.source,
          title = EXCLUDED.title,
          summary = EXCLUDED.summary,
          published_at_ts = EXCLUDED.published_at_ts,
          event_ts = EXCLUDED.event_ts,
          content_hash = EXCLUDED.content_hash,
          priority_score = EXCLUDED.priority_score,
          priority_tier = EXCLUDED.priority_tier,
          body_text = EXCLUDED.body_text,
          text_all = EXCLUDED.text_all,
          topic_cluster = EXCLUDED.topic_cluster,
          updated_at = NOW()
        WHERE event_f1_only.content_hash IS DISTINCT FROM EXCLUDED.content_hash
        RETURNING (xmax = 0) AS inserted
      `;

      await sql`
        INSERT INTO story_timeline (
          story_id,
          topic_cluster,
          story_title,
          latest_url,
          latest_source,
          latest_event_ts,
          first_seen_at,
          last_seen_at,
          events_count,
          sources_count,
          updates_count,
          max_priority_score,
          best_priority_tier,
          driver,
          heat_index,
          momentum_score,
          is_breaking,
          breaking_tier,
          merge_key
        )
        VALUES (
          ${storyId},
          ${cluster},
          ${item.title},
          ${item.link},
          ${feed.name},
          ${eventTs},
          ${eventTs},
          ${eventTs},
          1,
          1,
          0,
          ${priority.score},
          ${priority.tier},
          NULL,
          ${priority.score},
          ${priority.score},
          ${priority.tier === "P0"},
          ${priority.tier === "P0" ? "BREAKING" : null},
          ${storyId}
        )
        ON CONFLICT (story_id) DO UPDATE SET
          story_title = EXCLUDED.story_title,
          latest_url = EXCLUDED.latest_url,
          latest_source = EXCLUDED.latest_source,
          latest_event_ts = GREATEST(story_timeline.latest_event_ts, EXCLUDED.latest_event_ts),
          last_seen_at = GREATEST(story_timeline.last_seen_at, EXCLUDED.last_seen_at),
          max_priority_score = GREATEST(story_timeline.max_priority_score, EXCLUDED.max_priority_score),
          best_priority_tier = EXCLUDED.best_priority_tier,
          heat_index = GREATEST(story_timeline.heat_index, EXCLUDED.heat_index),
          momentum_score = GREATEST(story_timeline.momentum_score, EXCLUDED.momentum_score),
          is_breaking = story_timeline.is_breaking OR EXCLUDED.is_breaking,
          breaking_tier = COALESCE(EXCLUDED.breaking_tier, story_timeline.breaking_tier),
          updated_at = NOW()
      `;

      if (!eventRow) {
        totalSkipped++;
        perFeed[feed.name].skipped++;
      } else if (eventRow.inserted) {
        totalInserted++;
        perFeed[feed.name].inserted++;
      } else {
        totalUpdated++;
        perFeed[feed.name].updated++;
      }
    }
  }

  return {
    ingestId,
    attempted: totalAttempted,
    inserted: totalInserted,
    updated: totalUpdated,
    skipped: totalSkipped,
    fetchHtml: options.fetchHtml,
    tier: tierFilter,
    feeds: feeds.map((f) => f.name),
    perFeed,
    storage: "neon",
  };
}
