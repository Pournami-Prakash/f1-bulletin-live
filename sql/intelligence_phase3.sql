-- ============================================================
-- F1 BULLETIN — PHASE 3 INTELLIGENCE
-- sql/intelligence_phase3.sql
--
-- STAGE 7: Weekend Detection + Session Chatter
--   → Is race week active?
--   → Filter articles for session-specific content
--   → Output: MART.SESSION_CHATTER
--
-- STAGE 8: Regulatory Risk Score (per race weekend)
--   → Combines: active investigations + penalty history +
--               FIA notice frequency + controversy trend
--   → Output: MART.REGULATORY_RISK_SCORE
--
-- STAGE 9: Pre-Race Intelligence Snapshot (LLM)
--   → One generated snapshot per race weekend
--   → Only runs when race is within 5 days
--   → Only regenerates if significant new controversy emerges
--   → Output: MART.PRE_RACE_INTELLIGENCE
--
-- Run order: after intelligence_phase2_completion.sql
-- Cost: ~0.05–0.10 credits on race weekends only (5 days/race)
-- ============================================================

USE DATABASE F1_BULLETIN;
USE SCHEMA MART;
USE WAREHOUSE COMPUTE_WH;


-- ============================================================
-- STAGE 7A: DETERMINE WEEKEND STATE
-- Single-row table, refreshed every pipeline run
-- ============================================================

CREATE TABLE IF NOT EXISTS MART.WEEKEND_STATE (
  id                    NUMBER DEFAULT 1 PRIMARY KEY,
  is_race_week          BOOLEAN DEFAULT FALSE,
  days_until_race       NUMBER,
  next_race_round       NUMBER,
  next_race_name        VARCHAR,
  next_race_circuit     VARCHAR,
  next_race_city        VARCHAR,
  next_race_country     VARCHAR,
  next_race_flag        CHAR(4),
  next_race_date        DATE,
  next_race_start_utc   TIMESTAMP_TZ,
  is_sprint_weekend     BOOLEAN DEFAULT FALSE,
  circuit_length_km     FLOAT,
  race_laps             NUMBER,
  lap_record            VARCHAR,
  lap_record_holder     VARCHAR,
  drs_zones             NUMBER,
  -- Session flags for current weekend
  fp1_today             BOOLEAN DEFAULT FALSE,
  fp2_today             BOOLEAN DEFAULT FALSE,
  fp3_today             BOOLEAN DEFAULT FALSE,
  quali_today           BOOLEAN DEFAULT FALSE,
  sprint_today          BOOLEAN DEFAULT FALSE,
  race_today            BOOLEAN DEFAULT FALSE,
  current_session       VARCHAR,   -- 'FP1'|'FP2'|'FP3'|'QUALIFYING'|'SPRINT'|'RACE'|NULL
  updated_at            TIMESTAMP_TZ DEFAULT CURRENT_TIMESTAMP()
);

