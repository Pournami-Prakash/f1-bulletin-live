-- ============================================================
-- F1 BULLETIN — INTELLIGENCE PIPELINE EXTENSION
-- sql/intelligence_phase2_completion.sql
--
-- STAGE 5: Controversy Index
--   → Per driver + per team, per day
--   → Combines: negative sentiment + FIA activity +
--               spike frequency + media attention volume
--   → Output: MART.CONTROVERSY_INDEX
--
-- STAGE 6: Daily Briefing Generator
--   → One generated briefing per day
--   → Top clusters + sentiment shifts + what to watch
--   → Uses Cortex llama3-8b
--   → Output: MART.DAILY_BRIEFINGS
--
-- Run order: after intelligence_pipeline.sql completes
-- Cost estimate: ~0.05 credits/day (llama3-8b, 1 call/day)
-- ============================================================

USE DATABASE F1_BULLETIN;
USE SCHEMA MART;
USE WAREHOUSE COMPUTE_WH;


-- ============================================================
-- STAGE 5A: CONTROVERSY INDEX — TABLE DEFINITIONS
-- ============================================================

-- Driver controversy index (daily)
CREATE TABLE IF NOT EXISTS MART.CONTROVERSY_INDEX (
  entity_name        VARCHAR NOT NULL,   -- driver or team name
  entity_type        VARCHAR NOT NULL,   -- 'driver' | 'team'
  index_date         DATE    NOT NULL,

  -- Component scores (each 0–100)
  sentiment_score    FLOAT,   -- negative sentiment weight (inverted: high = more negative)
  fia_score          FLOAT,   -- FIA notice/investigation activity
  spike_score        FLOAT,   -- how many spike alerts triggered for this entity
  media_score        FLOAT,   -- volume of media coverage vs baseline

  -- Composite controversy score (0–100)
  -- Weighted: sentiment 35% + FIA 30% + spike 20% + media 15%
  controversy_score  FLOAT,

  -- Context
  mention_count      NUMBER,
  negative_count     NUMBER,
  fia_mentions       NUMBER,  -- count of FIA-source articles mentioning this entity
  spike_count        NUMBER,  -- spikes this entity contributed to
  top_cluster        VARCHAR, -- which cluster is driving controversy
  controversy_label  VARCHAR, -- 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE'

  -- Delta vs previous day
  score_delta        FLOAT,
  trending_direction VARCHAR,  -- 'rising' | 'falling' | 'stable'

  updated_at         TIMESTAMP_TZ DEFAULT CURRENT_TIMESTAMP(),

  PRIMARY KEY (entity_name, entity_type, index_date)
);


-- ============================================================
-- STAGE 5B: CONTROVERSY INDEX — CALCULATION
-- ============================================================

-- Step 1: Build entity-level article stats for today
CREATE OR REPLACE TEMPORARY TABLE tmp_entity_stats AS
WITH

-- All articles from last 72h with sentiment + source
article_base AS (
  SELECT
    ae.guid,
    ae.title,
    ae.summary,
    ae.source_type,
    ae.cluster_primary,
    ae.sentiment_score,
    ae.sentiment_label,
    ae.priority_score,
    ae.published_at,
    DATE(ae.published_at) AS signal_date
  FROM MART.ARTICLE_EMBEDDINGS ae
  WHERE ae.published_at >= DATEADD('day', -3, CURRENT_TIMESTAMP())
),

-- Explode driver mentions from articles
-- Match against known 2026 F1 grid
driver_mentions AS (
  SELECT
    'driver'                              AS entity_type,
    d.driver_name                         AS entity_name,
    ab.guid,
    ab.source_type,
    ab.cluster_primary,
    ab.sentiment_score,
    ab.sentiment_label,
    ab.priority_score,
    ab.signal_date
  FROM article_base ab
  JOIN (
    SELECT column1 AS driver_name FROM VALUES
      ('VERSTAPPEN'), ('HAMILTON'), ('NORRIS'), ('PIASTRI'),
      ('LECLERC'), ('RUSSELL'), ('SAINZ'), ('ALONSO'),
      ('PEREZ'), ('STROLL'), ('ALBON'), ('HULKENBERG'),
      ('GASLY'), ('OCON'), ('BOTTAS'), ('ZHOU'),
      ('MAGNUSSEN'), ('BEARMAN'), ('TSUNODA'), ('LAWSON')
  ) d ON UPPER(ab.title || ' ' || COALESCE(ab.summary, ''))
         LIKE '%' || d.driver_name || '%'
),

