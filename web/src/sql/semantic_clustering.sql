-- ============================================================
-- FIX 4: SEMANTIC CLUSTERING
-- sql/semantic_clustering.sql
--
-- Replaces keyword-only cluster_primary with embedding-based
-- cosine similarity grouping.
--
-- APPROACH
--   1. Pull recent articles (last 48 h) that have 768-dim embeddings
--   2. Find "seed" articles: highest-priority articles not yet dominated
--      by any higher-priority article with cosine sim >= 0.76
--   3. Assign every non-seed to its closest seed (sim >= 0.72)
--   4. Articles with no matching seed form their own singleton clusters
--   5. Upsert into MART.SEMANTIC_CLUSTERS + MART.ARTICLE_SEMANTIC_CLUSTER
--   6. Backfill MART.CLUSTER_SUMMARIES article_count where a semantic
--      cluster maps onto an existing keyword cluster
--
-- SNOWFLAKE NOTE
--   VECTOR_COSINE_SIMILARITY(a, b) works on VECTOR(FLOAT, 768) columns
--   (Snowflake Cortex GA, Nov 2024+). The cross-join is capped at 400
--   articles so the O(n²) table scan stays well under 1 compute-second.
--
-- COST: ~0 credits — no LLM calls, pure vector math on the same WH
-- RUN ORDER: after Stage 1 (embeddings) in intelligence_pipeline.sql
-- ============================================================

USE DATABASE F1_BULLETIN;
USE SCHEMA MART;
USE WAREHOUSE COMPUTE_WH;


-- ── Output tables ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS MART.SEMANTIC_CLUSTERS (
  cluster_id          VARCHAR        NOT NULL,  -- MD5(seed_guid)
  cluster_label       VARCHAR,                  -- first 120 chars of seed title
  seed_guid           VARCHAR        NOT NULL,
  article_count       NUMBER         DEFAULT 1,
  avg_similarity      FLOAT,
  centroid_embedding  VECTOR(FLOAT, 768),       -- seed embedding (proxy centroid)
  sentiment_avg       FLOAT,
  sentiment_label     VARCHAR,
  keyword_cluster     VARCHAR,                  -- dominant cluster_primary among members
  first_seen_at       TIMESTAMP_TZ,
  last_seen_at        TIMESTAMP_TZ,
  created_at          TIMESTAMP_TZ   DEFAULT CURRENT_TIMESTAMP(),
  updated_at          TIMESTAMP_TZ   DEFAULT CURRENT_TIMESTAMP(),
  PRIMARY KEY (cluster_id)
);

CREATE TABLE IF NOT EXISTS MART.ARTICLE_SEMANTIC_CLUSTER (
  guid                VARCHAR        NOT NULL,
  semantic_cluster_id VARCHAR        NOT NULL,
  keyword_cluster     VARCHAR,
  similarity_to_seed  FLOAT,
  is_seed             BOOLEAN        DEFAULT FALSE,
  assigned_at         TIMESTAMP_TZ   DEFAULT CURRENT_TIMESTAMP(),
  PRIMARY KEY (guid)
);


-- ── Step 1: Candidates ─────────────────────────────────────────

CREATE OR REPLACE TEMPORARY TABLE tmp_cands AS
SELECT
  ae.guid,
  LEFT(ae.title, 120)          AS title_short,
  ae.cluster_primary           AS keyword_cluster,
  ae.priority_score,
  ae.sentiment_score,
  ae.sentiment_label,
  ae.published_at,
  ae.embedding
FROM MART.ARTICLE_EMBEDDINGS ae
WHERE ae.published_at >= DATEADD('hour', -48, CURRENT_TIMESTAMP())
  AND ae.embedding IS NOT NULL
QUALIFY ROW_NUMBER() OVER (ORDER BY ae.priority_score DESC NULLS LAST) <= 400;


-- ── Step 2: Seeds ─────────────────────────────────────────────
-- An article is dominated if a higher-priority article exists
-- with cosine similarity >= 0.76 (very close topic match).
-- Seeds are all articles that are NOT dominated.

