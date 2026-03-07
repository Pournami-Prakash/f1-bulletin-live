-- ============================================================
-- F1 BULLETIN — INTELLIGENCE PIPELINE
-- sql/intelligence_pipeline.sql
-- Runs in GitHub Actions after ingest, uses Snowflake Cortex
-- All 4 stages: Embed → Sentiment → Summarize → Spike detect
-- ============================================================

USE DATABASE F1_BULLETIN;
USE SCHEMA MART;
USE WAREHOUSE COMPUTE_WH;

-- ============================================================
-- STAGE 1: EMBEDDINGS + SENTIMENT
-- Process only new articles from last pipeline run
-- Cost: ~0.0003 credits/1M tokens (embed) + 0.0005 (sentiment)
-- ============================================================

CREATE TABLE IF NOT EXISTS MART.ARTICLE_EMBEDDINGS (
  guid              VARCHAR,
  event_id          VARCHAR,
  title             VARCHAR,
  summary           VARCHAR,
  source_type       VARCHAR,
  cluster_primary   VARCHAR,
  priority_score    NUMBER,
  published_at      TIMESTAMP_TZ,
  sentiment_score   FLOAT,
  sentiment_label   VARCHAR,
  embedding         VECTOR(FLOAT, 768),
  processed_at      TIMESTAMP_TZ DEFAULT CURRENT_TIMESTAMP(),
  PRIMARY KEY (guid)
);

-- Insert only articles not yet embedded
-- Runs fast because it only touches new rows
INSERT INTO MART.ARTICLE_EMBEDDINGS (
  guid, event_id, title, summary, source_type,
  cluster_primary, priority_score, published_at,
  sentiment_score, sentiment_label, embedding, processed_at
)
SELECT
  e.content_hash,          -- used as guid (unique per article)
  NULL::VARCHAR,           -- event_id (no equivalent in this view)
  e.title,
  COALESCE(e.summary, ''),
  e.source_type,
  e.topic_cluster,         -- cluster_primary equivalent
  e.priority_score,
  e.published_at_ts,       -- published_at equivalent

  -- Sentiment: -1.0 (very negative) to +1.0 (very positive)
  SNOWFLAKE.CORTEX.SENTIMENT(
    LEFT(e.title || '. ' || COALESCE(e.summary, ''), 512)
  ) AS sentiment_score,

  -- Label based on score
  CASE
    WHEN SNOWFLAKE.CORTEX.SENTIMENT(
      LEFT(e.title || '. ' || COALESCE(e.summary, ''), 512)
    ) > 0.15  THEN 'positive'
    WHEN SNOWFLAKE.CORTEX.SENTIMENT(
      LEFT(e.title || '. ' || COALESCE(e.summary, ''), 512)
    ) < -0.15 THEN 'negative'
    ELSE 'neutral'
  END AS sentiment_label,

  -- 768-dim embedding vector
  SNOWFLAKE.CORTEX.EMBED_TEXT_768(
    'snowflake-arctic-embed-m',
    LEFT(e.title || '. ' || COALESCE(e.summary, ''), 512)
  ) AS embedding,

  CURRENT_TIMESTAMP()

FROM MART.V_EVENT_F1_ONLY e
WHERE e.published_at_ts >= DATEADD('hour', -60, CURRENT_TIMESTAMP())
  AND e.content_hash IS NOT NULL
  AND e.content_hash NOT IN (
    SELECT guid FROM MART.ARTICLE_EMBEDDINGS
    WHERE processed_at >= DATEADD('day', -60, CURRENT_TIMESTAMP())
  );


-- ============================================================
-- STAGE 2: CLUSTER SUMMARIES VIA LLM
-- Only re-summarize clusters that have new articles
-- Cost: ~0.015 credits/1M tokens (llama3-8b)
-- ============================================================

