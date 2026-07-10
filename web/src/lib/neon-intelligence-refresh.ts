import { getNeonSql } from "@/lib/neon";

type Sql = ReturnType<typeof getNeonSql>;

type ArticleRow = {
  url: string;
  title: string | null;
  summary: string | null;
  source_type: string | null;
  source: string | null;
  topic_cluster: string | null;
  priority_score: number | string | null;
  priority_tier: string | null;
  event_ts: string | Date | null;
  text_all: string | null;
  body_text: string | null;
  controversy_score: number | string | null;
};

type ArticleSignal = ArticleRow & {
  text: string;
  cluster: string;
  priorityScore: number;
  sentimentScore: number;
  sentimentLabel: "positive" | "negative" | "neutral";
};

type EntityDef = {
  name: string;
  type: "driver" | "team";
  patterns: RegExp[];
};

type RefreshStats = {
  articlesProcessed: number;
  clustersSummarized: number;
  driversUpdated: number;
  alertsCreated: number;
  briefingDate: string;
};

const LOOKBACK_HOURS = 72;
const RECENT_HOURS = 24;

const POSITIVE_TERMS = [
  "win",
  "wins",
  "won",
  "podium",
  "pole",
  "fastest",
  "upgrade",
  "improved",
  "extension",
  "praised",
  "confident",
  "boost",
  "breakthrough",
  "dominant",
];

const NEGATIVE_TERMS = [
  "penalty",
  "crash",
  "incident",
  "issue",
  "problem",
  "failure",
  "retire",
  "retired",
  "investigation",
  "appeal",
  "concern",
  "delay",
  "disqualified",
  "damage",
  "struggled",
  "controversy",
];

const ENTITIES: EntityDef[] = [
  { name: "Max Verstappen", type: "driver", patterns: [/\bverstappen\b/i] },
  { name: "Lando Norris", type: "driver", patterns: [/\bnorris\b/i] },
  { name: "Oscar Piastri", type: "driver", patterns: [/\bpiastri\b/i] },
  { name: "Charles Leclerc", type: "driver", patterns: [/\bleclerc\b/i] },
  { name: "Lewis Hamilton", type: "driver", patterns: [/\bhamilton\b/i] },
  { name: "George Russell", type: "driver", patterns: [/\brussell\b/i] },
  { name: "Fernando Alonso", type: "driver", patterns: [/\balonso\b/i] },
  { name: "Carlos Sainz", type: "driver", patterns: [/\bsainz\b/i] },
  { name: "Alex Albon", type: "driver", patterns: [/\balbon\b/i] },
  { name: "Yuki Tsunoda", type: "driver", patterns: [/\btsunoda\b/i] },
  { name: "Red Bull", type: "team", patterns: [/\bred bull\b/i] },
  { name: "McLaren", type: "team", patterns: [/\bmclaren\b/i] },
  { name: "Ferrari", type: "team", patterns: [/\bferrari\b/i] },
  { name: "Mercedes", type: "team", patterns: [/\bmercedes\b/i] },
  { name: "Aston Martin", type: "team", patterns: [/\baston martin\b/i] },
  { name: "Williams", type: "team", patterns: [/\bwilliams\b/i] },
  { name: "Alpine", type: "team", patterns: [/\balpine\b/i] },
  { name: "Haas", type: "team", patterns: [/\bhaas\b/i] },
  { name: "Sauber", type: "team", patterns: [/\bsauber\b/i, /\bstake\b/i] },
  { name: "Racing Bulls", type: "team", patterns: [/\bracing bulls\b/i, /\brb\b/i] },
];