-- Refresh weekend state every pipeline run
MERGE INTO MART.WEEKEND_STATE tgt
USING (
  SELECT
    1                                                             AS id,
    DATEDIFF('day', CURRENT_DATE(), rc.race_date) <= 5           AS is_race_week,
    DATEDIFF('day', CURRENT_DATE(), rc.race_date)                AS days_until_race,
    rc.round                                                      AS next_race_round,
    rc.race_name                                                  AS next_race_name,
    rc.circuit_name                                               AS next_race_circuit,
    rc.city                                                       AS next_race_city,
    rc.country                                                    AS next_race_country,
    rc.flag_emoji                                                 AS next_race_flag,
    rc.race_date                                                  AS next_race_date,
    rc.race_start_utc                                             AS next_race_start_utc,
    rc.is_sprint_weekend,
    rc.circuit_length_km,
    rc.race_laps,
    rc.lap_record,
    rc.lap_record_holder,
    rc.drs_zones,
    CURRENT_DATE() = rc.fp1_date                                  AS fp1_today,
    CURRENT_DATE() = rc.fp2_date                                  AS fp2_today,
    CURRENT_DATE() = rc.fp3_date                                  AS fp3_today,
    CURRENT_DATE() = rc.quali_date                                AS quali_today,
    CURRENT_DATE() = rc.sprint_date                               AS sprint_today,
    CURRENT_DATE() = rc.race_date                                 AS race_today,
    CASE
      WHEN CURRENT_DATE() = rc.race_date                         THEN 'RACE'
      WHEN CURRENT_DATE() = rc.sprint_date
        AND rc.sprint_date != rc.quali_date                      THEN 'SPRINT'
      WHEN CURRENT_DATE() = rc.quali_date
        AND rc.sprint_date = rc.quali_date                       THEN 'SPRINT / QUALIFYING'
      WHEN CURRENT_DATE() = rc.quali_date                        THEN 'QUALIFYING'
      WHEN CURRENT_DATE() = rc.fp3_date                          THEN 'FP3'
      WHEN CURRENT_DATE() = rc.sprint_quali_date                 THEN 'SPRINT QUALIFYING'
      WHEN CURRENT_DATE() = rc.fp1_date                          THEN 'FP1'
      WHEN DATEDIFF('day', CURRENT_DATE(), rc.race_date) <= 5    THEN 'RACE_WEEK'
      ELSE NULL
    END                                                           AS current_session,
    CURRENT_TIMESTAMP()                                           AS updated_at
  FROM MART.RACE_CALENDAR rc
  WHERE rc.season = 2026
    AND rc.race_date >= CURRENT_DATE()
    AND rc.is_completed = FALSE
  ORDER BY rc.race_date ASC
  LIMIT 1
) src
ON tgt.id = src.id
WHEN MATCHED THEN UPDATE SET
  is_race_week        = src.is_race_week,
  days_until_race     = src.days_until_race,
  next_race_round     = src.next_race_round,
  next_race_name      = src.next_race_name,
  next_race_circuit   = src.next_race_circuit,
  next_race_city      = src.next_race_city,
  next_race_country   = src.next_race_country,
  next_race_flag      = src.next_race_flag,
  next_race_date      = src.next_race_date,
  next_race_start_utc = src.next_race_start_utc,
  is_sprint_weekend   = src.is_sprint_weekend,
  circuit_length_km   = src.circuit_length_km,
  race_laps           = src.race_laps,
  lap_record          = src.lap_record,
  lap_record_holder   = src.lap_record_holder,
  drs_zones           = src.drs_zones,
  fp1_today           = src.fp1_today,
  fp2_today           = src.fp2_today,
  fp3_today           = src.fp3_today,
  quali_today         = src.quali_today,
  sprint_today        = src.sprint_today,
  race_today          = src.race_today,
  current_session     = src.current_session,
  updated_at          = src.updated_at
WHEN NOT MATCHED THEN INSERT (
  id, is_race_week, days_until_race,
  next_race_round, next_race_name, next_race_circuit,
  next_race_city, next_race_country, next_race_flag,
  next_race_date, next_race_start_utc, is_sprint_weekend,
  circuit_length_km, race_laps, lap_record, lap_record_holder, drs_zones,
  fp1_today, fp2_today, fp3_today, quali_today,
  sprint_today, race_today, current_session, updated_at
) VALUES (
  src.id, src.is_race_week, src.days_until_race,
  src.next_race_round, src.next_race_name, src.next_race_circuit,
  src.next_race_city, src.next_race_country, src.next_race_flag,
  src.next_race_date, src.next_race_start_utc, src.is_sprint_weekend,
  src.circuit_length_km, src.race_laps, src.lap_record, src.lap_record_holder,
  src.drs_zones, src.fp1_today, src.fp2_today, src.fp3_today,
  src.quali_today, src.sprint_today, src.race_today,
  src.current_session, src.updated_at
);


-- ============================================================
-- STAGE 7B: SESSION CHATTER
-- Filter articles relevant to the current race weekend
-- Only populated during race week (days_until_race <= 5)
-- ============================================================

CREATE TABLE IF NOT EXISTS MART.SESSION_CHATTER (
  guid              VARCHAR NOT NULL,
  title             VARCHAR,
  summary           VARCHAR,
  source_type       VARCHAR,
  cluster_primary   VARCHAR,
  sentiment_score   FLOAT,
  sentiment_label   VARCHAR,
  priority_score    NUMBER,
  published_at      TIMESTAMP_TZ,

  -- Weekend context
  race_round        NUMBER,
  race_name         VARCHAR,
  circuit_name      VARCHAR,
  session_relevance VARCHAR,   -- 'FP1'|'FP2'|'FP3'|'QUALIFYING'|'SPRINT'|'RACE'|'GENERAL'
  relevance_score   FLOAT,     -- 0–1, how relevant to this weekend

  -- Engagement signal (reddit upvotes/comments if available)
  engagement_score  NUMBER DEFAULT 0,

  created_at        TIMESTAMP_TZ DEFAULT CURRENT_TIMESTAMP(),
  PRIMARY KEY (guid, race_round)
);