CREATE TABLE IF NOT EXISTS MART.CLUSTER_SUMMARIES (
  cluster_id           VARCHAR,
  cluster_name         VARCHAR,
  summary              VARCHAR,
  article_count        NUMBER,
  source_breakdown     VARIANT,
  momentum_score       FLOAT,
  sentiment_avg        FLOAT,
  sentiment_label      VARCHAR,
  is_spike             BOOLEAN,
  z_score              FLOAT,
  priority             VARCHAR,
  articles_last_hour   NUMBER,
  last_updated         TIMESTAMP_TZ DEFAULT CURRENT_TIMESTAMP(),
  summary_generated_at TIMESTAMP_TZ,
  PRIMARY KEY (cluster_id)
);

-- Build cluster aggregate first, then call LLM only where needed
CREATE OR REPLACE TEMPORARY TABLE tmp_cluster_agg AS
WITH recent_articles AS (
  SELECT
    ae.guid,
    ae.title,
    ae.source_type,
    ae.cluster_primary        AS cluster_name,
    ae.priority_score,
    ae.sentiment_score,
    ae.sentiment_label,
    ae.published_at
  FROM MART.ARTICLE_EMBEDDINGS ae
  WHERE ae.published_at >= DATEADD('hour', -6, CURRENT_TIMESTAMP())
    AND ae.cluster_primary IS NOT NULL
),
cluster_agg AS (
  SELECT
    LOWER(REPLACE(cluster_name, ' ', '_'))  AS cluster_id,
    cluster_name,
    COUNT(*)                                AS article_count,
    ROUND(AVG(sentiment_score), 4)          AS sentiment_avg,
    COUNT(IFF(source_type = 'official', 1, NULL)) AS official_count,
    COUNT(IFF(source_type = 'reddit',   1, NULL)) AS reddit_count,
    COUNT(IFF(source_type = 'news',     1, NULL)) AS news_count,
    COUNT(IFF(published_at >= DATEADD('hour', -60, CURRENT_TIMESTAMP()), 1, NULL)) AS articles_last_hour,
    MAX(priority_score)                     AS max_priority,
    -- Concatenate top 8 headlines for LLM input
    LISTAGG(
      '- ' || title, '\n'
    ) WITHIN GROUP (ORDER BY priority_score DESC)     AS headlines
  FROM recent_articles
  GROUP BY 1, 2
  HAVING COUNT(*) >= 2
)
SELECT * FROM cluster_agg;

-- Generate summaries (LLM call per cluster)
MERGE INTO MART.CLUSTER_SUMMARIES tgt
USING (
  SELECT
    ca.cluster_id,
    ca.cluster_name,
    ca.article_count,
    ca.sentiment_avg,
    ca.official_count,
    ca.reddit_count,
    ca.news_count,
    ca.articles_last_hour,
    ca.max_priority,

    -- LLM summary — concise, factual F1 briefing
    TRIM(
      SNOWFLAKE.CORTEX.COMPLETE(
        'llama3-8b',
        'You are a concise F1 news analyst. ' ||
        'Summarize these headlines in exactly 2 sentences. ' ||
        'Be specific and factual. No filler phrases. ' ||
        'Focus on what actually happened or was announced. ' ||
        'Headlines:\n' || LEFT(ca.headlines, 2000)
      )
    ) AS summary,

    CASE
      WHEN ca.sentiment_avg >  0.2  THEN 'positive'
      WHEN ca.sentiment_avg < -0.2  THEN 'negative'
      WHEN ca.sentiment_avg BETWEEN -0.05 AND 0.05 THEN 'neutral'
      ELSE 'mixed'
    END AS sentiment_label,

    -- Momentum: weighted by recency and volume
    LEAST(100, ROUND(
      (ca.article_count * 10) +
      (ca.articles_last_hour * 20) +
      (ca.max_priority * 0.5)
    , 0)) AS momentum_score,

    CASE
      WHEN ca.max_priority >= 90 THEN 'BREAKING'
      WHEN ca.max_priority >= 70 THEN 'HIGH'
      WHEN ca.max_priority >= 40 THEN 'NORMAL'
      ELSE 'LOW'
    END AS priority,

    OBJECT_CONSTRUCT(
      'official', ca.official_count,
      'reddit',   ca.reddit_count,
      'news',     ca.news_count
    ) AS source_breakdown,

    CURRENT_TIMESTAMP() AS now_ts

  FROM tmp_cluster_agg ca
) src
ON tgt.cluster_id = src.cluster_id
WHEN MATCHED THEN UPDATE SET
  cluster_name         = src.cluster_name,
  summary              = src.summary,
  article_count        = src.article_count,
  source_breakdown     = src.source_breakdown,
  momentum_score       = src.momentum_score,
  sentiment_avg        = src.sentiment_avg,
  sentiment_label      = src.sentiment_label,
  priority             = src.priority,
  articles_last_hour   = src.articles_last_hour,
  last_updated         = src.now_ts,
  summary_generated_at = src.now_ts