-- Team mentions
team_mentions AS (
  SELECT
    'team'                                AS entity_type,
    t.team_name                           AS entity_name,
    ab.guid,
    ab.source_type,
    ab.cluster_primary,
    ab.sentiment_score,
    ab.sentiment_label,
    ab.priority_score,
    ab.signal_date
  FROM article_base ab
  JOIN (
    SELECT column1 AS team_name FROM VALUES
      ('RED BULL'), ('FERRARI'), ('MERCEDES'), ('MCLAREN'),
      ('ASTON MARTIN'), ('ALPINE'), ('WILLIAMS'), ('HAAS'),
      ('SAUBER'), ('RACING BULLS')
  ) t ON UPPER(ab.title || ' ' || COALESCE(ab.summary, ''))
         LIKE '%' || t.team_name || '%'
),

-- Combine drivers + teams
all_mentions AS (
  SELECT * FROM driver_mentions
  UNION ALL
  SELECT * FROM team_mentions
),

-- Aggregate per entity per day
entity_daily AS (
  SELECT
    entity_name,
    entity_type,
    signal_date,
    COUNT(DISTINCT guid)                                            AS mention_count,
    COUNT(DISTINCT IFF(sentiment_label = 'negative', guid, NULL))     AS negative_count,
    COUNT(DISTINCT IFF(source_type = 'official',    guid, NULL))     AS fia_mentions,
    AVG(sentiment_score)                                            AS avg_sentiment,
    MODE(cluster_primary)                                           AS top_cluster
  FROM all_mentions
  GROUP BY 1, 2, 3
),

-- Baseline: average daily mentions per entity over last 30 days
entity_baseline AS (
  SELECT
    entity_name,
    entity_type,
    AVG(mention_count) AS baseline_avg,
    STDDEV(mention_count) AS baseline_std
  FROM (
    SELECT
      entity_name,
      entity_type,
      signal_date        AS d,
      COUNT(*) AS mention_count
    FROM all_mentions
    GROUP BY 1, 2, 3
  )
  GROUP BY 1, 2
),

-- Spike contribution: how many spike alerts fired for clusters this entity is in
entity_spikes AS (
  SELECT
    am.entity_name,
    am.entity_type,
    DATE(am.signal_date)   AS spike_date,
    COUNT(DISTINCT sa.id)  AS spike_count
  FROM all_mentions am
  LEFT JOIN MART.SPIKE_ALERTS sa
    ON sa.cluster_name = am.cluster_primary
    AND DATE(sa.detected_at) = am.signal_date
    AND sa.resolved = FALSE
  GROUP BY 1, 2, 3
)

SELECT
  ed.entity_name,
  ed.entity_type,
  ed.signal_date,
  ed.mention_count,
  ed.negative_count,
  ed.fia_mentions,
  ed.avg_sentiment,
  ed.top_cluster,
  COALESCE(es.spike_count, 0)   AS spike_count,
  eb.baseline_avg,
  eb.baseline_std,
  -- Normalised media score: how much above baseline (capped 0–100)
  LEAST(100, GREATEST(0, ROUND(
    CASE
      WHEN COALESCE(eb.baseline_std, 0) = 0 THEN 50
      ELSE 50 + ((ed.mention_count - eb.baseline_avg) / NULLIF(eb.baseline_std, 1)) * 15
    END
  , 1)))                        AS media_score_raw
FROM entity_daily ed
LEFT JOIN entity_baseline eb USING (entity_name, entity_type)
LEFT JOIN entity_spikes es
  ON es.entity_name = ed.entity_name
  AND es.entity_type = ed.entity_type
  AND es.spike_date  = ed.signal_date
WHERE ed.signal_date = CURRENT_DATE();