CREATE OR REPLACE TEMPORARY TABLE tmp_dominated AS
SELECT DISTINCT b.guid AS dominated_guid
FROM tmp_cands a
JOIN tmp_cands b
  ON a.guid <> b.guid
 AND a.priority_score > b.priority_score
 AND VECTOR_COSINE_SIMILARITY(a.embedding, b.embedding) >= 0.76;

CREATE OR REPLACE TEMPORARY TABLE tmp_seeds AS
SELECT
  c.guid,
  c.title_short,
  c.keyword_cluster,
  c.priority_score,
  c.sentiment_score,
  c.published_at,
  c.embedding,
  MD5(c.guid)   AS cluster_id
FROM tmp_cands c
LEFT JOIN tmp_dominated d ON d.dominated_guid = c.guid
WHERE d.dominated_guid IS NULL;


-- ── Step 3: Assign non-seeds ───────────────────────────────────

CREATE OR REPLACE TEMPORARY TABLE tmp_assignments AS
-- Seeds own themselves
SELECT
  s.guid,
  s.cluster_id    AS semantic_cluster_id,
  s.keyword_cluster,
  1.0             AS similarity_to_seed,
  TRUE            AS is_seed
FROM tmp_seeds s

UNION ALL

-- Non-seeds: pick the single closest seed with sim >= 0.72
SELECT
  c.guid,
  s.cluster_id    AS semantic_cluster_id,
  c.keyword_cluster,
  VECTOR_COSINE_SIMILARITY(c.embedding, s.embedding) AS similarity_to_seed,
  FALSE           AS is_seed
FROM tmp_cands c
JOIN tmp_seeds s
  ON VECTOR_COSINE_SIMILARITY(c.embedding, s.embedding) >= 0.72
WHERE c.guid IN (SELECT dominated_guid FROM tmp_dominated)
QUALIFY ROW_NUMBER() OVER (
  PARTITION BY c.guid
  ORDER BY VECTOR_COSINE_SIMILARITY(c.embedding, s.embedding) DESC
) = 1;


-- ── Step 4: Cluster metadata ───────────────────────────────────

CREATE OR REPLACE TEMPORARY TABLE tmp_meta AS
SELECT
  ta.semantic_cluster_id                              AS cluster_id,
  s.title_short                                       AS cluster_label,
  s.guid                                              AS seed_guid,
  s.embedding                                         AS centroid_embedding,
  COUNT(DISTINCT ta.guid)                             AS article_count,
  ROUND(AVG(ta.similarity_to_seed), 4)                AS avg_similarity,
  ROUND(AVG(c.sentiment_score), 4)                    AS sentiment_avg,
  CASE
    WHEN AVG(c.sentiment_score) >  0.15 THEN 'positive'
    WHEN AVG(c.sentiment_score) < -0.15 THEN 'negative'
    ELSE 'neutral'
  END                                                 AS sentiment_label,
  MODE(c.keyword_cluster)                             AS keyword_cluster,
  MIN(c.published_at)                                 AS first_seen_at,
  MAX(c.published_at)                                 AS last_seen_at
FROM tmp_assignments ta
JOIN tmp_cands c
  ON c.guid = ta.guid
JOIN tmp_seeds s
  ON s.cluster_id = ta.semantic_cluster_id
GROUP BY
  ta.semantic_cluster_id,
  s.title_short,
  s.guid,
  s.embedding;


-- ── Step 5: Upsert SEMANTIC_CLUSTERS ──────────────────────────

MERGE INTO MART.SEMANTIC_CLUSTERS tgt
USING tmp_meta src
ON tgt.cluster_id = src.cluster_id
WHEN MATCHED THEN UPDATE SET
  article_count      = src.article_count,
  avg_similarity     = src.avg_similarity,
  centroid_embedding = src.centroid_embedding,
  sentiment_avg      = src.sentiment_avg,
  sentiment_label    = src.sentiment_label,
  keyword_cluster    = src.keyword_cluster,
  last_seen_at       = src.last_seen_at,
  updated_at         = CURRENT_TIMESTAMP()
