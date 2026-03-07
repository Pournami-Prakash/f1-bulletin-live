#!/usr/bin/env python3
"""
F1 Bulletin — Phase 2 Intelligence Sync Extension
scripts/intelligence_sync_phase2.py

Syncs Phase 2 tables from Snowflake → Neon:
  - CONTROVERSY_INDEX        → controversy_index
  - DAILY_BRIEFINGS          → daily_briefings
  - REGULATORY_TAGS          → regulatory_tags
  - CLUSTER_MOMENTUM_72H     → cluster_momentum_72h

Run AFTER intelligence_sync.py in GitHub Actions.

Usage:
  python3 scripts/intelligence_sync_phase2.py
"""

import os
import sys
import time
import logging

import snowflake.connector
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s  %(levelname)-8s  %(message)s',
    datefmt='%H:%M:%S'
)
log = logging.getLogger('f1-sync-p2')

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


def get_snowflake():
    conn = snowflake.connector.connect(**SF_CONFIG)
    log.info('Snowflake connected')
    return conn

def get_neon():
    conn = psycopg2.connect(NEON_URL)
    conn.autocommit = False
    log.info('Neon connected')
    return conn

def sf_query(sf_conn, sql):
    cur = sf_conn.cursor(snowflake.connector.DictCursor)
    cur.execute(sql)
    rows = cur.fetchall()
    cur.close()
    return rows


# ── Sync 1: Controversy Index ─────────────────────────────────
def sync_controversy_index(sf, pg) -> int:
    log.info('Syncing controversy index...')

    rows = sf_query(sf, """
        SELECT
            entity_name, entity_type, index_date,
            sentiment_score, fia_score, spike_score, media_score,
            controversy_score, controversy_label,
            score_delta, trending_direction,
            mention_count, negative_count, fia_mentions,
            spike_count, top_cluster, updated_at
        FROM MART.CONTROVERSY_INDEX
        WHERE index_date >= DATEADD('day', -7, CURRENT_DATE())
        ORDER BY index_date DESC, controversy_score DESC NULLS LAST
    """)

    if not rows:
        log.info('  → No controversy data to sync')
        return 0

    cur = pg.cursor()

    psycopg2.extras.execute_values(cur, """
        INSERT INTO controversy_index (
            entity_name, entity_type, index_date,
            sentiment_score, fia_score, spike_score, media_score,
            controversy_score, controversy_label,
            score_delta, trending_direction,
            mention_count, negative_count, fia_mentions,
            spike_count, top_cluster, updated_at
        )
        VALUES %s
        ON CONFLICT (entity_name, entity_type, index_date) DO UPDATE SET
            sentiment_score    = EXCLUDED.sentiment_score,
            fia_score          = EXCLUDED.fia_score,
            spike_score        = EXCLUDED.spike_score,
            media_score        = EXCLUDED.media_score,
            controversy_score  = EXCLUDED.controversy_score,
            controversy_label  = EXCLUDED.controversy_label,
            score_delta        = EXCLUDED.score_delta,
            trending_direction = EXCLUDED.trending_direction,
            mention_count      = EXCLUDED.mention_count,
            negative_count     = EXCLUDED.negative_count,
            fia_mentions       = EXCLUDED.fia_mentions,
            spike_count        = EXCLUDED.spike_count,
            top_cluster        = EXCLUDED.top_cluster,
            updated_at         = EXCLUDED.updated_at
    """, [
        (
            row['ENTITY_NAME'].title(),
            row['ENTITY_TYPE'],
            row['INDEX_DATE'],
            row['SENTIMENT_SCORE'],
            row['FIA_SCORE'],
            row['SPIKE_SCORE'],
            row['MEDIA_SCORE'],
            row['CONTROVERSY_SCORE'],
            row['CONTROVERSY_LABEL'],
            row['SCORE_DELTA'],
            row['TRENDING_DIRECTION'],
            row['MENTION_COUNT'],
            row['NEGATIVE_COUNT'],
            row['FIA_MENTIONS'],
            row['SPIKE_COUNT'],
            row['TOP_CLUSTER'],
            row['UPDATED_AT'],
        )
        for row in rows
    ])

    cur.close()
    log.info(f'  → {len(rows)} controversy rows synced')
    return len(rows)