-- Step 2: Calculate component scores and composite controversy index
CREATE OR REPLACE TEMPORARY TABLE tmp_controversy_scores AS
SELECT
  entity_name,
  entity_type,
  signal_date,
  mention_count,
  negative_count,
  fia_mentions,
  spike_count,
  top_cluster,
  media_score_raw,

  -- Component A: Sentiment score (0–100, higher = more negative = more controversial)
  LEAST(100, GREATEST(0, ROUND(
    CASE
      WHEN mention_count = 0 THEN 0
      ELSE (negative_count::FLOAT / mention_count) * 100
    END
  , 1))) AS sentiment_component,

  -- Component B: FIA activity score (0–100)
  -- 0 FIA mentions = 0, 1 = 25, 2 = 50, 3+ = 75+, capped at 100
  LEAST(100, ROUND(fia_mentions * 28.0, 1)) AS fia_component,

  -- Component C: Spike score (0–100)
  -- Each spike = 35 points, capped at 100
  LEAST(100, ROUND(spike_count * 35.0, 1)) AS spike_component,

  -- Component D: Media attention score (already normalised above)
  media_score_raw AS media_component

FROM tmp_entity_stats;


-- Step 3: Merge into controversy index with composite score + delta
MERGE INTO MART.CONTROVERSY_INDEX tgt
USING (
  SELECT
    cs.entity_name,
    cs.entity_type,
    cs.index_date,
    cs.sentiment_component  AS sentiment_score,
    cs.fia_component        AS fia_score,
    cs.spike_component      AS spike_score,
    cs.media_component      AS media_score,

    -- Weighted composite (35 / 30 / 20 / 15)
    ROUND(
      (cs.sentiment_component * 0.35) +
      (cs.fia_component       * 0.30) +
      (cs.spike_component     * 0.20) +
      (cs.media_component     * 0.15)
    , 2) AS controversy_score,

    cs.mention_count,
    cs.negative_count,
    cs.fia_mentions,
    cs.spike_count,
    cs.top_cluster,

    CASE
      WHEN ROUND(
        (cs.sentiment_component * 0.35) +
        (cs.fia_component       * 0.30) +
        (cs.spike_component     * 0.20) +
        (cs.media_component     * 0.15)
      , 2) >= 65 THEN 'HIGH'
      WHEN ROUND(
        (cs.sentiment_component * 0.35) +
        (cs.fia_component       * 0.30) +
        (cs.spike_component     * 0.20) +
        (cs.media_component     * 0.15)
      , 2) >= 35 THEN 'MEDIUM'
      WHEN ROUND(
        (cs.sentiment_component * 0.35) +
        (cs.fia_component       * 0.30) +
        (cs.spike_component     * 0.20) +
        (cs.media_component     * 0.15)
      , 2) >= 10 THEN 'LOW'
      ELSE 'NONE'
    END AS controversy_label,

    -- Delta vs yesterday
    ROUND(
      ROUND(
        (cs.sentiment_component * 0.35) +
        (cs.fia_component       * 0.30) +
        (cs.spike_component     * 0.20) +
        (cs.media_component     * 0.15)
      , 2)
      -
      LAG(ROUND(
        (cs.sentiment_component * 0.35) +
        (cs.fia_component       * 0.30) +
        (cs.spike_component     * 0.20) +
        (cs.media_component     * 0.15)
      , 2)) OVER (
        PARTITION BY cs.entity_name, cs.entity_type
        ORDER BY cs.index_date
      )
    , 2) AS score_delta,

    CURRENT_TIMESTAMP() AS now_ts

  FROM (
    SELECT *, CURRENT_DATE() AS index_date FROM tmp_controversy_scores
  ) cs
) src
ON  tgt.entity_name  = src.entity_name
AND tgt.entity_type  = src.entity_type
AND tgt.index_date   = src.index_date
WHEN MATCHED THEN UPDATE SET
  sentiment_score    = src.sentiment_score,
  fia_score          = src.fia_score,
  spike_score        = src.spike_score,
  media_score        = src.media_score,
  controversy_score  = src.controversy_score,
  mention_count      = src.mention_count,
  negative_count     = src.negative_count,
  fia_mentions       = src.fia_mentions,
  spike_count        = src.spike_count,
  top_cluster        = src.top_cluster,
  controversy_label  = src.controversy_label,
  score_delta        = src.score_delta,
  trending_direction = CASE
                         WHEN src.score_delta > 3  THEN 'rising'
                         WHEN src.score_delta < -3 THEN 'falling'
                         ELSE 'stable'
                       END,
  updated_at         = src.now_ts
