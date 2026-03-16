#!/usr/bin/env python3
"""
F1 Bulletin — Intelligence Sync
scripts/intelligence_sync.py

Reads intelligence output from Snowflake MART tables
and writes to Neon Postgres for zero-cost frontend reads.

Runs in GitHub Actions after intelligence_pipeline.sql completes.

Requirements:
  pip install snowflake-connector-python psycopg2-binary python-dotenv
"""

import os
import sys
import json
import time
import logging
from datetime import datetime, timezone
from typing import Optional

import snowflake.connector
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

# ── Logging ──────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s  %(levelname)-8s  %(message)s',
    datefmt='%H:%M:%S'
)
log = logging.getLogger('f1-sync')

# ── Load env (local dev only — GitHub Actions uses secrets) ──
load_dotenv()

# ── Config ────────────────────────────────────────────────────
SF_CONFIG = {
    'account':   os.environ['SNOWFLAKE_ACCOUNT'],
    'user':      os.environ['SNOWFLAKE_USER'],
    'password':  os.environ['SNOWFLAKE_PASSWORD'],
    'warehouse': 'F1_APP_WH',
    'database':  'F1_BULLETIN',
    'schema':    'MART',
    'role':      os.environ.get('SNOWFLAKE_ROLE', 'SYSADMIN'),
}

NEON_URL = os.environ['NEON_DATABASE_URL']

# ── Helpers ───────────────────────────────────────────────────
def get_snowflake():
    log.info('Connecting to Snowflake...')
    conn = snowflake.connector.connect(**SF_CONFIG)
    log.info('Snowflake connected')
    return conn

def get_neon():
    log.info('Connecting to Neon Postgres...')
    conn = psycopg2.connect(NEON_URL)
    conn.autocommit = False
    log.info('Neon connected')
    return conn

def sf_query(sf_conn, sql: str) -> list:
    cur = sf_conn.cursor(snowflake.connector.DictCursor)
    cur.execute(sql)
    rows = cur.fetchall()
    cur.close()
    return rows

def label_from_score(score: Optional[float]) -> str:
    if score is None:
        return 'neutral'
    if score > 0.15:
        return 'positive'
    if score < -0.15:
        return 'negative'
    return 'neutral'


# ── Sync 1: Cluster Summaries ─────────────────────────────────
def sync_cluster_summaries(sf, pg) -> int:
    log.info('Syncing cluster summaries...')

    rows = sf_query(sf, """
        SELECT
            cluster_id,
            cluster_name,
            summary,
            article_count,
            source_breakdown,
            momentum_score,
            sentiment_avg,
            sentiment_label,
            is_spike,
            z_score,
            priority,
            articles_last_hour,
            last_updated,
            summary_generated_at
        FROM MART.CLUSTER_SUMMARIES
        ORDER BY momentum_score DESC NULLS LAST
    """)

    if not rows:
        log.warning('No cluster summaries found in Snowflake')
        return 0

    cur = pg.cursor()

    # Upsert all clusters
    psycopg2.extras.execute_values(cur, """
        INSERT INTO cluster_summaries (
            cluster_id, cluster_name, summary, article_count,
            source_breakdown, momentum_score, sentiment_avg,
            sentiment_label, is_spike, z_score, priority,
            last_updated, summary_generated_at
        )
        VALUES %s
        ON CONFLICT (cluster_id) DO UPDATE SET
            cluster_name         = EXCLUDED.cluster_name,
            summary              = EXCLUDED.summary,
            article_count        = EXCLUDED.article_count,
            source_breakdown     = EXCLUDED.source_breakdown,
            momentum_score       = EXCLUDED.momentum_score,
            sentiment_avg        = EXCLUDED.sentiment_avg,
            sentiment_label      = EXCLUDED.sentiment_label,
            is_spike             = EXCLUDED.is_spike,
            z_score              = EXCLUDED.z_score,
            priority             = EXCLUDED.priority,
            last_updated         = EXCLUDED.last_updated,
            summary_generated_at = EXCLUDED.summary_generated_at
    """, [
        (
            row['CLUSTER_ID'],
            row['CLUSTER_NAME'],
            row['SUMMARY'],
            row['ARTICLE_COUNT'],
            json.dumps(row['SOURCE_BREAKDOWN']) if row['SOURCE_BREAKDOWN'] else '{}',
            row['MOMENTUM_SCORE'],
            row['SENTIMENT_AVG'],
            row['SENTIMENT_LABEL'] or label_from_score(row['SENTIMENT_AVG']),
            bool(row['IS_SPIKE']),
            row['Z_SCORE'],
            row['PRIORITY'] or 'NORMAL',
            row['LAST_UPDATED'],
            row['SUMMARY_GENERATED_AT'],
        )
        for row in rows
    ])

    cur.close()
    log.info(f'  → {len(rows)} clusters synced')
    return len(rows)