# ── Sync 2: Daily Briefings ───────────────────────────────────
def sync_daily_briefings(sf, pg) -> int:
    log.info('Syncing daily briefings...')

    rows = sf_query(sf, """
        SELECT
            briefing_date, headline, lead_paragraph,
            top_story_summary, driver_spotlight,
            controversy_note, what_to_watch,
            top_cluster, top_driver,
            total_signals, breaking_count,
            avg_sentiment, sentiment_label,
            active_spike_count,
            top_controversy_entity, top_controversy_score,
            generated_at, model_used,
            generation_skipped, skip_reason
        FROM MART.DAILY_BRIEFINGS
        WHERE briefing_date >= DATEADD('day', -30, CURRENT_DATE())
        ORDER BY briefing_date DESC
    """)

    if not rows:
        log.info('  → No briefings to sync')
        return 0

    cur = pg.cursor()

    psycopg2.extras.execute_values(cur, """
        INSERT INTO daily_briefings (
            briefing_date, headline, lead_paragraph,
            top_story_summary, driver_spotlight,
            controversy_note, what_to_watch,
            top_cluster, top_driver,
            total_signals, breaking_count,
            avg_sentiment, sentiment_label,
            active_spike_count,
            top_controversy_entity, top_controversy_score,
            generated_at, model_used,
            generation_skipped, skip_reason
        )
        VALUES %s
        ON CONFLICT (briefing_date) DO UPDATE SET
            headline               = EXCLUDED.headline,
            lead_paragraph         = EXCLUDED.lead_paragraph,
            top_story_summary      = EXCLUDED.top_story_summary,
            driver_spotlight       = EXCLUDED.driver_spotlight,
            controversy_note       = EXCLUDED.controversy_note,
            what_to_watch          = EXCLUDED.what_to_watch,
            top_cluster            = EXCLUDED.top_cluster,
            top_driver             = EXCLUDED.top_driver,
            total_signals          = EXCLUDED.total_signals,
            breaking_count         = EXCLUDED.breaking_count,
            avg_sentiment          = EXCLUDED.avg_sentiment,
            sentiment_label        = EXCLUDED.sentiment_label,
            active_spike_count     = EXCLUDED.active_spike_count,
            top_controversy_entity = EXCLUDED.top_controversy_entity,
            top_controversy_score  = EXCLUDED.top_controversy_score,
            generated_at           = EXCLUDED.generated_at,
            generation_skipped     = EXCLUDED.generation_skipped,
            skip_reason            = EXCLUDED.skip_reason
    """, [
        (
            row['BRIEFING_DATE'],
            row['HEADLINE'],
            row['LEAD_PARAGRAPH'],
            row['TOP_STORY_SUMMARY'],
            row['DRIVER_SPOTLIGHT'],
            row['CONTROVERSY_NOTE'],
            row['WHAT_TO_WATCH'],
            row['TOP_CLUSTER'],
            row['TOP_DRIVER'],
            row['TOTAL_SIGNALS'] or 0,
            row['BREAKING_COUNT'] or 0,
            row['AVG_SENTIMENT'],
            row['SENTIMENT_LABEL'],
            row['ACTIVE_SPIKE_COUNT'] or 0,
            row['TOP_CONTROVERSY_ENTITY'],
            row['TOP_CONTROVERSY_SCORE'],
            row['GENERATED_AT'],
            row['MODEL_USED'],
            bool(row['GENERATION_SKIPPED']),
            row['SKIP_REASON'],
        )
        for row in rows
    ])

    cur.close()
    log.info(f'  → {len(rows)} briefings synced')
    return len(rows)


# ── Sync 3: Regulatory Tags ───────────────────────────────────
def sync_regulatory_tags(sf, pg) -> int:
    log.info('Syncing regulatory tags...')

    rows = sf_query(sf, """
        SELECT guid, regulatory_tag, confidence, tagged_at
        FROM MART.REGULATORY_TAGS
        WHERE tagged_at >= DATEADD('day', -7, CURRENT_TIMESTAMP())
        ORDER BY tagged_at DESC
    """)

    if not rows:
        log.info('  → No regulatory tags to sync')
        return 0

    cur = pg.cursor()

    psycopg2.extras.execute_values(cur, """
        INSERT INTO regulatory_tags (guid, regulatory_tag, confidence, tagged_at)
        VALUES %s
        ON CONFLICT (guid, regulatory_tag) DO NOTHING
    """, [
        (row['GUID'], row['REGULATORY_TAG'], row['CONFIDENCE'], row['TAGGED_AT'])
        for row in rows
    ])

    cur.close()
    log.info(f'  → {len(rows)} regulatory tags synced')
    return len(rows)