-- Only run during race week
INSERT INTO MART.SESSION_CHATTER (
  guid, title, summary, source_type, cluster_primary,
  sentiment_score, sentiment_label, priority_score, published_at,
  race_round, race_name, circuit_name,
  session_relevance, relevance_score
)
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
  ws.next_race_round,
  ws.next_race_name,
  ws.next_race_circuit,

  -- Determine session relevance from title/content
  CASE
    WHEN UPPER(ae.title) LIKE '%RACE RESULT%'
      OR UPPER(ae.title) LIKE '%WINS %'        THEN 'RACE'
    WHEN UPPER(ae.title) LIKE '%QUALIFYING%'
      OR UPPER(ae.title) LIKE '% QUALI%'
      OR UPPER(ae.title) LIKE '% POLE%'        THEN 'QUALIFYING'
    WHEN UPPER(ae.title) LIKE '%SPRINT%'       THEN 'SPRINT'
    WHEN UPPER(ae.title) LIKE '%FP3%'
      OR UPPER(ae.title) LIKE '%FREE PRACTICE 3%' THEN 'FP3'
    WHEN UPPER(ae.title) LIKE '%FP2%'
      OR UPPER(ae.title) LIKE '%FREE PRACTICE 2%' THEN 'FP2'
    WHEN UPPER(ae.title) LIKE '%FP1%'
      OR UPPER(ae.title) LIKE '%FREE PRACTICE 1%' THEN 'FP1'
    ELSE 'GENERAL'
  END AS session_relevance,

  -- Relevance score: circuit name match + session keywords + recency
  ROUND(
    -- Circuit name match in title/summary
    CASE WHEN UPPER(ae.title || COALESCE(ae.summary, ''))
              LIKE '%' || UPPER(ws.next_race_city) || '%'
          OR UPPER(ae.title || COALESCE(ae.summary, ''))
              LIKE '%' || UPPER(ws.next_race_country) || '%'
         THEN 0.4 ELSE 0.1 END
    +
    -- Session keyword match
    CASE WHEN UPPER(ae.title) LIKE ANY ('%FP1%','%FP2%','%FP3%',
                                        '%QUALIFYING%','%POLE%',
                                        '%SPRINT%','%RACE DAY%',
                                        '%PODIUM%','%FASTEST LAP%')
         THEN 0.35 ELSE 0.0 END
    +
    -- Recency: published in last 24h = full score
    CASE WHEN ae.published_at >= DATEADD('hour', -24, CURRENT_TIMESTAMP())
         THEN 0.25
         WHEN ae.published_at >= DATEADD('hour', -48, CURRENT_TIMESTAMP())
         THEN 0.15
         ELSE 0.05 END
  , 3) AS relevance_score

FROM MART.ARTICLE_EMBEDDINGS ae
CROSS JOIN MART.WEEKEND_STATE ws

WHERE ws.is_race_week = TRUE
  AND ae.published_at >= DATEADD('day', -5, CURRENT_TIMESTAMP())
  AND (
    -- Circuit/city/country mentioned
    UPPER(ae.title || COALESCE(ae.summary, '')) LIKE '%' || UPPER(ws.next_race_city) || '%'
    OR UPPER(ae.title || COALESCE(ae.summary, '')) LIKE '%' || UPPER(ws.next_race_country) || '%'
    -- OR session-specific keywords
    OR UPPER(ae.title) LIKE ANY (
      '%FP1%', '%FP2%', '%FP3%', '%FREE PRACTICE%',
      '%QUALIFYING%', '%POLE POSITION%', '%POLE LAP%',
      '%SPRINT RACE%', '%GRID PENALTY%',
      '%RACE RESULT%', '%PODIUM%', '%FASTEST LAP%',
      '%PARC FERME%', '%FORMATION LAP%', '%SAFETY CAR%',
      '%VIRTUAL SAFETY CAR%', '%RED FLAG%', '%CHEQUERED%'
    )
    -- OR high-priority articles during race week
    OR ae.priority_score >= 80
  )
  AND NOT EXISTS (
    SELECT 1 FROM MART.SESSION_CHATTER sc
    WHERE sc.guid = ae.guid
      AND sc.race_round = ws.next_race_round
  );


-- ============================================================
-- STAGE 8: REGULATORY RISK SCORE
-- Per driver + team for the upcoming race weekend
-- Only meaningful if race within 14 days
-- ============================================================

CREATE TABLE IF NOT EXISTS MART.REGULATORY_RISK_SCORE (
  entity_name         VARCHAR NOT NULL,
  entity_type         VARCHAR NOT NULL,   -- 'driver' | 'team'
  race_round          NUMBER  NOT NULL,
  race_name           VARCHAR,

  -- Component scores (0–100 each)
  investigation_score FLOAT,   -- active investigations this week
  penalty_score       FLOAT,   -- penalty history last 30 days
  fia_notice_score    FLOAT,   -- FIA notice volume
  controversy_score   FLOAT,   -- from CONTROVERSY_INDEX

  -- Composite risk score (0–100)
  -- Weights: investigation 40% + penalty 30% + FIA 20% + controversy 10%
  risk_score          FLOAT,
  risk_label          VARCHAR, -- CRITICAL | HIGH | MEDIUM | LOW | CLEAR

  -- Context
  active_investigations NUMBER DEFAULT 0,
  recent_penalties      NUMBER DEFAULT 0,
  fia_notices_7d        NUMBER DEFAULT 0,
  watchlist_reason      VARCHAR,   -- human-readable reason for risk

  calculated_at       TIMESTAMP_TZ DEFAULT CURRENT_TIMESTAMP(),

  PRIMARY KEY (entity_name, entity_type, race_round)
);