WHEN NOT MATCHED THEN INSERT (
  cluster_id, cluster_name, summary, article_count,
  source_breakdown, momentum_score, sentiment_avg,
  sentiment_label, priority, articles_last_hour,
  last_updated, summary_generated_at
) VALUES (
  src.cluster_id, src.cluster_name, src.summary, src.article_count,
  src.source_breakdown, src.momentum_score, src.sentiment_avg,
  src.sentiment_label, src.priority, src.articles_last_hour,
  src.now_ts, src.now_ts
);


-- ============================================================
-- STAGE 3: SPIKE DETECTION
-- Pure SQL z-score — no model, no Cortex cost
-- ============================================================

CREATE TABLE IF NOT EXISTS MART.SPIKE_ALERTS (
  id               NUMBER AUTOINCREMENT PRIMARY KEY,
  cluster_name     VARCHAR,
  cluster_id       VARCHAR,
  z_score          FLOAT,
  current_count    NUMBER,
  baseline_avg     FLOAT,
  baseline_std     FLOAT,
  severity         VARCHAR,
  detected_at      TIMESTAMP_TZ DEFAULT CURRENT_TIMESTAMP(),
  resolved         BOOLEAN DEFAULT FALSE
);

-- Calculate baseline stats from last 7 days of hourly data
CREATE OR REPLACE TEMPORARY TABLE tmp_hourly_baseline AS
WITH hourly AS (
  SELECT
    topic_cluster                                AS cluster_name,
    DATE_TRUNC('hour', published_at_ts)          AS hr,
    COUNT(*)                                     AS cnt
  FROM MART.V_EVENT_F1_ONLY
  WHERE published_at_ts >= DATEADD('day', -7, CURRENT_TIMESTAMP())
    AND published_at_ts <  DATE_TRUNC('hour', CURRENT_TIMESTAMP())
    AND topic_cluster IS NOT NULL
  GROUP BY 1, 2
)
SELECT
  cluster_name,
  AVG(cnt)    AS avg_cnt,
  STDDEV(cnt) AS std_cnt,
  MAX(cnt)    AS max_historical
FROM hourly
GROUP BY cluster_name;

-- Current hour counts
CREATE OR REPLACE TEMPORARY TABLE tmp_current_hour AS
SELECT
  topic_cluster   AS cluster_name,
  COUNT(*)        AS current_count
FROM MART.V_EVENT_F1_ONLY
WHERE published_at_ts >= DATE_TRUNC('hour', CURRENT_TIMESTAMP())
  AND topic_cluster IS NOT NULL
GROUP BY 1;