WHEN NOT MATCHED THEN INSERT (
  entity_name, entity_type, index_date,
  sentiment_score, fia_score, spike_score, media_score,
  controversy_score, mention_count, negative_count,
  fia_mentions, spike_count, top_cluster,
  controversy_label, score_delta, trending_direction, updated_at
) VALUES (
  src.entity_name, src.entity_type, src.index_date,
  src.sentiment_score, src.fia_score, src.spike_score, src.media_score,
  src.controversy_score, src.mention_count, src.negative_count,
  src.fia_mentions, src.spike_count, src.top_cluster,
  src.controversy_label, src.score_delta,
  CASE
    WHEN src.score_delta > 3  THEN 'rising'
    WHEN src.score_delta < -3 THEN 'falling'
    ELSE 'stable'
  END,
  src.now_ts
);


-- ============================================================
-- STAGE 5C: REGULATORY TAGGING
-- Tag articles with specific FIA notice types
-- Adds regulatory_tag column to a new view
-- ============================================================

CREATE TABLE IF NOT EXISTS MART.REGULATORY_TAGS (
  guid              VARCHAR NOT NULL,
  regulatory_tag    VARCHAR NOT NULL,   -- see tags below
  confidence        FLOAT,              -- 0.0–1.0
  tagged_at         TIMESTAMP_TZ DEFAULT CURRENT_TIMESTAMP(),
  PRIMARY KEY (guid, regulatory_tag)
);

-- Tags:
--   TECHNICAL_DIRECTIVE  — TD issued by FIA
--   PENALTY              — grid penalty, time penalty, reprimand
--   INVESTIGATION        — under investigation / summoned
--   COST_CAP             — financial regulations
--   PROTEST              — team/driver protest
--   CLARIFICATION        — rules clarification
--   DQ                   — disqualification
--   WARNING              — official warning

INSERT INTO MART.REGULATORY_TAGS (guid, regulatory_tag, confidence)
SELECT DISTINCT
  ae.guid,
  tag.regulatory_tag,
  tag.confidence
FROM MART.ARTICLE_EMBEDDINGS ae
CROSS JOIN (
  SELECT 'TECHNICAL_DIRECTIVE' AS regulatory_tag, 0.95 AS confidence,
         '%TECHNICAL DIRECTIVE%'                        AS pattern
  UNION ALL SELECT 'PENALTY',       0.90, '%PENALTY%'
  UNION ALL SELECT 'PENALTY',       0.90, '%GRID PEN%'
  UNION ALL SELECT 'INVESTIGATION', 0.92, '%INVESTIGATION%'
  UNION ALL SELECT 'INVESTIGATION', 0.88, '%SUMMONED%'
  UNION ALL SELECT 'INVESTIGATION', 0.85, '%STEWARDS%'
  UNION ALL SELECT 'COST_CAP',      0.93, '%COST CAP%'
  UNION ALL SELECT 'COST_CAP',      0.88, '%FINANCIAL REGULATION%'
  UNION ALL SELECT 'PROTEST',       0.91, '%PROTEST%'
  UNION ALL SELECT 'CLARIFICATION', 0.87, '%CLARIFICATION%'
  UNION ALL SELECT 'CLARIFICATION', 0.85, '%TECHNICAL NOTE%'
  UNION ALL SELECT 'DQ',            0.95, '%DISQUALIF%'
  UNION ALL SELECT 'DQ',            0.92, '%EXCLUDED%'
  UNION ALL SELECT 'WARNING',       0.88, '%OFFICIAL WARNING%'
  UNION ALL SELECT 'WARNING',       0.85, '%BLACK AND WHITE%'
) tag
WHERE ae.source_type = 'official'
  AND UPPER(ae.title || ' ' || COALESCE(ae.summary, '')) LIKE tag.pattern
  AND ae.published_at >= DATEADD('day', -7, CURRENT_TIMESTAMP())
  AND NOT EXISTS (
    SELECT 1 FROM MART.REGULATORY_TAGS rt
    WHERE rt.guid = ae.guid
      AND rt.regulatory_tag = tag.regulatory_tag
  );


-- ============================================================
-- STAGE 5D: 72-HOUR MOMENTUM WINDOW
-- Replaces 1-hour momentum with proper rolling window
-- ============================================================