-- Calculate regulatory risk for upcoming race
MERGE INTO MART.REGULATORY_RISK_SCORE tgt
USING (
  WITH

  -- Active investigations this week (from regulatory tags)
  investigations AS (
    SELECT
      'driver'                              AS entity_type,
      d.driver_name                         AS entity_name,
      COUNT(DISTINCT rt.guid)               AS investigation_count
    FROM MART.REGULATORY_TAGS rt
    JOIN MART.ARTICLE_EMBEDDINGS ae ON ae.guid = rt.guid
    JOIN (
      SELECT column1 AS driver_name FROM VALUES
        ('VERSTAPPEN'),('HAMILTON'),('NORRIS'),('PIASTRI'),
        ('LECLERC'),('RUSSELL'),('SAINZ'),('ALONSO'),
        ('PEREZ'),('STROLL'),('ALBON'),('HULKENBERG'),
        ('GASLY'),('OCON'),('BOTTAS'),('ZHOU'),
        ('MAGNUSSEN'),('BEARMAN'),('TSUNODA'),('LAWSON')
    ) d ON UPPER(ae.title) LIKE '%' || d.driver_name || '%'
    WHERE rt.regulatory_tag = 'INVESTIGATION'
      AND rt.tagged_at >= DATEADD('day', -7, CURRENT_TIMESTAMP())
    GROUP BY 1, 2

    UNION ALL

    SELECT
      'team'                                AS entity_type,
      t.team_name                           AS entity_name,
      COUNT(DISTINCT rt.guid)               AS investigation_count
    FROM MART.REGULATORY_TAGS rt
    JOIN MART.ARTICLE_EMBEDDINGS ae ON ae.guid = rt.guid
    JOIN (
      SELECT column1 AS team_name FROM VALUES
        ('RED BULL'),('FERRARI'),('MERCEDES'),('MCLAREN'),
        ('ASTON MARTIN'),('ALPINE'),('WILLIAMS'),('HAAS'),
        ('SAUBER'),('RACING BULLS')
    ) t ON UPPER(ae.title) LIKE '%' || t.team_name || '%'
    WHERE rt.regulatory_tag = 'INVESTIGATION'
      AND rt.tagged_at >= DATEADD('day', -7, CURRENT_TIMESTAMP())
    GROUP BY 1, 2
  ),

  -- Recent penalties last 30 days
  penalties AS (
    SELECT
      'driver'                              AS entity_type,
      d.driver_name                         AS entity_name,
      COUNT(DISTINCT rt.guid)               AS penalty_count
    FROM MART.REGULATORY_TAGS rt
    JOIN MART.ARTICLE_EMBEDDINGS ae ON ae.guid = rt.guid
    JOIN (
      SELECT column1 AS driver_name FROM VALUES
        ('VERSTAPPEN'),('HAMILTON'),('NORRIS'),('PIASTRI'),
        ('LECLERC'),('RUSSELL'),('SAINZ'),('ALONSO'),
        ('PEREZ'),('STROLL'),('ALBON'),('HULKENBERG'),
        ('GASLY'),('OCON'),('BOTTAS'),('ZHOU'),
        ('MAGNUSSEN'),('BEARMAN'),('TSUNODA'),('LAWSON')
    ) d ON UPPER(ae.title) LIKE '%' || d.driver_name || '%'
    WHERE rt.regulatory_tag = 'PENALTY'
      AND rt.tagged_at >= DATEADD('day', -60, CURRENT_TIMESTAMP())
    GROUP BY 1, 2
  ),

  -- FIA notices mentioning entity in last 7 days
  fia_activity AS (
    SELECT
      'driver'                              AS entity_type,
      d.driver_name                         AS entity_name,
      COUNT(DISTINCT ae.guid)               AS fia_count
    FROM MART.ARTICLE_EMBEDDINGS ae
    JOIN (
      SELECT column1 AS driver_name FROM VALUES
        ('VERSTAPPEN'),('HAMILTON'),('NORRIS'),('PIASTRI'),
        ('LECLERC'),('RUSSELL'),('SAINZ'),('ALONSO'),
        ('PEREZ'),('STROLL'),('ALBON'),('HULKENBERG'),
        ('GASLY'),('OCON'),('BOTTAS'),('ZHOU'),
        ('MAGNUSSEN'),('BEARMAN'),('TSUNODA'),('LAWSON')
    ) d ON UPPER(ae.title) LIKE '%' || d.driver_name || '%'
    WHERE ae.source_type = 'official'
      AND ae.published_at >= DATEADD('day', -7, CURRENT_TIMESTAMP())
    GROUP BY 1, 2
  ),

  -- Current controversy scores
  controversy AS (
    SELECT entity_name, entity_type, controversy_score
    FROM MART.CONTROVERSY_INDEX
    WHERE index_date = CURRENT_DATE()
  ),

  -- Combine all signals
  combined AS (
    SELECT
      COALESCE(inv.entity_name, pen.entity_name,
               fia.entity_name, con.entity_name) AS entity_name,
      COALESCE(inv.entity_type, pen.entity_type,
               fia.entity_type, con.entity_type) AS entity_type,
      COALESCE(inv.investigation_count, 0)         AS active_investigations,
      COALESCE(pen.penalty_count, 0)               AS recent_penalties,
      COALESCE(fia.fia_count, 0)                   AS fia_notices_7d,
      COALESCE(con.controversy_score, 0)           AS controversy_score_raw
    FROM investigations inv
    FULL OUTER JOIN penalties pen
      ON pen.entity_name = inv.entity_name AND pen.entity_type = inv.entity_type
    FULL OUTER JOIN fia_activity fia
      ON fia.entity_name = COALESCE(inv.entity_name, pen.entity_name)
      AND fia.entity_type = COALESCE(inv.entity_type, pen.entity_type)
    FULL OUTER JOIN controversy con
      ON con.entity_name = COALESCE(inv.entity_name, pen.entity_name, fia.entity_name)
      AND con.entity_type = COALESCE(inv.entity_type, pen.entity_type, fia.entity_type)
    WHERE COALESCE(inv.investigation_count, 0) +
          COALESCE(pen.penalty_count, 0) +
          COALESCE(fia.fia_count, 0) +
          COALESCE(con.controversy_score, 0) > 0
  )

  SELECT
    c.entity_name,
    c.entity_type,
    ws.next_race_round                              AS race_round,
    ws.next_race_name                               AS race_name,

    -- Component scores normalised 0–100
    LEAST(100, c.active_investigations * 40.0)      AS investigation_score,
    LEAST(100, c.recent_penalties      * 25.0)      AS penalty_score,
    LEAST(100, c.fia_notices_7d        * 20.0)      AS fia_notice_score,
    c.controversy_score_raw                         AS controversy_score,

    -- Composite risk
    ROUND(
      (LEAST(100, c.active_investigations * 40.0) * 0.40) +
      (LEAST(100, c.recent_penalties      * 25.0) * 0.30) +
      (LEAST(100, c.fia_notices_7d        * 20.0) * 0.20) +
      (c.controversy_score_raw                    * 0.10)
    , 2)                                            AS risk_score,

    c.active_investigations,
    c.recent_penalties,
    c.fia_notices_7d,

    -- Human-readable watchlist reason
    CASE
      WHEN c.active_investigations > 0
        THEN 'Active investigation — ' || c.active_investigations || ' article(s) this week'
      WHEN c.recent_penalties > 1
        THEN c.recent_penalties || ' penalties in last 30 days'
      WHEN c.fia_notices_7d > 2
        THEN c.fia_notices_7d || ' FIA notices this week'
      WHEN c.controversy_score_raw >= 50
        THEN 'Elevated controversy score: ' || ROUND(c.controversy_score_raw, 0) || '/100'
      ELSE 'Minor regulatory activity'
    END                                             AS watchlist_reason,

    CURRENT_TIMESTAMP()                             AS calculated_at

  FROM combined c
  CROSS JOIN (SELECT * FROM MART.WEEKEND_STATE WHERE id = 1) ws
  WHERE ws.next_race_round IS NOT NULL
) src
ON  tgt.entity_name  = src.entity_name
AND tgt.entity_type  = src.entity_type
AND tgt.race_round   = src.race_round
WHEN MATCHED THEN UPDATE SET
  risk_score            = src.risk_score,
  investigation_score   = src.investigation_score,
  penalty_score         = src.penalty_score,
  fia_notice_score      = src.fia_notice_score,
  controversy_score     = src.controversy_score,
  risk_label            = CASE
    WHEN src.risk_score >= 75 THEN 'CRITICAL'
    WHEN src.risk_score >= 50 THEN 'HIGH'
    WHEN src.risk_score >= 25 THEN 'MEDIUM'
    WHEN src.risk_score >  5  THEN 'LOW'
    ELSE 'CLEAR'
  END,
  active_investigations = src.active_investigations,
  recent_penalties      = src.recent_penalties,
  fia_notices_7d        = src.fia_notices_7d,
  watchlist_reason      = src.watchlist_reason,
  calculated_at         = src.calculated_at