# ── Sync 4: Cluster Momentum 72h ──────────────────────────────
def sync_cluster_momentum(sf, pg) -> int:
    log.info('Syncing cluster momentum 72h...')

    rows = sf_query(sf, """
        SELECT
            cluster_name, cluster_id,
            window_start, window_end,
            articles_72h, articles_48h, articles_24h,
            articles_6h, articles_1h,
            velocity, velocity_label, momentum_score,
            days_active, is_sustained, calculated_at
        FROM MART.CLUSTER_MOMENTUM_72H
        ORDER BY momentum_score DESC NULLS LAST
    """)

    if not rows:
        log.info('  → No momentum data to sync')
        return 0

    cur = pg.cursor()

    psycopg2.extras.execute_values(cur, """
        INSERT INTO cluster_momentum_72h (
            cluster_name, cluster_id,
            window_start, window_end,
            articles_72h, articles_48h, articles_24h,
            articles_6h, articles_1h,
            velocity, velocity_label, momentum_score,
            days_active, is_sustained, calculated_at
        )
        VALUES %s
        ON CONFLICT (cluster_name) DO UPDATE SET
            cluster_id     = EXCLUDED.cluster_id,
            window_start   = EXCLUDED.window_start,
            window_end     = EXCLUDED.window_end,
            articles_72h   = EXCLUDED.articles_72h,
            articles_48h   = EXCLUDED.articles_48h,
            articles_24h   = EXCLUDED.articles_24h,
            articles_6h    = EXCLUDED.articles_6h,
            articles_1h    = EXCLUDED.articles_1h,
            velocity       = EXCLUDED.velocity,
            velocity_label = EXCLUDED.velocity_label,
            momentum_score = EXCLUDED.momentum_score,
            days_active    = EXCLUDED.days_active,
            is_sustained   = EXCLUDED.is_sustained,
            calculated_at  = EXCLUDED.calculated_at
    """, [
        (
            row['CLUSTER_NAME'],
            row['CLUSTER_ID'],
            row['WINDOW_START'],
            row['WINDOW_END'],
            row['ARTICLES_72H'],
            row['ARTICLES_48H'],
            row['ARTICLES_24H'],
            row['ARTICLES_6H'],
            row['ARTICLES_1H'],
            row['VELOCITY'],
            row['VELOCITY_LABEL'],
            row['MOMENTUM_SCORE'],
            row['DAYS_ACTIVE'],
            bool(row['IS_SUSTAINED']),
            row['CALCULATED_AT'],
        )
        for row in rows
    ])

    cur.close()
    log.info(f'  → {len(rows)} cluster momentum rows synced')
    return len(rows)


# ── Main ──────────────────────────────────────────────────────
def log_pipeline_run(pg, phase: str, stats: dict, duration: float, status: str, error: str = None):
    """Append a row to pipeline_run_log so the dashboard can track all three phases."""
    cur = pg.cursor()
    cur.execute("""
        INSERT INTO pipeline_run_log (
            articles_processed, clusters_summarized,
            spikes_detected, drivers_updated,
            duration_seconds, status, error_message, run_at
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
    """, (
        stats.get('articles', 0),
        stats.get('clusters',  0),
        stats.get('alerts',    0),
        stats.get('drivers',   0),
        round(duration, 2),
        f'{phase}:{status}',   # e.g. "phase2:success"
        error,
    ))
    cur.close()


def main():
    start     = time.time()
    stats     = {}
    status    = 'success'
    error_msg = None
    sf = pg   = None

    try:
        sf = get_snowflake()
        pg = get_neon()

        stats['clusters'] = sync_controversy_index(sf, pg)
        stats['articles'] = sync_daily_briefings(sf, pg)
        stats['alerts']   = sync_regulatory_tags(sf, pg)
        stats['drivers']  = sync_cluster_momentum(sf, pg)

        pg.commit()
        log.info(f'Phase 2 sync complete in {time.time()-start:.1f}s ✓')

    except Exception as e:
        status    = 'failed'
        error_msg = str(e)
        log.error(f'Phase 2 sync failed: {e}')
        if pg:
            pg.rollback()
        sys.exit(1)

    finally:
        duration = time.time() - start
        try:
            if pg and not pg.closed:
                log_pipeline_run(pg, 'phase2', stats, duration, status, error_msg)
                pg.commit()
        except Exception as log_err:
            log.warning(f'Could not log pipeline run: {log_err}')

        if sf: sf.close()
        if pg and not pg.closed: pg.close()


if __name__ == '__main__':
    main()