CREATE TABLE IF NOT EXISTS MART.CLUSTER_MOMENTUM_72H (
  cluster_name      VARCHAR NOT NULL,
  cluster_id        VARCHAR NOT NULL,
  window_start      TIMESTAMP_TZ,
  window_end        TIMESTAMP_TZ,

  -- Volume metrics
  articles_72h      NUMBER,
  articles_48h      NUMBER,
  articles_24h      NUMBER,
  articles_6h       NUMBER,
  articles_1h       NUMBER,

  -- Velocity: are we accelerating or decelerating?
  velocity          FLOAT,   -- articles_24h - articles_48h (positive = accelerating)
  velocity_label    VARCHAR, -- 'SURGING' | 'BUILDING' | 'STABLE' | 'FADING' | 'DEAD'

  -- Momentum score: recency-weighted
  -- Articles in last 1h worth 5x, 6h worth 3x, 24h worth 2x, 72h worth 1x
  momentum_score    FLOAT,

  -- Day-over-day story continuity
  days_active       NUMBER,  -- how many of last 3 days had articles
  is_sustained      BOOLEAN, -- TRUE if active for 2+ consecutive days

  calculated_at     TIMESTAMP_TZ DEFAULT CURRENT_TIMESTAMP(),
  PRIMARY KEY (cluster_name)
);

MERGE INTO MART.CLUSTER_MOMENTUM_72H tgt
USING (
  WITH windows AS (
    SELECT
      cluster_primary                                            AS cluster_name,
      LOWER(REPLACE(cluster_primary, ' ', '_'))                 AS cluster_id,
      COUNT(IFF(published_at >= DATEADD('hour', -72, CURRENT_TIMESTAMP()), 1, NULL)) AS articles_72h,
      COUNT(IFF(published_at >= DATEADD('hour', -48, CURRENT_TIMESTAMP()), 1, NULL)) AS articles_48h,
      COUNT(IFF(published_at >= DATEADD('hour', -24, CURRENT_TIMESTAMP()), 1, NULL)) AS articles_24h,
      COUNT(IFF(published_at >= DATEADD('hour', -6,  CURRENT_TIMESTAMP()), 1, NULL)) AS articles_6h,
      COUNT(IFF(published_at >= DATEADD('hour', -1,  CURRENT_TIMESTAMP()), 1, NULL)) AS articles_1h,
      COUNT(DISTINCT DATE(published_at))                        AS days_active
    FROM MART.ARTICLE_EMBEDDINGS
    WHERE published_at >= DATEADD('hour', -72, CURRENT_TIMESTAMP())
      AND cluster_primary IS NOT NULL
    GROUP BY 1, 2
  )
  SELECT
    cluster_name,
    cluster_id,
    DATEADD('hour', -72, CURRENT_TIMESTAMP())   AS window_start,
    CURRENT_TIMESTAMP()                          AS window_end,
    articles_72h,
    articles_48h,
    articles_24h,
    articles_6h,
    articles_1h,
    days_active,
    days_active >= 2                             AS is_sustained,
    -- Velocity: last 24h vs previous 24h (24-48h window)
    (articles_24h - (articles_48h - articles_24h)) AS velocity,
    -- Velocity label
    CASE
      WHEN articles_1h >= 5                       THEN 'SURGING'
      WHEN (articles_24h - (articles_48h - articles_24h)) > 3  THEN 'BUILDING'
      WHEN ABS(articles_24h - (articles_48h - articles_24h)) <= 2 THEN 'STABLE'
      WHEN (articles_24h - (articles_48h - articles_24h)) < -3 THEN 'FADING'
      WHEN articles_24h = 0                       THEN 'DEAD'
      ELSE 'STABLE'
    END AS velocity_label,
    -- Weighted momentum score
    LEAST(100, ROUND(
      (articles_1h  * 5.0) +
      (articles_6h  * 3.0) +
      (articles_24h * 2.0) +
      (articles_72h * 1.0)
    , 1)) AS momentum_score
  FROM windows
) src
ON tgt.cluster_name = src.cluster_name
WHEN MATCHED THEN UPDATE SET
  window_start   = src.window_start,
  window_end     = src.window_end,
  articles_72h   = src.articles_72h,
  articles_48h   = src.articles_48h,
  articles_24h   = src.articles_24h,
  articles_6h    = src.articles_6h,
  articles_1h    = src.articles_1h,
  velocity       = src.velocity,
  velocity_label = src.velocity_label,
  momentum_score = src.momentum_score,
  days_active    = src.days_active,
  is_sustained   = src.is_sustained,
  calculated_at  = CURRENT_TIMESTAMP()