WHEN NOT MATCHED THEN INSERT (
  entity_name, entity_type, race_round, race_name,
  investigation_score, penalty_score, fia_notice_score, controversy_score,
  risk_score, risk_label,
  active_investigations, recent_penalties, fia_notices_7d,
  watchlist_reason, calculated_at
) VALUES (
  src.entity_name, src.entity_type, src.race_round, src.race_name,
  src.investigation_score, src.penalty_score, src.fia_notice_score, src.controversy_score,
  src.risk_score,
  CASE
    WHEN src.risk_score >= 75 THEN 'CRITICAL'
    WHEN src.risk_score >= 50 THEN 'HIGH'
    WHEN src.risk_score >= 25 THEN 'MEDIUM'
    WHEN src.risk_score >  5  THEN 'LOW'
    ELSE 'CLEAR'
  END,
  src.active_investigations, src.recent_penalties, src.fia_notices_7d,
  src.watchlist_reason, src.calculated_at
);


-- ============================================================
-- STAGE 9: PRE-RACE INTELLIGENCE SNAPSHOT (LLM)
-- Generated once per race weekend, only when race within 5 days
-- Regenerates if a CRITICAL controversy emerges after last gen
-- ============================================================

CREATE TABLE IF NOT EXISTS MART.PRE_RACE_INTELLIGENCE (
  race_round            NUMBER        NOT NULL,
  race_name             VARCHAR,
  race_date             DATE,

  -- Generated briefing sections
  weekend_overview      VARCHAR,   -- what to expect this weekend
  regulatory_watchlist  VARCHAR,   -- who's at risk, why
  form_guide            VARCHAR,   -- who's hot/cold from 72h data
  controversy_radar     VARCHAR,   -- active storylines entering weekend
  key_battles           VARCHAR,   -- predicted on-track narratives
  session_preview       VARCHAR,   -- what each session means for standings

  -- Data context used for generation
  top_risk_entity       VARCHAR,
  top_risk_score        FLOAT,
  top_momentum_cluster  VARCHAR,
  top_sentiment_driver  VARCHAR,
  active_controversies  NUMBER,
  total_weekend_signals NUMBER,

  -- Meta
  generated_at          TIMESTAMP_TZ DEFAULT CURRENT_TIMESTAMP(),
  model_used            VARCHAR DEFAULT 'llama3-8b',
  -- Track if regeneration triggered by new controversy
  regen_triggered       BOOLEAN DEFAULT FALSE,
  regen_reason          VARCHAR,

  PRIMARY KEY (race_round)
);


