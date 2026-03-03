/**
 * types/f1.ts
 * All domain types for the F1 Bulletin app.
 * Keep types here; avoid re-defining them in components.
 */

// ---------------------------------------------------------------------------
// Shared API envelope  (matches lib/api.ts ok()/err())
// ---------------------------------------------------------------------------

export type ApiOk<T> = { ok: true; count?: number; nextCursor?: string | null; data: T };
export type ApiError = { ok: false; error: string; code?: string };
export type ApiResponse<T> = ApiOk<T> | ApiError;

// ---------------------------------------------------------------------------
// Source types
// ---------------------------------------------------------------------------

export type SourceType = "news" | "reddit" | "official";
export type SourceFilter = "all" | SourceType;
export type PriorityTier = "P0" | "P1" | "P2" | "P3";

// ---------------------------------------------------------------------------
// Feed / event stream items
// ---------------------------------------------------------------------------

export type EventType = "NEW" | "UPDATED" | "REFRESH";

export interface FeedItem {
  id:          string;
  source:      string;
  source_type: SourceType;
  feed_url:    string | null;
  title:       string;
  url:         string;
  summary:     string;

  published_at_ts:  string | null;
  published_at_raw: string | null;
  event_ts:         string | null;
  content_hash:     string | null;

  // Event stream fields — present from /api/events
  event_type?: EventType;
  rn?:         number | null;

  // MART pipeline fields — present from V_EVENT_F1_ONLY via /api/events
  priority_score?:    number | null;
  priority_tier?:     PriorityTier | null;
  topic_cluster?:     string | null;
  freshness_score?:   number | null;
  is_multi_source?:   boolean | null;
  source_count?:      number | null;
  n_10m?:             number | null;
  n_60m?:             number | null;
  is_spike?:          boolean | null;
  is_f1_relevant?:    boolean | null;
  relevance_score?:   number | null;
  controversy_score?: number | null;

  // Legacy enriched view fields
  is_updated?:    boolean;
  versions?:      number | null;
  snapshots?:     number | null;
  first_seen_at?: string | null;
  last_seen_at?:  string | null;
}

// ---------------------------------------------------------------------------
// Stories  (/api/stories)
// ---------------------------------------------------------------------------

export interface StoryItem {
  story_id:           string;
  topic_cluster:      string;
  story_title:        string;
  latest_url:         string;
  latest_source:      string;
  latest_event_ts:    string;
  first_seen_at:      string;
  last_seen_at:       string;
  events_count:       number;
  sources_count:      number;
  updates_count:      number;
  max_priority_score: number;
  best_priority_tier: string;
  driver:             string | null;
  heat_index:         number;
  momentum_score:     number;
  is_breaking:        boolean;
  breaking_tier:      string | null;
  merge_key:          string;
}

// ---------------------------------------------------------------------------
// Driver timeline  (/api/drivers)
// ---------------------------------------------------------------------------

export interface DriverStoryItem {
  story_id:        string;
  topic_cluster:   string;
  story_title:     string;
  latest_url:      string;
  latest_source:   string;
  latest_event_ts: string;
  heat_index:      number;
  momentum_score:  number;
  is_breaking:     boolean;
  breaking_tier:   string | null;
}

// ---------------------------------------------------------------------------
// Sentiment / trends  (future MART tables)
// ---------------------------------------------------------------------------

export interface SentimentDay {
  entity_id:     string;
  topic:         string;
  day:           string;
  avg_sentiment: number;
  volume:        number;
  polarization:  number;
}

export interface TrendDay {
  day:          string;
  topic:        string;
  mentions:     number;
  velocity:     number;
  top_keywords: string[];
}