WHEN NOT MATCHED THEN INSERT (
  cluster_name, cluster_id, window_start, window_end,
  articles_72h, articles_48h, articles_24h, articles_6h, articles_1h,
  velocity, velocity_label, momentum_score,
  days_active, is_sustained
) VALUES (
  src.cluster_name, src.cluster_id, src.window_start, src.window_end,
  src.articles_72h, src.articles_48h, src.articles_24h, src.articles_6h, src.articles_1h,
  src.velocity, src.velocity_label, src.momentum_score,
  src.days_active, src.is_sustained
);


-- ============================================================
-- STAGE 6A: DAILY BRIEFING — TABLE
-- One row per day. Generated once per day via Cortex LLM.
-- Only runs if today's briefing doesn't exist yet.
-- Cost: ~1 LLM call/day = negligible
-- ============================================================

CREATE TABLE IF NOT EXISTS MART.DAILY_BRIEFINGS (
  briefing_date       DATE        NOT NULL PRIMARY KEY,

  -- Generated briefing content
  headline            VARCHAR,    -- one punchy headline for the day
  lead_paragraph      VARCHAR,    -- 3–4 sentence overview of the day
  top_story_summary   VARCHAR,    -- 2 sentences on the #1 cluster
  driver_spotlight    VARCHAR,    -- which driver dominated + why
  controversy_note    VARCHAR,    -- any controversy to watch (nullable)
  what_to_watch       VARCHAR,    -- forward-looking 1–2 sentences

  -- Data inputs used to generate
  top_cluster         VARCHAR,
  top_driver          VARCHAR,
  total_signals       NUMBER,
  breaking_count      NUMBER,
  avg_sentiment       FLOAT,
  sentiment_label     VARCHAR,
  active_spike_count  NUMBER,
  top_controversy_entity VARCHAR,
  top_controversy_score  FLOAT,

  -- Meta
  generated_at        TIMESTAMP_TZ DEFAULT CURRENT_TIMESTAMP(),
  model_used          VARCHAR DEFAULT 'llama3-8b',
  generation_skipped  BOOLEAN DEFAULT FALSE,  -- TRUE if no data to summarize
  skip_reason         VARCHAR
);


-- ============================================================
-- STAGE 6B: DAILY BRIEFING — GENERATION
-- Only generates if today's briefing doesn't already exist
-- ============================================================

-- Collect today's context for the LLM prompt
CREATE OR REPLACE TEMPORARY TABLE tmp_briefing_context AS
WITH

-- Top cluster today
top_cluster AS (
  SELECT cluster_name, momentum_score, velocity_label, articles_24h
  FROM MART.CLUSTER_MOMENTUM_72H
  ORDER BY momentum_score DESC NULLS LAST
  LIMIT 1
),

-- Top driver by mentions today
top_driver AS (
  SELECT driver_name, mention_count, sentiment_avg, sentiment_label
  FROM MART.DRIVER_SENTIMENT_DAILY
  WHERE signal_date = CURRENT_DATE()
  ORDER BY mention_count DESC NULLS LAST
  LIMIT 1
),

-- Signal totals
signal_totals AS (
  SELECT
    COUNT(*)                                                  AS total_signals,
    COUNT(IFF(priority_score >= 85, 1, NULL))                  AS breaking_count,
    ROUND(AVG(sentiment_score), 3)                            AS avg_sentiment,
    CASE
      WHEN AVG(sentiment_score) >  0.15 THEN 'positive'
      WHEN AVG(sentiment_score) < -0.15 THEN 'negative'
      ELSE 'neutral'
    END                                                       AS sentiment_label
  FROM MART.ARTICLE_EMBEDDINGS
  WHERE published_at >= DATEADD('hour', -24, CURRENT_TIMESTAMP())
),