-- Insert new spikes (avoid duplicates within same hour)
INSERT INTO MART.SPIKE_ALERTS (
  cluster_name, cluster_id, z_score, current_count,
  baseline_avg, baseline_std, severity, detected_at
)
SELECT
  c.cluster_name,
  LOWER(REPLACE(c.cluster_name, ' ', '_')) AS cluster_id,
  ROUND((c.current_count - b.avg_cnt) / NULLIF(b.std_cnt, 0), 3) AS z_score,
  c.current_count,
  ROUND(b.avg_cnt, 2)  AS baseline_avg,
  ROUND(b.std_cnt, 2)  AS baseline_std,
  CASE
    WHEN (c.current_count - b.avg_cnt) / NULLIF(b.std_cnt, 0) >= 4.0 THEN 'CRITICAL'
    WHEN (c.current_count - b.avg_cnt) / NULLIF(b.std_cnt, 0) >= 3.0 THEN 'HIGH'
    ELSE 'MEDIUM'
  END AS severity,
  CURRENT_TIMESTAMP()
FROM tmp_current_hour c
JOIN tmp_hourly_baseline b USING (cluster_name)
WHERE (c.current_count - b.avg_cnt) / NULLIF(b.std_cnt, 0) > 2.5
  AND c.cluster_name NOT IN (
    SELECT cluster_name FROM MART.SPIKE_ALERTS
    WHERE detected_at >= DATE_TRUNC('hour', CURRENT_TIMESTAMP())
  );

-- Update cluster summaries with spike flag
UPDATE MART.CLUSTER_SUMMARIES cs
SET
  is_spike = TRUE,
  z_score  = sa.z_score
FROM (
  SELECT cluster_id, MAX(z_score) AS z_score
  FROM MART.SPIKE_ALERTS
  WHERE detected_at >= DATE_TRUNC('hour', CURRENT_TIMESTAMP())
    AND resolved = FALSE
  GROUP BY cluster_id
) sa
WHERE cs.cluster_id = sa.cluster_id;

-- Auto-resolve spikes older than 3 hours with no new activity
UPDATE MART.SPIKE_ALERTS
SET resolved = TRUE
WHERE resolved = FALSE
  AND detected_at < DATEADD('hour', -3, CURRENT_TIMESTAMP())
  AND cluster_name NOT IN (
    SELECT cluster_name FROM tmp_current_hour
    WHERE current_count > 2
  );


-- ============================================================
-- STAGE 4: ENTITY SENTIMENT DAILY ROLLUP (drivers + teams)
-- Covers both individual driver surnames and 10 constructor names.
-- Drivers: LATERAL FLATTEN token match (fast, exact single-word surnames).
-- Teams:   CONTAINS substring match (needed for multi-word names like
--          "RED BULL", "ASTON MARTIN", "RACING BULLS").
-- entity_type column = 'driver' | 'team'  — shared table, separate PKs.
-- ============================================================

CREATE TABLE IF NOT EXISTS MART.DRIVER_SENTIMENT_DAILY (
  driver_name      VARCHAR,
  entity_type      VARCHAR  DEFAULT 'driver',  -- 'driver' | 'team'
  signal_date      DATE,
  sentiment_avg    FLOAT,
  sentiment_delta  FLOAT,
  sentiment_label  VARCHAR,
  mention_count    NUMBER,
  positive_count   NUMBER,
  negative_count   NUMBER,
  neutral_count    NUMBER,
  top_cluster      VARCHAR,
  updated_at       TIMESTAMP_TZ DEFAULT CURRENT_TIMESTAMP(),
  PRIMARY KEY (driver_name, entity_type, signal_date)
);

-- ── 4A: Driver sentiment (token-based, fast) ──────────────────

