#!/usr/bin/env python3
"""
F1 Bulletin — Core Content Sync
scripts/core_content_sync.py

Syncs the main story/feed tables from Snowflake → Neon:
  - MART.EVENT_F1_ONLY_DT   → event_f1_only
  - MART.STORY_TIMELINE_DT  → story_timeline

Run this after the Snowflake core MART pipeline is healthy.

Requirements:
  pip install snowflake-connector-python psycopg2-binary python-dotenv
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
log = logging.getLogger('f1-core-sync')

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


def sf_query(sf_conn, sql: str):
    cur = sf_conn.cursor(snowflake.connector.DictCursor)
    cur.execute(sql)
    rows = cur.fetchall()
    cur.close()
    return rows


def sync_event_f1_only(sf, pg) -> int:
    log.info('Syncing event_f1_only...')

    rows = sf_query(sf, """
        SELECT
            source_type,
            source,
            title,
            url,
            summary,
            published_at_ts,
            event_ts,
            content_hash,
            rn,
            event_type,
            source_count,
            is_multi_source,
            n_10m,
            n_60m,
            is_spike,
            update_score,
            spike_score,
            credibility_score,
            freshness_minutes,
            priority_score,
            priority_tier,
            body_text,
            text_all,
            relevance_score,
            controversy_score,
            topic_cluster,
            topic_scope,
            is_f1_relevant
        FROM MART.EVENT_F1_ONLY_DT
        ORDER BY event_ts DESC
        LIMIT 5000
    """)

    if not rows:
        log.warning('No EVENT_F1_ONLY_DT rows found')
        return 0

    cur = pg.cursor()

    psycopg2.extras.execute_values(cur, """
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
        VALUES %s
        ON CONFLICT (url) DO UPDATE SET
            source_type        = EXCLUDED.source_type,
            source             = EXCLUDED.source,
            title              = EXCLUDED.title,
            summary            = EXCLUDED.summary,
            published_at_ts    = EXCLUDED.published_at_ts,
            event_ts           = EXCLUDED.event_ts,
            content_hash       = EXCLUDED.content_hash,
            rn                 = EXCLUDED.rn,
            event_type         = EXCLUDED.event_type,
            source_count       = EXCLUDED.source_count,
            is_multi_source    = EXCLUDED.is_multi_source,
            n_10m              = EXCLUDED.n_10m,
            n_60m              = EXCLUDED.n_60m,
            is_spike           = EXCLUDED.is_spike,
            update_score       = EXCLUDED.update_score,
            spike_score        = EXCLUDED.spike_score,
            credibility_score  = EXCLUDED.credibility_score,
            freshness_minutes  = EXCLUDED.freshness_minutes,
            priority_score     = EXCLUDED.priority_score,
            priority_tier      = EXCLUDED.priority_tier,
            body_text          = EXCLUDED.body_text,
            text_all           = EXCLUDED.text_all,
            relevance_score    = EXCLUDED.relevance_score,
            controversy_score  = EXCLUDED.controversy_score,
            topic_cluster      = EXCLUDED.topic_cluster,
            topic_scope        = EXCLUDED.topic_scope,
            is_f1_relevant     = EXCLUDED.is_f1_relevant,
            updated_at         = NOW()
    """, [
        (
            row['URL'],
            row['SOURCE_TYPE'],
            row['SOURCE'],
            row['TITLE'],
            row['SUMMARY'],
            row['PUBLISHED_AT_TS'],
            row['EVENT_TS'],
            row['CONTENT_HASH'],
            row['RN'],
            row['EVENT_TYPE'],
            row['SOURCE_COUNT'] or 0,
            bool(row['IS_MULTI_SOURCE']),
            row['N_10M'] or 0,
            row['N_60M'] or 0,
            bool(row['IS_SPIKE']),
            row['UPDATE_SCORE'],
            row['SPIKE_SCORE'],
            row['CREDIBILITY_SCORE'],
            row['FRESHNESS_MINUTES'],
            row['PRIORITY_SCORE'],
            row['PRIORITY_TIER'],
            row['BODY_TEXT'],
            row['TEXT_ALL'],
            row['RELEVANCE_SCORE'],
            row['CONTROVERSY_SCORE'],
            row['TOPIC_CLUSTER'],
            row['TOPIC_SCOPE'],
            bool(row['IS_F1_RELEVANT']),
        )
        for row in rows
    ], page_size=500)

    cur.close()
    log.info(f'  → {len(rows)} event rows synced')
    return len(rows)


def sync_story_timeline(sf, pg) -> int:
    log.info('Syncing story_timeline...')

    rows = sf_query(sf, """
        SELECT
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
        FROM MART.STORY_TIMELINE_DT
        ORDER BY latest_event_ts DESC
        LIMIT 5000
    """)

    if not rows:
        log.warning('No STORY_TIMELINE_DT rows found')
        return 0

    cur = pg.cursor()

    psycopg2.extras.execute_values(cur, """
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
        VALUES %s
        ON CONFLICT (story_id) DO UPDATE SET
            topic_cluster       = EXCLUDED.topic_cluster,
            story_title         = EXCLUDED.story_title,
            latest_url          = EXCLUDED.latest_url,
            latest_source       = EXCLUDED.latest_source,
            latest_event_ts     = EXCLUDED.latest_event_ts,
            first_seen_at       = EXCLUDED.first_seen_at,
            last_seen_at        = EXCLUDED.last_seen_at,
            events_count        = EXCLUDED.events_count,
            sources_count       = EXCLUDED.sources_count,
            updates_count       = EXCLUDED.updates_count,
            max_priority_score  = EXCLUDED.max_priority_score,
            best_priority_tier  = EXCLUDED.best_priority_tier,
            driver              = EXCLUDED.driver,
            heat_index          = EXCLUDED.heat_index,
            momentum_score      = EXCLUDED.momentum_score,
            is_breaking         = EXCLUDED.is_breaking,
            breaking_tier       = EXCLUDED.breaking_tier,
            merge_key           = EXCLUDED.merge_key,
            updated_at          = NOW()
    """, [
        (
            row['STORY_ID'],
            row['TOPIC_CLUSTER'],
            row['STORY_TITLE'],
            row['LATEST_URL'],
            row['LATEST_SOURCE'],
            row['LATEST_EVENT_TS'],
            row['FIRST_SEEN_AT'],
            row['LAST_SEEN_AT'],
            row['EVENTS_COUNT'] or 0,
            row['SOURCES_COUNT'] or 0,
            row['UPDATES_COUNT'] or 0,
            row['MAX_PRIORITY_SCORE'],
            row['BEST_PRIORITY_TIER'],
            row['DRIVER'],
            row['HEAT_INDEX'],
            row['MOMENTUM_SCORE'],
            bool(row['IS_BREAKING']),
            row['BREAKING_TIER'],
            row['MERGE_KEY'],
        )
        for row in rows
    ], page_size=500)

    cur.close()
    log.info(f'  → {len(rows)} story rows synced')
    return len(rows)


def log_pipeline_run(pg, stats: dict, duration: float, status: str, error: str = None):
    cur = pg.cursor()
    cur.execute("""
        INSERT INTO pipeline_run_log (
            articles_processed,
            clusters_summarized,
            spikes_detected,
            drivers_updated,
            duration_seconds,
            status,
            error_message,
            run_at
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
    """, (
        stats.get('events', 0),
        stats.get('stories', 0),
        0,
        0,
        round(duration, 2),
        f'core_sync:{status}',
        error,
    ))
    cur.close()


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

        stats['events'] = sync_event_f1_only(sf, pg)
        stats['stories'] = sync_story_timeline(sf, pg)

        pg.commit()
        log.info('Core content sync committed to Neon ✓')

    except Exception as e:
        status = 'failed'
        error_msg = str(e)
        log.error(f'Core content sync failed: {e}')
        if pg:
            pg.rollback()
        sys.exit(1)

    finally:
        duration = time.time() - start
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
            f'Core sync complete in {duration:.1f}s — '
            f'events: {stats.get("events", 0)}, '
            f'stories: {stats.get("stories", 0)}'
        )


if __name__ == '__main__':
    main()