function toNumber(value: number | string | null | undefined, fallback = 0) {
  if (value === null || value === undefined) return fallback;
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function countTerms(text: string, terms: string[]) {
  return terms.reduce((count, term) => {
    const matches = text.match(new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"));
    return count + (matches?.length ?? 0);
  }, 0);
}

function sentimentFor(text: string) {
  const positive = countTerms(text, POSITIVE_TERMS);
  const negative = countTerms(text, NEGATIVE_TERMS);
  const score = Math.max(-1, Math.min(1, (positive - negative) / Math.max(3, positive + negative)));
  const label = score > 0.15 ? "positive" : score < -0.15 ? "negative" : "neutral";
  return { score, label: label as "positive" | "negative" | "neutral", positive, negative };
}

function makeSignal(row: ArticleRow): ArticleSignal {
  const text = [row.title, row.summary, row.text_all, row.body_text].filter(Boolean).join(" ");
  const sentiment = sentimentFor(text.toLowerCase());
  return {
    ...row,
    text,
    cluster: row.topic_cluster || "GENERAL_F1",
    priorityScore: toNumber(row.priority_score, 0),
    sentimentScore: sentiment.score,
    sentimentLabel: sentiment.label,
  };
}

function headlineList(items: ArticleSignal[], count = 3) {
  return items
    .slice(0, count)
    .map((item) => item.title?.trim())
    .filter(Boolean) as string[];
}

function clusterSummary(cluster: string, items: ArticleSignal[]) {
  const headlines = headlineList(items, 3);
  if (headlines.length === 0) return `${cluster.replaceAll("_", " ")} is active in the current F1 feed.`;
  if (headlines.length === 1) return headlines[0];
  return `${cluster.replaceAll("_", " ")} is leading with ${headlines[0]}. Other live signals include ${headlines
    .slice(1)
    .join("; ")}.`;
}

function sourceBreakdown(items: ArticleSignal[]) {
  return items.reduce<Record<string, number>>((acc, item) => {
    const key = item.source_type || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function detectEntityMentions(article: ArticleSignal) {
  return ENTITIES.filter((entity) => entity.patterns.some((pattern) => pattern.test(article.text)));
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function eventDate(row: ArticleSignal) {
  const date = row.event_ts ? new Date(row.event_ts) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function isRecent(row: ArticleSignal, hours: number) {
  return Date.now() - eventDate(row).getTime() <= hours * 60 * 60 * 1000;
}

async function loadArticles(sql: Sql) {
  const rows = await sql`
    SELECT url, title, summary, source_type, source, topic_cluster,
      priority_score, priority_tier, event_ts, text_all, body_text, controversy_score
    FROM event_f1_only
    WHERE is_f1_relevant = TRUE
      AND event_ts >= NOW() - (${LOOKBACK_HOURS} || ' hours')::interval
    ORDER BY event_ts DESC
    LIMIT 300
  `;
  return (rows as ArticleRow[]).map(makeSignal);
}

async function refreshArticleIntelligence(sql: Sql, articles: ArticleSignal[]) {
  for (const article of articles) {
    await sql`
      INSERT INTO article_intelligence (
        guid, title, source_type, cluster_name, semantic_cluster,
        sentiment_score, sentiment_label, priority_score, published_at, processed_at
      )
      VALUES (
        ${article.url}, ${article.title}, ${article.source_type}, ${article.cluster}, ${article.cluster},
        ${article.sentimentScore}, ${article.sentimentLabel}, ${Math.round(article.priorityScore)},
        ${article.event_ts}, NOW()
      )
      ON CONFLICT (guid) DO UPDATE SET
        title = EXCLUDED.title,
        source_type = EXCLUDED.source_type,
        cluster_name = EXCLUDED.cluster_name,
        semantic_cluster = EXCLUDED.semantic_cluster,
        sentiment_score = EXCLUDED.sentiment_score,
        sentiment_label = EXCLUDED.sentiment_label,
        priority_score = EXCLUDED.priority_score,
        published_at = EXCLUDED.published_at,
        processed_at = NOW()
    `;
  }
}

async function refreshClusters(sql: Sql, articles: ArticleSignal[]) {
  const byCluster = new Map<string, ArticleSignal[]>();
  for (const article of articles) {
    const items = byCluster.get(article.cluster) || [];
    items.push(article);
    byCluster.set(article.cluster, items);
  }

  const activeClusterIds = [...byCluster.keys()];
  for (const [cluster, items] of byCluster.entries()) {
    const sorted = [...items].sort((a, b) => b.priorityScore - a.priorityScore);
    const maxPriority = Math.max(...items.map((item) => item.priorityScore));
    const recentCount = items.filter((item) => isRecent(item, RECENT_HOURS)).length;
    const momentum = Math.min(100, recentCount * 14 + maxPriority * 0.45);
    const sentimentAvg = average(items.map((item) => item.sentimentScore));
    const sentimentLabel = sentimentAvg > 0.15 ? "positive" : sentimentAvg < -0.15 ? "negative" : "neutral";
    const isSpike = recentCount >= 5 || maxPriority >= 85;
    const zScore = Number((recentCount / Math.max(1, items.length / 3)).toFixed(2));
    const priority = maxPriority >= 85 ? "P0" : maxPriority >= 70 ? "P1" : maxPriority >= 50 ? "P2" : "P3";
    const themes = headlineList(sorted, 4);

    await sql`
      INSERT INTO cluster_summaries (
        cluster_id, cluster_name, summary, key_themes, article_count,
        source_breakdown, momentum_score, sentiment_avg, sentiment_label,
        is_spike, z_score, priority, last_updated, summary_generated_at
      )
      VALUES (
        ${cluster}, ${cluster}, ${clusterSummary(cluster, sorted)}, ${themes},
        ${items.length}, ${JSON.stringify(sourceBreakdown(items))}::jsonb,
        ${momentum}, ${sentimentAvg}, ${sentimentLabel},
        ${isSpike}, ${zScore}, ${priority}, NOW(), NOW()
      )
      ON CONFLICT (cluster_id) DO UPDATE SET
        cluster_name = EXCLUDED.cluster_name,
        summary = EXCLUDED.summary,
        key_themes = EXCLUDED.key_themes,
        article_count = EXCLUDED.article_count,
        source_breakdown = EXCLUDED.source_breakdown,
        momentum_score = EXCLUDED.momentum_score,
        sentiment_avg = EXCLUDED.sentiment_avg,
        sentiment_label = EXCLUDED.sentiment_label,
        is_spike = EXCLUDED.is_spike,
        z_score = EXCLUDED.z_score,
        priority = EXCLUDED.priority,
        last_updated = NOW(),
        summary_generated_at = NOW()
    `;

    if (isSpike) {
      await sql`
        INSERT INTO spike_alerts (
          cluster_name, cluster_id, z_score, article_count,
          baseline_avg, severity, triggered_at, resolved
        )
        VALUES (
          ${cluster}, ${cluster}, ${zScore}, ${recentCount},
          ${Math.max(1, items.length / 3)}, ${maxPriority >= 85 ? "HIGH" : "MEDIUM"}, NOW(), FALSE
        )
      `;
    }
  }

  if (activeClusterIds.length > 0) {
    await sql`
      UPDATE cluster_summaries
      SET article_count = 0, momentum_score = 0, is_spike = FALSE
      WHERE last_updated < NOW() - INTERVAL '7 days'
        AND cluster_id <> ALL(${activeClusterIds})
    `;
  }

  return byCluster;
}

async function refreshEntities(sql: Sql, articles: ArticleSignal[]) {
  const today = todayIsoDate();
  const grouped = new Map<string, { entity: EntityDef; articles: ArticleSignal[] }>();

  for (const article of articles) {
    for (const entity of detectEntityMentions(article)) {
      const key = `${entity.type}:${entity.name}`;
      const current = grouped.get(key) || { entity, articles: [] };
      current.articles.push(article);
      grouped.set(key, current);
    }
  }

  for (const { entity, articles: entityArticles } of grouped.values()) {
    const scores = entityArticles.map((article) => article.sentimentScore);
    const sentimentAvg = average(scores);
    const sentimentLabel = sentimentAvg > 0.15 ? "positive" : sentimentAvg < -0.15 ? "negative" : "neutral";
    const positive = entityArticles.filter((article) => article.sentimentLabel === "positive").length;
    const negative = entityArticles.filter((article) => article.sentimentLabel === "negative").length;
    const neutral = entityArticles.length - positive - negative;
    const topCluster = entityArticles.sort((a, b) => b.priorityScore - a.priorityScore)[0]?.cluster || "GENERAL_F1";

    await sql`
      INSERT INTO driver_sentiment_daily (
        driver_name, entity_type, date, sentiment_avg, sentiment_delta,
        sentiment_label, mention_count, positive_count, negative_count,
        neutral_count, top_cluster
      )
      VALUES (
        ${entity.name}, ${entity.type}, ${today}::date, ${sentimentAvg}, 0,
        ${sentimentLabel}, ${entityArticles.length}, ${positive}, ${negative}, ${neutral}, ${topCluster}
      )
      ON CONFLICT (driver_name, entity_type, date) DO UPDATE SET
        sentiment_avg = EXCLUDED.sentiment_avg,
        sentiment_delta = EXCLUDED.sentiment_delta,
        sentiment_label = EXCLUDED.sentiment_label,
        mention_count = EXCLUDED.mention_count,
        positive_count = EXCLUDED.positive_count,
        negative_count = EXCLUDED.negative_count,
        neutral_count = EXCLUDED.neutral_count,
        top_cluster = EXCLUDED.top_cluster
    `;

    const fiaTerms = entityArticles.filter((article) => /\b(fia|steward|penalty|appeal|regulation|investigation)\b/i.test(article.text)).length;
    const negativeCount = negative + fiaTerms;
    const controversyScore = Math.min(100, negativeCount * 18 + entityArticles.length * 5);
    if (controversyScore > 0) {
      await sql`
        INSERT INTO controversy_index (
          entity_name, entity_type, index_date, sentiment_score, fia_score,
          spike_score, media_score, controversy_score, controversy_label,
          score_delta, trending_direction, mention_count, negative_count,
          fia_mentions, spike_count, top_cluster, updated_at
        )
        VALUES (
          ${entity.name}, ${entity.type}, ${today}::date, ${sentimentAvg}, ${fiaTerms * 15},
          ${negativeCount * 10}, ${entityArticles.length * 5}, ${controversyScore},
          ${controversyScore >= 70 ? "high" : controversyScore >= 35 ? "medium" : "low"},
          0, ${controversyScore >= 35 ? "up" : "stable"}, ${entityArticles.length}, ${negativeCount},
          ${fiaTerms}, ${negativeCount}, ${topCluster}, NOW()
        )
        ON CONFLICT (entity_name, entity_type, index_date) DO UPDATE SET
          sentiment_score = EXCLUDED.sentiment_score,
          fia_score = EXCLUDED.fia_score,
          spike_score = EXCLUDED.spike_score,
          media_score = EXCLUDED.media_score,
          controversy_score = EXCLUDED.controversy_score,
          controversy_label = EXCLUDED.controversy_label,
          score_delta = EXCLUDED.score_delta,
          trending_direction = EXCLUDED.trending_direction,
          mention_count = EXCLUDED.mention_count,
          negative_count = EXCLUDED.negative_count,
          fia_mentions = EXCLUDED.fia_mentions,
          spike_count = EXCLUDED.spike_count,
          top_cluster = EXCLUDED.top_cluster,
          updated_at = NOW()
      `;
    }
  }

  return grouped.size;
}

async function refreshBriefing(sql: Sql, articles: ArticleSignal[], clusters: Map<string, ArticleSignal[]>) {
  const today = todayIsoDate();
  const sorted = [...articles].sort((a, b) => b.priorityScore - a.priorityScore || eventDate(b).getTime() - eventDate(a).getTime());
  const top = sorted[0];
  const topCluster = [...clusters.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  const clusterName = topCluster?.[0] || top?.cluster || "GENERAL_F1";
  const clusterItems = topCluster?.[1] || sorted.slice(0, 3);
  const mentionedDrivers = ENTITIES.filter((entity) => entity.type === "driver").map((entity) => ({
    entity,
    count: articles.filter((article) => entity.patterns.some((pattern) => pattern.test(article.text))).length,
  })).sort((a, b) => b.count - a.count);
  const topDriver = mentionedDrivers.find((item) => item.count > 0)?.entity.name || null;
  const negativeArticles = sorted.filter((article) => article.sentimentLabel === "negative");
  const avgSentiment = average(articles.map((article) => article.sentimentScore));
  const sentimentLabel = avgSentiment > 0.15 ? "positive" : avgSentiment < -0.15 ? "negative" : "neutral";

  await sql`
    INSERT INTO daily_briefings (
      briefing_date, headline, lead_paragraph, top_story_summary,
      driver_spotlight, controversy_note, what_to_watch, top_cluster,
      top_driver, total_signals, breaking_count, avg_sentiment,
      sentiment_label, active_spike_count, top_controversy_entity,
      top_controversy_score, generated_at, model_used,
      generation_skipped, skip_reason
    )
    VALUES (
      ${today}::date,
      ${top?.title || "F1 feed is updating"},
      ${clusterSummary(clusterName, clusterItems)},
      ${headlineList(sorted, 3).join(" | ") || "No current F1 stories found in the public feed."},
      ${topDriver ? `${topDriver} is the most-mentioned driver in the current feed.` : "No single driver is dominating the current feed."},
      ${negativeArticles[0]?.title || "No major controversy signal is leading the current feed."},
      ${headlineList(sorted.slice(1), 3).join(" | ") || "Watch for official updates and session-weekend news."},
      ${clusterName},
      ${topDriver},
      ${articles.length},
      ${articles.filter((article) => article.priorityScore >= 85 || isRecent(article, 6)).length},
      ${avgSentiment},
      ${sentimentLabel},
      ${[...clusters.values()].filter((items) => items.filter((item) => isRecent(item, RECENT_HOURS)).length >= 5).length},
      ${negativeArticles[0] ? detectEntityMentions(negativeArticles[0])[0]?.name || null : null},
      ${negativeArticles[0] ? Math.round(Math.abs(negativeArticles[0].sentimentScore) * 100) : 0},
      NOW(),
      'neon-heuristic-v1',
      FALSE,
      NULL
    )
    ON CONFLICT (briefing_date) DO UPDATE SET
      headline = EXCLUDED.headline,
      lead_paragraph = EXCLUDED.lead_paragraph,
      top_story_summary = EXCLUDED.top_story_summary,
      driver_spotlight = EXCLUDED.driver_spotlight,
      controversy_note = EXCLUDED.controversy_note,
      what_to_watch = EXCLUDED.what_to_watch,
      top_cluster = EXCLUDED.top_cluster,
      top_driver = EXCLUDED.top_driver,
      total_signals = EXCLUDED.total_signals,
      breaking_count = EXCLUDED.breaking_count,
      avg_sentiment = EXCLUDED.avg_sentiment,
      sentiment_label = EXCLUDED.sentiment_label,
      active_spike_count = EXCLUDED.active_spike_count,
      top_controversy_entity = EXCLUDED.top_controversy_entity,
      top_controversy_score = EXCLUDED.top_controversy_score,
      generated_at = NOW(),
      model_used = EXCLUDED.model_used,
      generation_skipped = FALSE,
      skip_reason = NULL
  `;

  return today;
}

export async function refreshNeonIntelligence(): Promise<RefreshStats> {
  const sql = getNeonSql();
  const start = Date.now();
  const articles = await loadArticles(sql);

  if (articles.length === 0) {
    await sql`
      INSERT INTO pipeline_run_log (
        run_at, articles_processed, clusters_summarized, spikes_detected,
        drivers_updated, duration_seconds, status, error_message, snowflake_credits_used
      )
      VALUES (NOW(), 0, 0, 0, 0, 0, 'neon_refresh:empty', NULL, 0)
    `;
    return {
      articlesProcessed: 0,
      clustersSummarized: 0,
      driversUpdated: 0,
      alertsCreated: 0,
      briefingDate: todayIsoDate(),
    };
  }

  await refreshArticleIntelligence(sql, articles);
  const clusters = await refreshClusters(sql, articles);
  const driversUpdated = await refreshEntities(sql, articles);
  const briefingDate = await refreshBriefing(sql, articles, clusters);
  const alertsCreated = [...clusters.values()].filter((items) => items.filter((item) => isRecent(item, RECENT_HOURS)).length >= 5).length;
  const duration = (Date.now() - start) / 1000;

  await sql`
    INSERT INTO pipeline_run_log (
      run_at, articles_processed, clusters_summarized, spikes_detected,
      drivers_updated, duration_seconds, status, error_message, snowflake_credits_used
    )
    VALUES (
      NOW(), ${articles.length}, ${clusters.size}, ${alertsCreated},
      ${driversUpdated}, ${duration}, 'neon_refresh:success', NULL, 0
    )
  `;

  return {
    articlesProcessed: articles.length,
    clustersSummarized: clusters.size,
    driversUpdated,
    alertsCreated,
    briefingDate,
  };
}
