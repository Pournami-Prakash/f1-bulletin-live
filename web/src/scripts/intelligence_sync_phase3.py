#!/usr/bin/env python3
"""
F1 Bulletin — Phase 3 Intelligence Sync
scripts/intelligence_sync_phase3.py

Syncs Phase 3 tables from Snowflake → Neon:
  - RACE_CALENDAR           → race_calendar
  - WEEKEND_STATE           → weekend_state
  - SESSION_CHATTER         → session_chatter
  - REGULATORY_RISK_SCORE   → regulatory_risk_score
  - PRE_RACE_INTELLIGENCE   → pre_race_intelligence

Run AFTER intelligence_sync_phase2.py in GitHub Actions.
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
log = logging.getLogger('f1-sync-p3')

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


# ── Sync 1: Race Calendar ─────────────────────────────────────
def sync_race_calendar(sf, pg) -> int:
    log.info('Syncing race calendar...')

    rows = sf_query(sf, """
        SELECT
            round, season, race_name, circuit_name,
            city, country, country_code, flag_emoji,
            fp1_date, fp2_date, fp3_date, quali_date,
            sprint_quali_date, sprint_date, race_date, race_start_utc,
            circuit_length_km, race_laps, lap_record,
            lap_record_holder, lap_record_year, drs_zones,
            is_sprint_weekend, is_completed, updated_at
        FROM MART.RACE_CALENDAR
        WHERE season = 2026
        ORDER BY round
    """)

    if not rows:
        log.warning('  → No calendar data found')
        return 0

    cur = pg.cursor()

    psycopg2.extras.execute_values(cur, """
        INSERT INTO race_calendar (
            round, season, race_name, circuit_name,
            city, country, country_code, flag_emoji,
            fp1_date, fp2_date, fp3_date, quali_date,
            sprint_quali_date, sprint_date, race_date, race_start_utc,
            circuit_length_km, race_laps, lap_record,
            lap_record_holder, lap_record_year, drs_zones,
            is_sprint_weekend, is_completed, updated_at
        )
        VALUES %s
        ON CONFLICT (round, season) DO UPDATE SET
            race_name         = EXCLUDED.race_name,
            circuit_name      = EXCLUDED.circuit_name,
            city              = EXCLUDED.city,
            country           = EXCLUDED.country,
            flag_emoji        = EXCLUDED.flag_emoji,
            fp1_date          = EXCLUDED.fp1_date,
            fp2_date          = EXCLUDED.fp2_date,
            fp3_date          = EXCLUDED.fp3_date,
            quali_date        = EXCLUDED.quali_date,
            sprint_quali_date = EXCLUDED.sprint_quali_date,
            sprint_date       = EXCLUDED.sprint_date,
            race_date         = EXCLUDED.race_date,
            race_start_utc    = EXCLUDED.race_start_utc,
            is_sprint_weekend = EXCLUDED.is_sprint_weekend,
            is_completed      = EXCLUDED.is_completed,
            updated_at        = EXCLUDED.updated_at
    """, [
        (
            row['ROUND'], row['SEASON'], row['RACE_NAME'], row['CIRCUIT_NAME'],
            row['CITY'], row['COUNTRY'], row['COUNTRY_CODE'], row['FLAG_EMOJI'],
            row['FP1_DATE'], row['FP2_DATE'], row['FP3_DATE'], row['QUALI_DATE'],
            row['SPRINT_QUALI_DATE'], row['SPRINT_DATE'], row['RACE_DATE'],
            row['RACE_START_UTC'], row['CIRCUIT_LENGTH_KM'], row['RACE_LAPS'],
            row['LAP_RECORD'], row['LAP_RECORD_HOLDER'], row['LAP_RECORD_YEAR'],
            row['DRS_ZONES'], bool(row['IS_SPRINT_WEEKEND']),
            bool(row['IS_COMPLETED']), row['UPDATED_AT'],
        )
        for row in rows
    ])

    cur.close()
    log.info(f'  → {len(rows)} calendar rows synced')
    return len(rows)


# ── Sync 2: Weekend State ─────────────────────────────────────
def sync_weekend_state(sf, pg) -> int:
    log.info('Syncing weekend state...')

    rows = sf_query(sf, """
        SELECT
            id, is_race_week, days_until_race,
            next_race_round, next_race_name, next_race_circuit,
            next_race_city, next_race_country, next_race_flag,
            next_race_date, next_race_start_utc, is_sprint_weekend,
            circuit_length_km, race_laps, lap_record, lap_record_holder, drs_zones,
            fp1_today, fp2_today, fp3_today, quali_today,
            sprint_today, race_today, current_session, updated_at
        FROM MART.WEEKEND_STATE
        WHERE id = 1
    """)

    if not rows:
        log.warning('  → No weekend state found')
        return 0

    row = rows[0]
    cur = pg.cursor()

    cur.execute("""
        INSERT INTO weekend_state (
            id, is_race_week, days_until_race,
            next_race_round, next_race_name, next_race_circuit,
            next_race_city, next_race_country, next_race_flag,
            next_race_date, next_race_start_utc, is_sprint_weekend,
            circuit_length_km, race_laps, lap_record, lap_record_holder, drs_zones,
            fp1_today, fp2_today, fp3_today, quali_today,
            sprint_today, race_today, current_session, updated_at
        )
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        ON CONFLICT (id) DO UPDATE SET
            is_race_week        = EXCLUDED.is_race_week,
            days_until_race     = EXCLUDED.days_until_race,
            next_race_round     = EXCLUDED.next_race_round,
            next_race_name      = EXCLUDED.next_race_name,
            next_race_circuit   = EXCLUDED.next_race_circuit,
            next_race_city      = EXCLUDED.next_race_city,
            next_race_country   = EXCLUDED.next_race_country,
            next_race_flag      = EXCLUDED.next_race_flag,
            next_race_date      = EXCLUDED.next_race_date,
            next_race_start_utc = EXCLUDED.next_race_start_utc,
            is_sprint_weekend   = EXCLUDED.is_sprint_weekend,
            circuit_length_km   = EXCLUDED.circuit_length_km,
            race_laps           = EXCLUDED.race_laps,
            lap_record          = EXCLUDED.lap_record,
            lap_record_holder   = EXCLUDED.lap_record_holder,
            drs_zones           = EXCLUDED.drs_zones,
            fp1_today           = EXCLUDED.fp1_today,
            fp2_today           = EXCLUDED.fp2_today,
            fp3_today           = EXCLUDED.fp3_today,
            quali_today         = EXCLUDED.quali_today,
            sprint_today        = EXCLUDED.sprint_today,
            race_today          = EXCLUDED.race_today,
            current_session     = EXCLUDED.current_session,
            updated_at          = EXCLUDED.updated_at
    """, (
        row['ID'], bool(row['IS_RACE_WEEK']), row['DAYS_UNTIL_RACE'],
        row['NEXT_RACE_ROUND'], row['NEXT_RACE_NAME'], row['NEXT_RACE_CIRCUIT'],
        row['NEXT_RACE_CITY'], row['NEXT_RACE_COUNTRY'], row['NEXT_RACE_FLAG'],
        row['NEXT_RACE_DATE'], row['NEXT_RACE_START_UTC'],
        bool(row['IS_SPRINT_WEEKEND']),
        row['CIRCUIT_LENGTH_KM'], row['RACE_LAPS'], row['LAP_RECORD'],
        row['LAP_RECORD_HOLDER'], row['DRS_ZONES'],
        bool(row['FP1_TODAY']), bool(row['FP2_TODAY']),
        bool(row['FP3_TODAY']), bool(row['QUALI_TODAY']),
        bool(row['SPRINT_TODAY']), bool(row['RACE_TODAY']),
        row['CURRENT_SESSION'], row['UPDATED_AT'],
    ))

    cur.close()
    log.info(f'  → Weekend state synced (race_week={row["IS_RACE_WEEK"]}, '
             f'days_until={row["DAYS_UNTIL_RACE"]}, '
             f'session={row["CURRENT_SESSION"]})')
    return 1


# ── Sync 3: Session Chatter ───────────────────────────────────
def sync_session_chatter(sf, pg) -> int:
    log.info('Syncing session chatter...')

    # Only sync during race week — skip otherwise to save time
    rows = sf_query(sf, """
        SELECT
            guid, title, summary, source_type, cluster_primary,
            sentiment_score, sentiment_label, priority_score, published_at,
            race_round, race_name, circuit_name,
            session_relevance, relevance_score, engagement_score, created_at
        FROM MART.SESSION_CHATTER
        WHERE created_at >= DATEADD('day', -5, CURRENT_TIMESTAMP())
        ORDER BY relevance_score DESC, priority_score DESC
        LIMIT 200
    """)

    if not rows:
        log.info('  → No session chatter (not race week or no data)')
        return 0

    cur = pg.cursor()

    psycopg2.extras.execute_values(cur, """
        INSERT INTO session_chatter (
            guid, title, summary, source_type, cluster_name,
            sentiment_score, sentiment_label, priority_score, published_at,
            race_round, race_name, circuit_name,
            session_relevance, relevance_score, engagement_score, created_at
        )
        VALUES %s
        ON CONFLICT (guid, race_round) DO UPDATE SET
            relevance_score  = EXCLUDED.relevance_score,
            sentiment_score  = EXCLUDED.sentiment_score,
            sentiment_label  = EXCLUDED.sentiment_label,
            priority_score   = EXCLUDED.priority_score
    """, [
        (
            row['GUID'], row['TITLE'], row['SUMMARY'],
            row['SOURCE_TYPE'], row['CLUSTER_PRIMARY'],
            row['SENTIMENT_SCORE'], row['SENTIMENT_LABEL'],
            row['PRIORITY_SCORE'], row['PUBLISHED_AT'],
            row['RACE_ROUND'], row['RACE_NAME'], row['CIRCUIT_NAME'],
            row['SESSION_RELEVANCE'], row['RELEVANCE_SCORE'],
            row['ENGAGEMENT_SCORE'] or 0, row['CREATED_AT'],
        )
        for row in rows
    ])

    cur.close()
    log.info(f'  → {len(rows)} chatter items synced')
    return len(rows)


# ── Sync 4: Regulatory Risk Score ────────────────────────────
def sync_regulatory_risk(sf, pg) -> int:
    log.info('Syncing regulatory risk scores...')

    rows = sf_query(sf, """
        SELECT
            entity_name, entity_type, race_round, race_name,
            investigation_score, penalty_score, fia_notice_score, controversy_score,
            risk_score, risk_label,
            active_investigations, recent_penalties, fia_notices_7d,
            watchlist_reason, calculated_at
        FROM MART.REGULATORY_RISK_SCORE
        WHERE calculated_at >= DATEADD('day', -30, CURRENT_TIMESTAMP())
        ORDER BY risk_score DESC NULLS LAST
    """)

    if not rows:
        log.info('  → No regulatory risk data')
        return 0

    cur = pg.cursor()

    psycopg2.extras.execute_values(cur, """
        INSERT INTO regulatory_risk_score (
            entity_name, entity_type, race_round, race_name,
            investigation_score, penalty_score, fia_notice_score, controversy_score,
            risk_score, risk_label,
            active_investigations, recent_penalties, fia_notices_7d,
            watchlist_reason, calculated_at
        )
        VALUES %s
        ON CONFLICT (entity_name, entity_type, race_round) DO UPDATE SET
            investigation_score   = EXCLUDED.investigation_score,
            penalty_score         = EXCLUDED.penalty_score,
            fia_notice_score      = EXCLUDED.fia_notice_score,
            controversy_score     = EXCLUDED.controversy_score,
            risk_score            = EXCLUDED.risk_score,
            risk_label            = EXCLUDED.risk_label,
            active_investigations = EXCLUDED.active_investigations,
            recent_penalties      = EXCLUDED.recent_penalties,
            fia_notices_7d        = EXCLUDED.fia_notices_7d,
            watchlist_reason      = EXCLUDED.watchlist_reason,
            calculated_at         = EXCLUDED.calculated_at
    """, [
        (
            row['ENTITY_NAME'].title(), row['ENTITY_TYPE'],
            row['RACE_ROUND'], row['RACE_NAME'],
            row['INVESTIGATION_SCORE'], row['PENALTY_SCORE'],
            row['FIA_NOTICE_SCORE'], row['CONTROVERSY_SCORE'],
            row['RISK_SCORE'], row['RISK_LABEL'],
            row['ACTIVE_INVESTIGATIONS'] or 0,
            row['RECENT_PENALTIES'] or 0,
            row['FIA_NOTICES_7D'] or 0,
            row['WATCHLIST_REASON'], row['CALCULATED_AT'],
        )
        for row in rows
    ])

    cur.close()
    log.info(f'  → {len(rows)} risk score rows synced')
    return len(rows)


# ── Sync 5: Pre-Race Intelligence ─────────────────────────────
def sync_pre_race_intelligence(sf, pg) -> int:
    log.info('Syncing pre-race intelligence snapshots...')

    rows = sf_query(sf, """
        SELECT
            race_round, race_name, race_date,
            weekend_overview, regulatory_watchlist, form_guide,
            controversy_radar, key_battles, session_preview,
            top_risk_entity, top_risk_score, top_momentum_cluster,
            top_sentiment_driver, active_controversies, total_weekend_signals,
            generated_at, model_used, regen_triggered, regen_reason
        FROM MART.PRE_RACE_INTELLIGENCE
        ORDER BY race_round DESC
        LIMIT 5
    """)

    if not rows:
        log.info('  → No pre-race intelligence (not race week yet)')
        return 0

    cur = pg.cursor()

    psycopg2.extras.execute_values(cur, """
        INSERT INTO pre_race_intelligence (
            race_round, race_name, race_date,
            weekend_overview, regulatory_watchlist, form_guide,
            controversy_radar, key_battles, session_preview,
            top_risk_entity, top_risk_score, top_momentum_cluster,
            top_sentiment_driver, active_controversies, total_weekend_signals,
            generated_at, model_used, regen_triggered, regen_reason
        )
        VALUES %s
        ON CONFLICT (race_round) DO UPDATE SET
            weekend_overview      = EXCLUDED.weekend_overview,
            regulatory_watchlist  = EXCLUDED.regulatory_watchlist,
            form_guide            = EXCLUDED.form_guide,
            controversy_radar     = EXCLUDED.controversy_radar,
            key_battles           = EXCLUDED.key_battles,
            session_preview       = EXCLUDED.session_preview,
            top_risk_entity       = EXCLUDED.top_risk_entity,
            top_risk_score        = EXCLUDED.top_risk_score,
            active_controversies  = EXCLUDED.active_controversies,
            total_weekend_signals = EXCLUDED.total_weekend_signals,
            generated_at          = EXCLUDED.generated_at,
            regen_triggered       = EXCLUDED.regen_triggered,
            regen_reason          = EXCLUDED.regen_reason
    """, [
        (
            row['RACE_ROUND'], row['RACE_NAME'], row['RACE_DATE'],
            row['WEEKEND_OVERVIEW'], row['REGULATORY_WATCHLIST'],
            row['FORM_GUIDE'], row['CONTROVERSY_RADAR'],
            row['KEY_BATTLES'], row['SESSION_PREVIEW'],
            row['TOP_RISK_ENTITY'], row['TOP_RISK_SCORE'],
            row['TOP_MOMENTUM_CLUSTER'], row['TOP_SENTIMENT_DRIVER'],
            row['ACTIVE_CONTROVERSIES'] or 0,
            row['TOTAL_WEEKEND_SIGNALS'] or 0,
            row['GENERATED_AT'], row['MODEL_USED'],
            bool(row['REGEN_TRIGGERED']), row['REGEN_REASON'],
        )
        for row in rows
    ])

    cur.close()
    log.info(f'  → {len(rows)} pre-race snapshots synced')
    return len(rows)


# ── Main ──────────────────────────────────────────────────────
def log_pipeline_run(pg, phase: str, stats: dict, duration: float, status: str, error: str = None):
    """Append a row to pipeline_run_log so all three phases are tracked."""
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
        f'{phase}:{status}',   # e.g. "phase3:success"
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

        stats['calendar']  = sync_race_calendar(sf, pg)
        stats['weekend']   = sync_weekend_state(sf, pg)
        stats['chatter']   = sync_session_chatter(sf, pg)
        stats['risk']      = sync_regulatory_risk(sf, pg)
        stats['prerace']   = sync_pre_race_intelligence(sf, pg)

        pg.commit()
        log.info(f'Phase 3 sync complete in {time.time()-start:.1f}s ✓')

    except Exception as e:
        status    = 'failed'
        error_msg = str(e)
        log.error(f'Phase 3 sync failed: {e}')
        if pg:
            pg.rollback()
        sys.exit(1)

    finally:
        duration = time.time() - start
        try:
            if pg and not pg.closed:
                log_pipeline_run(pg, 'phase3', stats, duration, status, error_msg)
                pg.commit()
        except Exception as log_err:
            log.warning(f'Could not log pipeline run: {log_err}')

        if sf: sf.close()
        if pg and not pg.closed: pg.close()


if __name__ == '__main__':
    main()