-- Active spikes
active_spikes AS (
  SELECT COUNT(*) AS spike_count
  FROM MART.SPIKE_ALERTS
  WHERE resolved = FALSE
    AND detected_at >= DATEADD('hour', -24, CURRENT_TIMESTAMP())
),

-- Top controversy today
top_controversy AS (
  SELECT entity_name, controversy_score, controversy_label, trending_direction
  FROM MART.CONTROVERSY_INDEX
  WHERE index_date = CURRENT_DATE()
    AND controversy_label IN ('HIGH', 'MEDIUM')
  ORDER BY controversy_score DESC NULLS LAST
  LIMIT 1
),

-- Top 5 headlines for LLM context
top_headlines AS (
  SELECT
    LISTAGG('- ' || title, '\n')
      WITHIN GROUP (ORDER BY priority_score DESC)  AS headlines
  FROM (
    SELECT title, priority_score
    FROM MART.ARTICLE_EMBEDDINGS
    WHERE published_at >= DATEADD('hour', -24, CURRENT_TIMESTAMP())
    QUALIFY ROW_NUMBER() OVER (ORDER BY priority_score DESC) <= 8
  )
),

-- Cluster summaries context
cluster_context AS (
  SELECT
    LISTAGG(cluster_name || ' (' || article_count || ' signals, ' || sentiment_label || ')', ' | ')
      WITHIN GROUP (ORDER BY momentum_score DESC)  AS cluster_overview
  FROM (
    SELECT cluster_name, article_count, sentiment_label, momentum_score
    FROM MART.CLUSTER_SUMMARIES
    WHERE article_count > 0
    QUALIFY ROW_NUMBER() OVER (ORDER BY momentum_score DESC) <= 4
  )
)

SELECT
  tc.cluster_name         AS top_cluster,
  tc.momentum_score       AS top_cluster_momentum,
  tc.velocity_label       AS top_cluster_velocity,
  td.driver_name          AS top_driver,
  td.mention_count        AS top_driver_mentions,
  td.sentiment_label      AS top_driver_sentiment,
  st.total_signals,
  st.breaking_count,
  st.avg_sentiment,
  st.sentiment_label,
  asp.spike_count         AS active_spike_count,
  tcon.entity_name        AS top_controversy_entity,
  tcon.controversy_score  AS top_controversy_score,
  tcon.trending_direction AS controversy_trend,
  th.headlines            AS top_headlines,
  cc.cluster_overview     AS cluster_overview
FROM signal_totals st
LEFT JOIN top_cluster tc     ON TRUE
LEFT JOIN top_driver td      ON TRUE
LEFT JOIN active_spikes asp  ON TRUE
LEFT JOIN top_controversy tcon ON TRUE
LEFT JOIN top_headlines th   ON TRUE
LEFT JOIN cluster_context cc ON TRUE;