-- Build context for pre-race snapshot
CREATE OR REPLACE TEMPORARY TABLE tmp_prerace_context AS
WITH

ws AS (SELECT * FROM MART.WEEKEND_STATE WHERE id = 1),

-- Top regulatory risk entities
risk_context AS (
  SELECT
    LISTAGG(
      entity_name || ' (' || entity_type || ') — ' || risk_label ||
      ' risk: ' || watchlist_reason, ' | '
    ) WITHIN GROUP (ORDER BY risk_score DESC)  AS risk_summary,
    MAX(entity_name)                           AS top_entity,
    MAX(risk_score)                            AS top_score
  FROM (
    SELECT entity_name, entity_type, risk_label, watchlist_reason, risk_score
    FROM MART.REGULATORY_RISK_SCORE rrs
    JOIN ws ON rrs.race_round = ws.next_race_round
    WHERE risk_label IN ('CRITICAL','HIGH','MEDIUM')
    QUALIFY ROW_NUMBER() OVER (ORDER BY risk_score DESC) <= 5
  )
),

-- Driver form from 72h sentiment
form_context AS (
  SELECT
    LISTAGG(
      driver_name || ': ' || sentiment_label ||
      ' (' || ROUND(sentiment_avg, 2) || ', ×' || mention_count || ' mentions)', ' | '
    ) WITHIN GROUP (ORDER BY mention_count DESC)  AS form_summary,
    MAX(driver_name)                              AS top_driver
  FROM (
    SELECT driver_name, sentiment_label, sentiment_avg, mention_count
    FROM MART.DRIVER_SENTIMENT_DAILY
    WHERE signal_date >= CURRENT_DATE() - 3
    QUALIFY ROW_NUMBER() OVER (ORDER BY mention_count DESC) <= 6
  )
),