# ── Sync 2: Article Intelligence ──────────────────────────────
def sync_article_intelligence(sf, pg) -> int:
    log.info('Syncing article intelligence (last 6h)...')

    rows = sf_query(sf, """
        SELECT
            guid,
            event_id,
            title,
            source_type,
            cluster_primary,
            priority_score,
            sentiment_score,
            sentiment_label,
            published_at,
            processed_at
        FROM MART.ARTICLE_EMBEDDINGS
        WHERE processed_at >= DATEADD('hour', -6, CURRENT_TIMESTAMP())
        ORDER BY published_at DESC
        LIMIT 500
    """)

    if not rows:
        log.info('  → No new articles to sync')
        return 0

    cur = pg.cursor()

    # Note: we skip syncing the embedding vector itself to Neon for now
    # (768-dim vectors are large; add when semantic search is needed on frontend)
    psycopg2.extras.execute_values(cur, """
        INSERT INTO article_intelligence (
            guid, article_id, title, source_type,
            cluster_name, priority_score,
            sentiment_score, sentiment_label,
            published_at, processed_at
        )
        VALUES %s
        ON CONFLICT (guid) DO UPDATE SET
            sentiment_score  = EXCLUDED.sentiment_score,
            sentiment_label  = EXCLUDED.sentiment_label,
            cluster_name     = EXCLUDED.cluster_name,
            processed_at     = EXCLUDED.processed_at
    """, [
        (
            row['GUID'],
            row['EVENT_ID'],
            row['TITLE'],
            row['SOURCE_TYPE'],
            row['CLUSTER_PRIMARY'],
            row['PRIORITY_SCORE'],
            row['SENTIMENT_SCORE'],
            row['SENTIMENT_LABEL'] or label_from_score(row['SENTIMENT_SCORE']),
            row['PUBLISHED_AT'],
            row['PROCESSED_AT'],
        )
        for row in rows
    ])

    cur.close()
    log.info(f'  → {len(rows)} articles synced')
    return len(rows)


# ── Sync 3: Driver Sentiment ──────────────────────────────────
def sync_driver_sentiment(sf, pg) -> int:
    log.info('Syncing driver + team sentiment (last 7 days)...')

    rows = sf_query(sf, """
        SELECT
            driver_name,
            entity_type,
            signal_date,
            sentiment_avg,
            sentiment_delta,
            sentiment_label,
            mention_count,
            positive_count,
            negative_count,
            neutral_count,
            top_cluster
        FROM MART.DRIVER_SENTIMENT_DAILY
        WHERE signal_date >= DATEADD('day', -30, CURRENT_DATE())
        ORDER BY signal_date DESC, entity_type, mention_count DESC
    """)

    if not rows:
        log.warning('No driver/team sentiment data found')
        return 0

    cur = pg.cursor()

    psycopg2.extras.execute_values(cur, """
        INSERT INTO driver_sentiment_daily (
            driver_name, entity_type, date,
            sentiment_avg, sentiment_delta, sentiment_label,
            mention_count, positive_count, negative_count, neutral_count, top_cluster
        )
        VALUES %s
        ON CONFLICT (driver_name, entity_type, date) DO UPDATE SET
            sentiment_avg   = EXCLUDED.sentiment_avg,
            sentiment_delta = EXCLUDED.sentiment_delta,
            sentiment_label = EXCLUDED.sentiment_label,
            mention_count   = EXCLUDED.mention_count,
            positive_count  = EXCLUDED.positive_count,
            negative_count  = EXCLUDED.negative_count,
            neutral_count   = EXCLUDED.neutral_count,
            top_cluster     = EXCLUDED.top_cluster
    """, [
        (
            row['DRIVER_NAME'].title(),
            row['ENTITY_TYPE'],
            row['SIGNAL_DATE'],
            row['SENTIMENT_AVG'],
            row['SENTIMENT_DELTA'],
            row['SENTIMENT_LABEL'] or label_from_score(row['SENTIMENT_AVG']),
            row['MENTION_COUNT'],
            row['POSITIVE_COUNT'] or 0,
            row['NEGATIVE_COUNT'] or 0,
            row['NEUTRAL_COUNT']  or 0,
            row['TOP_CLUSTER'],
        )
        for row in rows
    ])

    drivers = sum(1 for r in rows if r['ENTITY_TYPE'] == 'driver')
    teams   = sum(1 for r in rows if r['ENTITY_TYPE'] == 'team')
    cur.close()
    log.info(f'  → {len(rows)} entity-day rows synced ({drivers} driver, {teams} team)')
    return len(rows)