MERGE INTO MART.DRIVER_SENTIMENT_DAILY tgt
USING (
  WITH driver_mentions AS (
    SELECT
      UPPER(TRIM(f.value::STRING))        AS driver_name,
      'driver'                            AS entity_type,
      DATE(ae.published_at)               AS signal_date,
      ae.sentiment_score,
      ae.sentiment_label,
      ae.cluster_primary                  AS cluster_name
    FROM MART.ARTICLE_EMBEDDINGS ae,
    LATERAL FLATTEN(
      input => STRTOK_TO_ARRAY(ae.title || ' ' || COALESCE(ae.summary, ''), ' ')
    ) f
    WHERE ae.published_at >= DATEADD('day', -60, CURRENT_TIMESTAMP())
      AND UPPER(TRIM(f.value::STRING)) IN (
        'VERSTAPPEN', 'HAMILTON', 'NORRIS', 'PIASTRI',
        'LECLERC', 'RUSSELL', 'SAINZ', 'ALONSO',
        'PEREZ', 'STROLL', 'ALBON', 'HULKENBERG',
        'GASLY', 'OCON', 'BOTTAS', 'ZHOU',
        'MAGNUSSEN', 'BEARMAN', 'TSUNODA', 'LAWSON'
      )
  ),
  daily_agg AS (
    SELECT
      driver_name, entity_type, signal_date,
      ROUND(AVG(sentiment_score), 4)                           AS sentiment_avg,
      COUNT(*)                                                              AS mention_count,
      COUNT(IFF(sentiment_label = 'positive', 1, NULL))                    AS positive_count,
      COUNT(IFF(sentiment_label = 'negative', 1, NULL))                    AS negative_count,
      COUNT(IFF(sentiment_label = 'neutral',  1, NULL))                    AS neutral_count,
      MODE(cluster_name)                                                    AS top_cluster
    FROM driver_mentions
    GROUP BY 1, 2, 3
  )
  SELECT
    da.*,
    CASE
      WHEN da.sentiment_avg >  0.15 THEN 'positive'
      WHEN da.sentiment_avg < -0.15 THEN 'negative'
      ELSE 'neutral'
    END                                                         AS sentiment_label,
    ROUND(
      da.sentiment_avg - LAG(da.sentiment_avg) OVER (
        PARTITION BY da.driver_name, da.entity_type ORDER BY da.signal_date
      ), 4
    )                                                           AS sentiment_delta
  FROM daily_agg da
) src
ON  tgt.driver_name = src.driver_name
AND tgt.entity_type = src.entity_type
AND tgt.signal_date = src.signal_date
WHEN MATCHED THEN UPDATE SET
  sentiment_avg   = src.sentiment_avg,
  sentiment_delta = src.sentiment_delta,
  sentiment_label = src.sentiment_label,
  mention_count   = src.mention_count,
  positive_count  = src.positive_count,
  negative_count  = src.negative_count,
  neutral_count   = src.neutral_count,
  top_cluster     = src.top_cluster,
  updated_at      = CURRENT_TIMESTAMP()
WHEN NOT MATCHED THEN INSERT (
  driver_name, entity_type, signal_date,
  sentiment_avg, sentiment_delta, sentiment_label,
  mention_count, positive_count, negative_count, neutral_count, top_cluster
) VALUES (
  src.driver_name, src.entity_type, src.signal_date,
  src.sentiment_avg, src.sentiment_delta, src.sentiment_label,
  src.mention_count, src.positive_count, src.negative_count,
  src.neutral_count, src.top_cluster
);

-- ── 4B: Team sentiment (substring-based, handles multi-word names) ──
-- Uses CONTAINS() rather than token split because "RED BULL", "ASTON MARTIN",
-- and "RACING BULLS" don't survive a single-word tokeniser cleanly.
-- The team name list also includes common shorthands (e.g. "REDBULL", "RB").