-- Active controversies
controversy_context AS (
  SELECT
    COUNT(*)                                                          AS active_count,
    LISTAGG(
      entity_name || ' (' || controversy_label || ', ' ||
      ROUND(controversy_score,0) || '/100, ' || trending_direction || ')', ' | '
    ) WITHIN GROUP (ORDER BY controversy_score DESC)  AS controversy_summary
  FROM (
    SELECT entity_name, controversy_label, controversy_score, trending_direction
    FROM MART.CONTROVERSY_INDEX
    WHERE index_date = CURRENT_DATE()
      AND controversy_label IN ('HIGH','MEDIUM')
    QUALIFY ROW_NUMBER() OVER (ORDER BY controversy_score DESC) <= 5
  )
),

-- Top session chatter headlines
chatter_context AS (
  SELECT
    COUNT(*)                                                  AS signal_count,
    LISTAGG('- ' || title, '\n') WITHIN GROUP (
      ORDER BY relevance_score DESC, priority_score DESC
    )                                                         AS top_headlines
  FROM (
    SELECT sc.title, sc.relevance_score, sc.priority_score
    FROM MART.SESSION_CHATTER sc
    JOIN ws ON sc.race_round = ws.next_race_round
    QUALIFY ROW_NUMBER() OVER (ORDER BY relevance_score DESC, priority_score DESC) <= 10
  )
),

-- Top momentum cluster
momentum_context AS (
  SELECT cluster_name, velocity_label, momentum_score
  FROM MART.CLUSTER_MOMENTUM_72H
  ORDER BY momentum_score DESC NULLS LAST
  LIMIT 1
)

SELECT
  ws.next_race_round,
  ws.next_race_name,
  ws.next_race_date,
  ws.next_race_circuit,
  ws.next_race_city,
  ws.next_race_country,
  ws.days_until_race,
  ws.is_sprint_weekend,
  ws.circuit_length_km,
  ws.race_laps,
  ws.lap_record,
  ws.lap_record_holder,
  ws.drs_zones,
  ws.current_session,
  rc.risk_summary,
  rc.top_entity         AS top_risk_entity,
  rc.top_score          AS top_risk_score,
  fc.form_summary,
  fc.top_driver         AS top_sentiment_driver,
  cc.active_count       AS active_controversies,
  cc.controversy_summary,
  chc.signal_count      AS total_weekend_signals,
  chc.top_headlines,
  mc.cluster_name       AS top_momentum_cluster
FROM ws
LEFT JOIN risk_context rc        ON TRUE
LEFT JOIN form_context fc        ON TRUE
LEFT JOIN controversy_context cc ON TRUE
LEFT JOIN chatter_context chc    ON TRUE
LEFT JOIN momentum_context mc    ON TRUE;