# ── Sync 4: Spike Alerts ──────────────────────────────────────
def sync_spike_alerts(sf, pg) -> int:
    log.info('Syncing spike alerts (last 24h)...')

    rows = sf_query(sf, """
        SELECT
            cluster_name,
            cluster_id,
            z_score,
            current_count,
            baseline_avg,
            severity,
            detected_at,
            resolved
        FROM MART.SPIKE_ALERTS
        WHERE detected_at >= DATEADD('hour', -24, CURRENT_TIMESTAMP())
        ORDER BY detected_at DESC
    """)

    if not rows:
        log.info('  → No spike alerts to sync')
        return 0

    cur = pg.cursor()

    # Auto-resolve old alerts in Neon that Snowflake has resolved
    resolved_clusters = [
        row['CLUSTER_NAME'] for row in rows if row['RESOLVED']
    ]
    if resolved_clusters:
        cur.execute("""
            UPDATE spike_alerts
            SET resolved = TRUE, resolved_at = NOW()
            WHERE cluster_name = ANY(%s)
              AND resolved = FALSE
              AND triggered_at < NOW() - INTERVAL '3 hours'
        """, (resolved_clusters,))

    # Insert new alerts
    new_alerts = [row for row in rows if not row['RESOLVED']]
    if new_alerts:
        psycopg2.extras.execute_values(cur, """
            INSERT INTO spike_alerts (
                cluster_name, cluster_id, z_score,
                article_count, baseline_avg, severity, triggered_at
            )
            VALUES %s
            ON CONFLICT DO NOTHING
        """, [
            (
                row['CLUSTER_NAME'],
                row['CLUSTER_ID'],
                row['Z_SCORE'],
                row['CURRENT_COUNT'],
                row['BASELINE_AVG'],
                row['SEVERITY'],
                row['DETECTED_AT'],
            )
            for row in new_alerts
        ])

    cur.close()
    log.info(f'  → {len(rows)} alerts synced ({len(new_alerts)} active)')
    return len(rows)


# ── Sync 5: Log pipeline run ──────────────────────────────────
def log_pipeline_run(pg, stats: dict, duration: float, status: str, error: str = None):
    cur = pg.cursor()
    cur.execute("""
        INSERT INTO pipeline_run_log (
            articles_processed, clusters_summarized,
            spikes_detected, drivers_updated,
            duration_seconds, status, error_message, run_at
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
    """, (
        stats.get('articles', 0),
        stats.get('clusters', 0),
        stats.get('alerts', 0),
        stats.get('drivers', 0),
        round(duration, 2),
        status,
        error,
    ))
    cur.close()


# ── Main ──────────────────────────────────────────────────────
def main():
    start = time.time()
    stats = {}
    status = 'success'
    error_msg = None

    sf = None
    pg = None

    try:
        sf = get_snowflake()
        pg = get_neon()

        # Run all 4 syncs in order
        stats['clusters']  = sync_cluster_summaries(sf, pg)
        stats['articles']  = sync_article_intelligence(sf, pg)
        stats['drivers']   = sync_driver_sentiment(sf, pg)
        stats['alerts']    = sync_spike_alerts(sf, pg)

        pg.commit()
        log.info('All syncs committed to Neon ✓')

    except Exception as e:
        status = 'failed'
        error_msg = str(e)
        log.error(f'Sync failed: {e}')
        if pg:
            pg.rollback()
        sys.exit(1)

    finally:
        duration = time.time() - start

        # Log the run (best effort)
        try:
            if pg and not pg.closed:
                log_pipeline_run(pg, stats, duration, status, error_msg)
                pg.commit()
        except Exception as log_err:
            log.warning(f'Could not log pipeline run: {log_err}')

        if sf:
            sf.close()
        if pg and not pg.closed:
            pg.close()

        log.info(
            f'Intelligence sync complete in {duration:.1f}s — '
            f'clusters: {stats.get("clusters", 0)}, '
            f'articles: {stats.get("articles", 0)}, '
            f'drivers: {stats.get("drivers", 0)}, '
            f'alerts: {stats.get("alerts", 0)}'
        )


if __name__ == '__main__':
    main()