MERGE INTO MART.DRIVER_SENTIMENT_DAILY tgt
USING (
  WITH team_raw AS (
    SELECT column1 AS team_name, column2 AS canonical FROM VALUES
      ('RED BULL',     'Red Bull'),
      ('REDBULL',      'Red Bull'),
      ('FERRARI',      'Ferrari'),
      ('MERCEDES',     'Mercedes'),
      ('MCLAREN',      'McLaren'),
      ('ASTON MARTIN', 'Aston Martin'),
      ('ALPINE',       'Alpine'),
      ('WILLIAMS',     'Williams'),
      ('HAAS',         'Haas'),
      ('SAUBER',       'Sauber'),
      ('KICK SAUBER',  'Sauber'),
      ('RACING BULLS', 'Racing Bulls'),
      ('VISA CASHAPP', 'Racing Bulls'),
      ('VCARB',        'Racing Bulls')
  ),
  team_mentions AS (
    -- Cross join articles × team list, then filter by CONTAINS.
    -- CONTAINS is case-sensitive in Snowflake so we upper-case both sides.
    SELECT
      t.canonical                          AS driver_name,   -- reuse column for teams
      'team'                               AS entity_type,
      DATE(ae.published_at)                AS signal_date,
      ae.sentiment_score,
      ae.sentiment_label,
      ae.cluster_primary                   AS cluster_name
    FROM MART.ARTICLE_EMBEDDINGS ae
    JOIN team_raw t
      ON CONTAINS(
           UPPER(ae.title || ' ' || COALESCE(ae.summary, '')),
           t.team_name
         )
    WHERE ae.published_at >= DATEADD('day', -60, CURRENT_TIMESTAMP())
  ),
  -- Deduplicate: if "RED BULL" and "REDBULL" both match the same article,
  -- canonical = 'Red Bull' so they naturally merge in the GROUP BY.
  daily_agg AS (
    SELECT
      driver_name, entity_type, signal_date,
      ROUND(AVG(sentiment_score), 4)                           AS sentiment_avg,
      COUNT(DISTINCT cluster_name)                                              AS mention_count,
      COUNT(IFF(sentiment_label = 'positive', 1, NULL))                        AS positive_count,
      COUNT(IFF(sentiment_label = 'negative', 1, NULL))                        AS negative_count,
      COUNT(IFF(sentiment_label = 'neutral',  1, NULL))                        AS neutral_count,
      MODE(cluster_name)                                                        AS top_cluster
    FROM team_mentions
    GROUP BY 1, 2, 3
  )
  SELECT
    da.*,
    CASE
      WHEN da.sentiment_avg >  0.15 THEN 'positive'
      WHEN da.sentiment_avg < -0.15 THEN 'negative'
      ELSE 'neutral'
    END                                                         AS sentiment_label,
    ROUND(
      da.sentiment_avg - LAG(da.sentiment_avg) OVER (
        PARTITION BY da.driver_name, da.entity_type ORDER BY da.signal_date
      ), 4
    )                                                           AS sentiment_delta
  FROM daily_agg da
) src
ON  tgt.driver_name = src.driver_name
AND tgt.entity_type = src.entity_type
AND tgt.signal_date = src.signal_date
WHEN MATCHED THEN UPDATE SET
  sentiment_avg   = src.sentiment_avg,
  sentiment_delta = src.sentiment_delta,
  sentiment_label = src.sentiment_label,
  mention_count   = src.mention_count,
  positive_count  = src.positive_count,
  negative_count  = src.negative_count,
  neutral_count   = src.neutral_count,
  top_cluster     = src.top_cluster,
  updated_at      = CURRENT_TIMESTAMP()
WHEN NOT MATCHED THEN INSERT (
  driver_name, entity_type, signal_date,
  sentiment_avg, sentiment_delta, sentiment_label,
  mention_count, positive_count, negative_count, neutral_count, top_cluster
) VALUES (
  src.driver_name, src.entity_type, src.signal_date,
  src.sentiment_avg, src.sentiment_delta, src.sentiment_label,
  src.mention_count, src.positive_count, src.negative_count,
  src.neutral_count, src.top_cluster
);


-- ============================================================
-- CLEANUP: Remove embeddings older than 30 days to save storage
-- ============================================================
DELETE FROM MART.ARTICLE_EMBEDDINGS
WHERE processed_at < DATEADD('day', -60, CURRENT_TIMESTAMP());

DELETE FROM MART.SPIKE_ALERTS
WHERE detected_at < DATEADD('day', -60, CURRENT_TIMESTAMP())
  AND resolved = TRUE;

-- ============================================================
-- DONE — intelligence pipeline complete
-- Next: intelligence_sync.py exports results to Neon Postgres
-- ============================================================