-- Only generate snapshot if:
-- 1. Race is within 5 days
-- 2. No snapshot exists for this round, OR a new CRITICAL controversy emerged
INSERT INTO MART.PRE_RACE_INTELLIGENCE (
  race_round, race_name, race_date,
  weekend_overview, regulatory_watchlist, form_guide,
  controversy_radar, key_battles, session_preview,
  top_risk_entity, top_risk_score, top_momentum_cluster,
  top_sentiment_driver, active_controversies, total_weekend_signals,
  generated_at, model_used, regen_triggered, regen_reason
)
SELECT
  ctx.next_race_round,
  ctx.next_race_name,
  ctx.next_race_date,

  -- Section 1: Weekend Overview (3–4 sentences)
  TRIM(SNOWFLAKE.CORTEX.COMPLETE(
    'llama3-8b',
    'You are an F1 analyst. Write a 3-sentence preview of the upcoming ' ||
    ctx.next_race_name || ' at ' || ctx.next_race_circuit || ', ' ||
    ctx.next_race_city || '. Race is in ' || ctx.days_until_race || ' days. ' ||
    CASE WHEN ctx.is_sprint_weekend THEN 'This is a sprint weekend. ' ELSE '' END ||
    'Circuit: ' || ctx.circuit_length_km || 'km, ' || ctx.race_laps || ' laps, ' ||
    ctx.drs_zones || ' DRS zones. Lap record: ' || ctx.lap_record ||
    ' by ' || ctx.lap_record_holder || '. ' ||
    'Top news headlines: ' || CHR(10) || COALESCE(ctx.top_headlines, 'No headlines yet.')
  )),

  -- Section 2: Regulatory Watchlist (2 sentences)
  TRIM(SNOWFLAKE.CORTEX.COMPLETE(
    'llama3-8b',
    'In 2 sentences, describe the regulatory risk situation heading into the ' ||
    ctx.next_race_name || '. Who is at risk and why? ' ||
    'Risk entities: ' || COALESCE(ctx.risk_summary, 'No significant risks identified.') ||
    ' Be specific about penalties, investigations, or FIA activity.'
  )),

  -- Section 3: Form Guide (2–3 sentences)
  TRIM(SNOWFLAKE.CORTEX.COMPLETE(
    'llama3-8b',
    'In 2-3 sentences, describe driver form going into the ' ||
    ctx.next_race_name || '. Who is trending up, who is struggling? ' ||
    'Based on 72h sentiment data: ' || COALESCE(ctx.form_summary, 'No sentiment data.') ||
    ' Focus on ' || COALESCE(ctx.top_sentiment_driver, 'the top drivers') || '.'
  )),

  -- Section 4: Controversy Radar (2 sentences)
  TRIM(SNOWFLAKE.CORTEX.COMPLETE(
    'llama3-8b',
    'In 2 sentences, describe the active controversies entering the ' ||
    ctx.next_race_name || '. ' ||
    'Active controversies (' || COALESCE(ctx.active_controversies::VARCHAR, '0') || '): ' ||
    COALESCE(ctx.controversy_summary, 'No major controversies active.') ||
    ' What could escalate this weekend?'
  )),

  -- Section 5: Key Battles (2 sentences)
  TRIM(SNOWFLAKE.CORTEX.COMPLETE(
    'llama3-8b',
    'In 2 sentences, describe 2-3 key on-track battles to watch at the ' ||
    ctx.next_race_name || '. ' ||
    'Top drivers by mentions: ' || COALESCE(ctx.form_summary, 'Not available.') ||
    ' Top story cluster: ' || COALESCE(ctx.top_momentum_cluster, 'GENERAL') ||
    '. Be specific about expected championship or midfield battles.'
  )),

  -- Section 6: Session Preview (1–2 sentences)
  TRIM(SNOWFLAKE.CORTEX.COMPLETE(
    'llama3-8b',
    'In 1-2 sentences, what is the most important session to watch at the ' ||
    ctx.next_race_name || ' and why? ' ||
    CASE WHEN ctx.is_sprint_weekend
         THEN 'This is a sprint weekend — sprint qualifying and sprint race both count. '
         ELSE '' END ||
    CASE WHEN ctx.current_session IS NOT NULL
         THEN 'Current active session: ' || ctx.current_session || '. '
         ELSE '' END ||
    'Days until race: ' || ctx.days_until_race || '.'
  )),

  ctx.top_risk_entity,
  ctx.top_risk_score,
  ctx.top_momentum_cluster,
  ctx.top_sentiment_driver,
  ctx.active_controversies,
  ctx.total_weekend_signals,
  CURRENT_TIMESTAMP(),
  'llama3-8b',
  FALSE,
  NULL

FROM tmp_prerace_context ctx

WHERE ctx.days_until_race <= 5
  AND ctx.days_until_race >= 0
  AND ctx.next_race_round IS NOT NULL
  -- Don't regenerate if snapshot already exists for this round
  -- UNLESS a CRITICAL controversy has emerged since last generation
  AND (
    NOT EXISTS (
      SELECT 1 FROM MART.PRE_RACE_INTELLIGENCE pri
      WHERE pri.race_round = ctx.next_race_round
    )
    OR (
      -- Regenerate: new CRITICAL risk emerged since last snapshot
      EXISTS (
        SELECT 1 FROM MART.REGULATORY_RISK_SCORE rrs
        WHERE rrs.race_round = ctx.next_race_round
          AND rrs.risk_label = 'CRITICAL'
          AND rrs.calculated_at > (
            SELECT generated_at FROM MART.PRE_RACE_INTELLIGENCE
            WHERE race_round = ctx.next_race_round
          )
      )
    )
  );


-- Update regen flag if this was a re-generation
UPDATE MART.PRE_RACE_INTELLIGENCE
SET regen_triggered = TRUE,
    regen_reason = 'New CRITICAL regulatory risk emerged after initial snapshot'
WHERE race_round = (SELECT next_race_round FROM MART.WEEKEND_STATE WHERE id = 1)
  AND generated_at = (
    SELECT MAX(generated_at) FROM MART.PRE_RACE_INTELLIGENCE
    WHERE race_round = (SELECT next_race_round FROM MART.WEEKEND_STATE WHERE id = 1)
  )
  AND EXISTS (
    SELECT 1 FROM MART.PRE_RACE_INTELLIGENCE
    WHERE race_round = (SELECT next_race_round FROM MART.WEEKEND_STATE WHERE id = 1)
    HAVING COUNT(*) > 1
  );


-- ============================================================
-- CLEANUP
-- ============================================================

-- Remove session chatter for completed races older than 30 days
DELETE FROM MART.SESSION_CHATTER
WHERE created_at < DATEADD('day', -60, CURRENT_TIMESTAMP());

-- Remove regulatory risk scores for old races
DELETE FROM MART.REGULATORY_RISK_SCORE
WHERE calculated_at < DATEADD('day', -90, CURRENT_TIMESTAMP());