-- Generate briefing only if it doesn't exist for today
-- and we have enough data (at least 5 signals)
INSERT INTO MART.DAILY_BRIEFINGS (
  briefing_date,
  headline,
  lead_paragraph,
  top_story_summary,
  driver_spotlight,
  controversy_note,
  what_to_watch,
  top_cluster,
  top_driver,
  total_signals,
  breaking_count,
  avg_sentiment,
  sentiment_label,
  active_spike_count,
  top_controversy_entity,
  top_controversy_score,
  generated_at,
  model_used
)
SELECT
  CURRENT_DATE(),

  -- HEADLINE: punchy, 1 line
  TRIM(SNOWFLAKE.CORTEX.COMPLETE(
    'llama3-8b',
    'Write ONE punchy headline (max 12 words) summarising F1 news today. ' ||
    'Be specific. No filler. Based on: ' ||
    ctx.top_headlines
  )),

  -- LEAD PARAGRAPH: 3-4 sentence overview
  TRIM(SNOWFLAKE.CORTEX.COMPLETE(
    'llama3-8b',
    'You are an F1 analyst. Write a 3-sentence overview of today''s F1 news. ' ||
    'Be specific and factual. No filler. ' ||
    'Total signals today: ' || ctx.total_signals || '. ' ||
    'Breaking stories: ' || ctx.breaking_count || '. ' ||
    'Overall sentiment: ' || ctx.sentiment_label || '. ' ||
    'Active clusters: ' || ctx.cluster_overview || '. ' ||
    'Top headlines: ' || CHR(10) || ctx.top_headlines
  )),

  -- TOP STORY: 2 sentences on #1 cluster
  TRIM(SNOWFLAKE.CORTEX.COMPLETE(
    'llama3-8b',
    'In exactly 2 sentences, describe the biggest F1 story today. ' ||
    'Be specific. Cluster: ' || COALESCE(ctx.top_cluster, 'GENERAL') || '. ' ||
    'Headlines: ' || CHR(10) || ctx.top_headlines
  )),

  -- DRIVER SPOTLIGHT: 1-2 sentences
  TRIM(SNOWFLAKE.CORTEX.COMPLETE(
    'llama3-8b',
    'In 1-2 sentences, describe why ' ||
    COALESCE(ctx.top_driver, 'this driver') ||
    ' was most mentioned in F1 today. Sentiment: ' ||
    COALESCE(ctx.top_driver_sentiment, 'neutral') ||
    '. Mentions: ' || COALESCE(ctx.top_driver_mentions::VARCHAR, '0') ||
    '. Headlines: ' || ctx.top_headlines
  )),

  -- CONTROVERSY NOTE: 1 sentence (nullable if no controversy)
  CASE
    WHEN ctx.top_controversy_entity IS NOT NULL THEN
      TRIM(SNOWFLAKE.CORTEX.COMPLETE(
        'llama3-8b',
        'In 1 sentence, describe the controversy around ' ||
        ctx.top_controversy_entity ||
        ' in F1 today. Controversy score: ' ||
        ROUND(ctx.top_controversy_score, 0) || '/100. ' ||
        'Trending: ' || COALESCE(ctx.controversy_trend, 'stable') ||
        '. Headlines: ' || ctx.top_headlines
      ))
    ELSE NULL
  END,

  -- WHAT TO WATCH: forward-looking 1-2 sentences
  TRIM(SNOWFLAKE.CORTEX.COMPLETE(
    'llama3-8b',
    'In 1-2 sentences, what should F1 fans watch for in the coming days? ' ||
    'Based on current momentum: ' || ctx.cluster_overview || '. ' ||
    'Any spikes: ' || ctx.active_spike_count || ' active alerts. ' ||
    'Be specific and forward-looking.'
  )),

  ctx.top_cluster,
  ctx.top_driver,
  ctx.total_signals,
  ctx.breaking_count,
  ctx.avg_sentiment,
  ctx.sentiment_label,
  ctx.active_spike_count,
  ctx.top_controversy_entity,
  ctx.top_controversy_score,
  CURRENT_TIMESTAMP(),
  'llama3-8b'

FROM tmp_briefing_context ctx

-- Only insert if today's briefing doesn't exist yet
WHERE NOT EXISTS (
  SELECT 1 FROM MART.DAILY_BRIEFINGS
  WHERE briefing_date = CURRENT_DATE()
    AND generation_skipped = FALSE
)
-- And we have enough data to generate a meaningful briefing
AND ctx.total_signals >= 5;


-- Mark as skipped if not enough data
INSERT INTO MART.DAILY_BRIEFINGS (
  briefing_date, generation_skipped, skip_reason, generated_at
)
SELECT
  CURRENT_DATE(),
  TRUE,
  'Insufficient signals: ' || COALESCE(total_signals::VARCHAR, '0') || ' < 5 required',
  CURRENT_TIMESTAMP()
FROM tmp_briefing_context
WHERE NOT EXISTS (
  SELECT 1 FROM MART.DAILY_BRIEFINGS
  WHERE briefing_date = CURRENT_DATE()
)
AND total_signals < 5;


-- ============================================================
-- STAGE 6C: CLEANUP OLD DATA
-- ============================================================

-- Keep 90 days of controversy history
DELETE FROM MART.CONTROVERSY_INDEX
WHERE index_date < DATEADD('day', -90, CURRENT_DATE());

-- Keep 90 days of briefings
DELETE FROM MART.DAILY_BRIEFINGS
WHERE briefing_date < DATEADD('day', -90, CURRENT_DATE());

-- Keep 30 days of regulatory tags
DELETE FROM MART.REGULATORY_TAGS
WHERE tagged_at < DATEADD('day', -60, CURRENT_TIMESTAMP());