WHEN NOT MATCHED THEN INSERT (
  cluster_id, cluster_label, seed_guid,
  article_count, avg_similarity, centroid_embedding,
  sentiment_avg, sentiment_label, keyword_cluster,
  first_seen_at, last_seen_at
) VALUES (
  src.cluster_id, src.cluster_label, src.seed_guid,
  src.article_count, src.avg_similarity, src.centroid_embedding,
  src.sentiment_avg, src.sentiment_label, src.keyword_cluster,
  src.first_seen_at, src.last_seen_at
);


-- ── Step 6: Upsert ARTICLE_SEMANTIC_CLUSTER ───────────────────

MERGE INTO MART.ARTICLE_SEMANTIC_CLUSTER tgt
USING (
  SELECT ta.*
  FROM tmp_assignments ta
  WHERE ta.semantic_cluster_id IN (
    SELECT cluster_id FROM tmp_meta WHERE article_count >= 2
  )
) src
ON tgt.guid = src.guid
WHEN MATCHED THEN UPDATE SET
  semantic_cluster_id = src.semantic_cluster_id,
  similarity_to_seed  = src.similarity_to_seed,
  assigned_at         = CURRENT_TIMESTAMP()
WHEN NOT MATCHED THEN INSERT (
  guid, semantic_cluster_id, keyword_cluster, similarity_to_seed, is_seed
) VALUES (
  src.guid, src.semantic_cluster_id, src.keyword_cluster,
  src.similarity_to_seed, src.is_seed
);


-- ── Step 7: Enrich CLUSTER_SUMMARIES ──────────────────────────
-- Bump article_count on keyword clusters where semantic evidence
-- confirms the cluster is real and the count is higher.

UPDATE MART.CLUSTER_SUMMARIES cs
SET article_count = GREATEST(cs.article_count, sem.semantic_count)
FROM (
  SELECT
    keyword_cluster,
    SUM(article_count) AS semantic_count
  FROM MART.SEMANTIC_CLUSTERS
  WHERE keyword_cluster IS NOT NULL
    AND last_seen_at >= DATEADD('hour', -48, CURRENT_TIMESTAMP())
  GROUP BY keyword_cluster
) sem
WHERE cs.cluster_name = sem.keyword_cluster;


-- ── Step 8: Cleanup ───────────────────────────────────────────

DELETE FROM MART.ARTICLE_SEMANTIC_CLUSTER
WHERE assigned_at < DATEADD('hour', -48, CURRENT_TIMESTAMP());

DELETE FROM MART.SEMANTIC_CLUSTERS
WHERE last_seen_at < DATEADD('hour', -48, CURRENT_TIMESTAMP());


-- ── Verification ──────────────────────────────────────────────

SELECT
  sc.cluster_id,
  LEFT(sc.cluster_label, 65)   AS label,
  sc.article_count,
  ROUND(sc.avg_similarity, 3)  AS avg_sim,
  sc.sentiment_label,
  sc.keyword_cluster
FROM MART.SEMANTIC_CLUSTERS sc
ORDER BY sc.article_count DESC
LIMIT 20;

-- ============================================================
-- INTEGRATION — paste into .github/workflows/ingest.yml
-- immediately after the "Run Phase 1 intelligence SQL" step:
--
--   - name: Run semantic clustering
--     env:
--       SNOWFLAKE_ACCOUNT:   ${{ secrets.SNOWFLAKE_ACCOUNT }}
--       SNOWFLAKE_USER:      ${{ secrets.SNOWFLAKE_USER }}
--       SNOWFLAKE_PASSWORD:  ${{ secrets.SNOWFLAKE_PASSWORD }}
--     run: |
--       python3 - <<'EOF'
--       import snowflake.connector, os
--       conn = snowflake.connector.connect(
--           account=os.environ['SNOWFLAKE_ACCOUNT'],
--           user=os.environ['SNOWFLAKE_USER'],
--           password=os.environ['SNOWFLAKE_PASSWORD'],
--           warehouse='F1_APP_WH', database='F1_BULLETIN', schema='MART',
--       )
--       sql = open('sql/semantic_clustering.sql').read()
--       for stmt in [s.strip() for s in sql.split(';') if s.strip()
--                    and not s.strip().startswith('--')]:
--           conn.cursor().execute(stmt)
--       conn.close()
--       print('Semantic clustering done')
--       EOF
-- ============================================================