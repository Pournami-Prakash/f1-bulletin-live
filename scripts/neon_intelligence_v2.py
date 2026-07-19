#!/usr/bin/env python3
"""Incremental, Neon-native F1 news intelligence.

This replaces the unavailable Snowflake enrichment path with:
  * local FastEmbed vectors and semantic topic classification
  * semantic + lexical sentiment
  * SQL/Python momentum, regulatory, session, and pre-race intelligence
  * deterministic summaries (no model API)

The job is intentionally bounded: it embeds only a rolling window, processes a
limited batch each run, skips unchanged content, and stops adding vectors before
the database approaches Neon's free storage ceiling.
"""

from __future__ import annotations

import argparse
import hashlib
import logging
import math
import os
import re
import time
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Sequence

import numpy as np
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv


ROOT = Path(__file__).resolve().parents[1]
MODEL_NAME = "BAAI/bge-small-en-v1.5"
RETENTION_DAYS = 180
STORAGE_GUARD_BYTES = 400 * 1024 * 1024
DEFAULT_BATCH_SIZE = 500

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("neon-intelligence-v2")


TOPICS = {
    "RACE_WEEKEND": "race weekend practice qualifying sprint grid pole race result podium lap pace",
    "DRIVER_MARKET": "Formula One driver signing contract transfer future seat rookie replacement",
    "TEAM_PERFORMANCE": "Formula One team performance car upgrade development strategy competitiveness",
    "TECHNICAL": "Formula One technical engineering aerodynamics power unit tyres setup regulations design",
    "REGULATORY": "FIA stewards investigation penalty regulation directive appeal compliance cost cap safety",
    "CHAMPIONSHIP": "Formula One championship standings title battle points constructors drivers season",
    "BUSINESS": "Formula One business sponsorship finance ownership commercial media partnership",
    "GENERAL_F1": "general Formula One news interview opinion feature announcement",
}

SENTIMENT_PROTOTYPES = {
    "positive": "excellent success victory confident improvement breakthrough praise strong performance opportunity",
    "negative": "failure crash penalty investigation concern problem disappointment damage conflict poor performance",
    "neutral": "factual Formula One report schedule announcement information update interview",
}

POSITIVE_WEIGHTS = {
    "win": 1.5, "wins": 1.5, "won": 1.5, "victory": 1.5, "podium": 1.2,
    "pole": 1.0, "fastest": 0.8, "upgrade": 0.5, "improved": 0.8,
    "confident": 0.7, "breakthrough": 1.2, "dominant": 1.1, "praised": 0.6,
}
NEGATIVE_WEIGHTS = {
    "penalty": 1.3, "crash": 1.4, "investigation": 1.2, "failure": 1.2,
    "retired": 1.0, "disqualified": 1.5, "damage": 0.9, "concern": 0.6,
    "struggled": 0.8, "controversy": 0.9, "appeal": 0.7, "issue": 0.5,
}

REGULATORY_RULES = {
    "INVESTIGATION": (r"\b(investigat(?:e|ed|ion)|under review|summoned|stewards?)\b", 0.95),
    "PENALTY": (r"\b(penalt(?:y|ies)|grid drop|time penalty|reprimand|disqualif(?:y|ied|ication))\b", 0.95),
    "TECHNICAL_DIRECTIVE": (r"\b(technical directive|td\s*\d+|scrutineer|illegal car|technical regulation)\b", 0.93),
    "COST_CAP": (r"\b(cost cap|financial regulation|budget cap|overspend)\b", 0.96),
    "SAFETY": (r"\b(safety regulation|medical car|red flag|unsafe release|safety car procedure)\b", 0.82),
    "LICENSING": (r"\b(super licen[cs]e|penalty points|licen[cs]e points)\b", 0.92),
    "SPORTING_REGULATION": (r"\b(sporting regulation|race control|fia rule|rules breach|parc ferm[eé])\b", 0.88),
    "POWER_UNIT": (r"\b(power unit allocation|engine penalty|power unit penalty)\b", 0.88),
}

SESSION_RULES = (
    ("FP1", r"\b(fp1|free practice 1|first practice)\b"),
    ("FP2", r"\b(fp2|free practice 2|second practice)\b"),
    ("FP3", r"\b(fp3|free practice 3|third practice)\b"),
    ("QUALIFYING", r"\b(qualifying|quali|pole position|q1|q2|q3)\b"),
    ("SPRINT", r"\b(sprint|sprint shootout)\b"),
    ("RACE", r"\b(race result|race day|wins the|podium|grand prix result)\b"),
)

ENTITIES = {
    "Max Verstappen": ("driver", (r"\bverstappen\b",)),
    "Lando Norris": ("driver", (r"\bnorris\b",)),
    "Oscar Piastri": ("driver", (r"\bpiastri\b",)),
    "Charles Leclerc": ("driver", (r"\bleclerc\b",)),
    "Lewis Hamilton": ("driver", (r"\bhamilton\b",)),
    "George Russell": ("driver", (r"\brussell\b",)),
    "Fernando Alonso": ("driver", (r"\balonso\b",)),
    "Carlos Sainz": ("driver", (r"\bsainz\b",)),
    "Alex Albon": ("driver", (r"\balbon\b",)),
    "Yuki Tsunoda": ("driver", (r"\btsunoda\b",)),
    "Red Bull": ("team", (r"\bred bull\b",)),
    "McLaren": ("team", (r"\bmclaren\b",)),
    "Ferrari": ("team", (r"\bferrari\b",)),
    "Mercedes": ("team", (r"\bmercedes\b",)),
    "Aston Martin": ("team", (r"\baston martin\b",)),
    "Williams": ("team", (r"\bwilliams\b",)),
    "Alpine": ("team", (r"\balpine\b",)),
    "Haas": ("team", (r"\bhaas\b",)),
    "Sauber": ("team", (r"\bsauber\b", r"\baudi\b")),
    "Racing Bulls": ("team", (r"\bracing bulls\b",)),
}


@dataclass
class Article:
    guid: str
    title: str
    summary: str
    source_type: str
    published_at: datetime | None
    priority_score: int
    content_hash: str

    @property
    def text(self) -> str:
        return " ".join(part.strip() for part in (self.title, self.summary) if part).strip()[:4000]


def database_url() -> str:
    load_dotenv(ROOT / ".env")
    load_dotenv(ROOT / "web" / ".env.local")
    value = os.getenv("NEON_DATABASE_URL") or os.getenv("DATABASE_URL")
    if not value:
        raise RuntimeError("NEON_DATABASE_URL or DATABASE_URL is required")
    return value


def apply_migration(conn) -> None:
    sql = (ROOT / "sql" / "neon_intelligence_v2.sql").read_text()
    with conn.cursor() as cur:
        cur.execute(sql)
    conn.commit()


def database_size(conn) -> int:
    with conn.cursor() as cur:
        cur.execute("SELECT pg_database_size(current_database())")
        return int(cur.fetchone()[0])


def normalize(matrix: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    return matrix / np.maximum(norms, 1e-12)


def vector_literal(vector: np.ndarray) -> str:
    return "[" + ",".join(f"{float(value):.7f}" for value in vector) + "]"


def content_fingerprint(article: Article) -> str:
    if article.content_hash:
        return article.content_hash
    return hashlib.sha256(article.text.encode("utf-8")).hexdigest()


def fetch_embedding_candidates(conn, limit: int) -> list[Article]:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            SELECT e.url AS guid, COALESCE(e.title, '') AS title,
                   COALESCE(e.summary, e.body_text, '') AS summary,
                   COALESCE(e.source_type, 'unknown') AS source_type,
                   e.event_ts AS published_at,
                   ROUND(COALESCE(e.priority_score, 0))::int AS priority_score,
                   COALESCE(e.content_hash, '') AS content_hash
            FROM event_f1_only e
            LEFT JOIN article_intelligence ai ON ai.guid = e.url
            WHERE e.is_f1_relevant = TRUE
              AND e.event_ts >= NOW() - (%s || ' days')::interval
              AND (ai.local_embedding IS NULL OR ai.embedding_content_hash IS DISTINCT FROM e.content_hash)
            ORDER BY e.event_ts DESC NULLS LAST
            LIMIT %s
            """,
            (RETENTION_DAYS, limit),
        )
        return [Article(**dict(row)) for row in cur.fetchall()]


def lexical_sentiment(text: str) -> float:
    words = re.findall(r"[a-z]+", text.lower())
    score = 0.0
    for index, word in enumerate(words):
        weight = POSITIVE_WEIGHTS.get(word, 0.0) - NEGATIVE_WEIGHTS.get(word, 0.0)
        if weight and any(token in {"not", "no", "never"} for token in words[max(0, index - 3):index]):
            weight *= -0.75
        score += weight
    return math.tanh(score / 3.0)


def sentiment_label(score: float) -> str:
    return "positive" if score > 0.16 else "negative" if score < -0.16 else "neutral"


def embed_articles(conn, articles: Sequence[Article], cache_dir: str) -> int:
    if not articles:
        log.info("No new or changed articles need embeddings")
        return 0

    from fastembed import TextEmbedding

    log.info("Embedding %d articles with %s", len(articles), MODEL_NAME)
    model = TextEmbedding(model_name=MODEL_NAME, cache_dir=cache_dir)
    topic_names = list(TOPICS)
    prototype_texts = list(TOPICS.values()) + list(SENTIMENT_PROTOTYPES.values())
    prototypes = normalize(np.asarray(list(model.embed(prototype_texts)), dtype=np.float32))
    topic_vectors = prototypes[: len(topic_names)]
    sentiment_vectors = prototypes[len(topic_names):]
    embedded = 0
    chunk_size = 100
    for offset in range(0, len(articles), chunk_size):
        chunk = articles[offset:offset + chunk_size]
        vectors = normalize(np.asarray(list(model.embed(
            [article.text or article.title for article in chunk], batch_size=64
        )), dtype=np.float32))
        rows = []
        for article, vector in zip(chunk, vectors):
            topic_scores = vector @ topic_vectors.T
            semantic_cluster = topic_names[int(np.argmax(topic_scores))]
            semantic_sentiment = vector @ sentiment_vectors.T
            semantic_score = float((semantic_sentiment[0] - semantic_sentiment[1]) * 4.0)
            score = max(-1.0, min(1.0, semantic_score * 0.65 + lexical_sentiment(article.text) * 0.35))
            rows.append((
                article.guid, article.title, article.source_type, semantic_cluster, semantic_cluster,
                score, sentiment_label(score), article.priority_score, vector_literal(vector),
                article.published_at, content_fingerprint(article), MODEL_NAME,
            ))

        with conn.cursor() as cur:
            psycopg2.extras.execute_values(
                cur,
                """
                INSERT INTO article_intelligence (
                  guid, title, source_type, cluster_name, semantic_cluster,
                  sentiment_score, sentiment_label, priority_score, local_embedding,
                  published_at, embedding_content_hash, embedding_model
                ) VALUES %s
                ON CONFLICT (guid) DO UPDATE SET
                  title=EXCLUDED.title, source_type=EXCLUDED.source_type,
                  cluster_name=EXCLUDED.cluster_name, semantic_cluster=EXCLUDED.semantic_cluster,
                  sentiment_score=EXCLUDED.sentiment_score, sentiment_label=EXCLUDED.sentiment_label,
                  priority_score=EXCLUDED.priority_score, local_embedding=EXCLUDED.local_embedding,
                  published_at=EXCLUDED.published_at,
                  embedding_content_hash=EXCLUDED.embedding_content_hash,
                  embedding_model=EXCLUDED.embedding_model, processed_at=NOW()
                """,
                rows,
                page_size=100,
            )
        conn.commit()
        embedded += len(rows)
        log.info("Embedded %d/%d articles", embedded, len(articles))
    return embedded


def prune_old_embeddings(conn) -> int:
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE article_intelligence
            SET local_embedding=NULL, embedding_content_hash=NULL, embedding_model=NULL
            WHERE published_at < NOW() - (%s || ' days')::interval
              AND local_embedding IS NOT NULL
            """,
            (RETENTION_DAYS,),
        )
        count = cur.rowcount
    conn.commit()
    return count


def refresh_regulatory_tags(conn) -> int:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """SELECT url AS guid, LOWER(COALESCE(title,'') || ' ' || COALESCE(summary,'') || ' ' || COALESCE(body_text,'')) AS text
               FROM event_f1_only WHERE is_f1_relevant=TRUE AND event_ts >= NOW() - INTERVAL '30 days'"""
        )
        articles = cur.fetchall()
    rows = []
    for article in articles:
        for tag, (pattern, confidence) in REGULATORY_RULES.items():
            if re.search(pattern, article["text"], re.I):
                rows.append((article["guid"], tag, confidence))
    if rows:
        with conn.cursor() as cur:
            psycopg2.extras.execute_values(
                cur,
                """INSERT INTO regulatory_tags (guid, regulatory_tag, confidence, tagged_at) VALUES %s
                   ON CONFLICT (guid, regulatory_tag) DO UPDATE SET confidence=EXCLUDED.confidence, tagged_at=NOW()""",
                rows,
                template="(%s,%s,%s,NOW())",
            )
    conn.commit()
    return len(rows)


def refresh_momentum_and_summaries(conn) -> int:
    with conn.cursor() as cur:
        cur.execute("DELETE FROM cluster_momentum_72h")
        cur.execute(
            """
            WITH clusters AS (
              SELECT semantic_cluster AS cluster_name,
                COUNT(*) FILTER (WHERE published_at >= NOW()-INTERVAL '72 hours')::int AS a72,
                COUNT(*) FILTER (WHERE published_at >= NOW()-INTERVAL '48 hours')::int AS a48,
                COUNT(*) FILTER (WHERE published_at >= NOW()-INTERVAL '24 hours')::int AS a24,
                COUNT(*) FILTER (WHERE published_at >= NOW()-INTERVAL '6 hours')::int AS a6,
                COUNT(*) FILTER (WHERE published_at >= NOW()-INTERVAL '1 hour')::int AS a1,
                COUNT(DISTINCT published_at::date)::int AS days_active
              FROM article_intelligence
              WHERE local_embedding IS NOT NULL AND semantic_cluster IS NOT NULL
                AND published_at >= NOW()-INTERVAL '72 hours'
              GROUP BY semantic_cluster
            )
            INSERT INTO cluster_momentum_72h (
              cluster_name, cluster_id, window_start, window_end,
              articles_72h, articles_48h, articles_24h, articles_6h, articles_1h,
              velocity, velocity_label, momentum_score, days_active, is_sustained, calculated_at
            )
            SELECT cluster_name, cluster_name, NOW()-INTERVAL '72 hours', NOW(), a72,a48,a24,a6,a1,
              ROUND((a6 / GREATEST(a72 / 12.0, 1.0))::numeric, 3)::float8,
              CASE WHEN a6 >= GREATEST(5, a72*0.35) THEN 'surging'
                   WHEN a24 >= GREATEST(4, a72*0.50) THEN 'rising'
                   WHEN a6=0 AND a24 < GREATEST(2,a72*0.15) THEN 'cooling' ELSE 'steady' END,
              LEAST(100, ROUND((a1*12 + a6*5 + a24*1.5 + a72*0.25)::numeric,2))::float8,
              days_active, days_active >= 3, NOW()
            FROM clusters
            ON CONFLICT (cluster_name) DO UPDATE SET
              cluster_id=EXCLUDED.cluster_id, window_start=EXCLUDED.window_start,
              window_end=EXCLUDED.window_end, articles_72h=EXCLUDED.articles_72h,
              articles_48h=EXCLUDED.articles_48h, articles_24h=EXCLUDED.articles_24h,
              articles_6h=EXCLUDED.articles_6h, articles_1h=EXCLUDED.articles_1h,
              velocity=EXCLUDED.velocity, velocity_label=EXCLUDED.velocity_label,
              momentum_score=EXCLUDED.momentum_score, days_active=EXCLUDED.days_active,
              is_sustained=EXCLUDED.is_sustained, calculated_at=NOW()
            """
        )

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            SELECT semantic_cluster, title, source_type, sentiment_score, sentiment_label,
                   priority_score, published_at
            FROM article_intelligence
            WHERE local_embedding IS NOT NULL AND published_at >= NOW()-INTERVAL '72 hours'
            ORDER BY semantic_cluster, priority_score DESC NULLS LAST, published_at DESC
            """
        )
        groups: dict[str, list[dict]] = defaultdict(list)
        for row in cur.fetchall():
            groups[row["semantic_cluster"]].append(dict(row))

    with conn.cursor() as cur:
        # Reset endpoint-visible legacy summaries; the semantic rows below are
        # rebuilt in the same transaction.
        cur.execute("UPDATE cluster_summaries SET article_count=0,momentum_score=0,is_spike=FALSE")
        for cluster, items in groups.items():
            headlines = list(dict.fromkeys(item["title"] for item in items if item["title"]))[:3]
            avg = sum(float(item["sentiment_score"] or 0) for item in items) / max(1, len(items))
            sources = Counter(item["source_type"] or "unknown" for item in items)
            cur.execute("SELECT momentum_score, velocity_label FROM cluster_momentum_72h WHERE cluster_name=%s", (cluster,))
            mrow = cur.fetchone() or (0.0, "steady")
            momentum = float(mrow[0] or 0)
            human = cluster.replace("_", " ").title()
            if headlines:
                summary = f"{human} is {mrow[1] or 'steady'}: {headlines[0]}."
                if len(headlines) > 1:
                    summary += " Also in focus: " + "; ".join(headlines[1:]) + "."
            else:
                summary = f"{human} has active Formula One coverage."
            cur.execute(
                """
                INSERT INTO cluster_summaries (
                  cluster_id,cluster_name,summary,key_themes,article_count,source_breakdown,
                  momentum_score,sentiment_avg,sentiment_label,is_spike,z_score,priority,
                  last_updated,summary_generated_at
                ) VALUES (%s,%s,%s,%s,%s,%s::jsonb,%s,%s,%s,%s,%s,%s,NOW(),NOW())
                ON CONFLICT (cluster_id) DO UPDATE SET
                  cluster_name=EXCLUDED.cluster_name, summary=EXCLUDED.summary,
                  key_themes=EXCLUDED.key_themes, article_count=EXCLUDED.article_count,
                  source_breakdown=EXCLUDED.source_breakdown, momentum_score=EXCLUDED.momentum_score,
                  sentiment_avg=EXCLUDED.sentiment_avg, sentiment_label=EXCLUDED.sentiment_label,
                  is_spike=EXCLUDED.is_spike, z_score=EXCLUDED.z_score,
                  priority=EXCLUDED.priority, last_updated=NOW(), summary_generated_at=NOW()
                """,
                (cluster, cluster, summary, headlines, len(items), psycopg2.extras.Json(dict(sources)),
                 momentum, avg, sentiment_label(avg), momentum >= 70, round(momentum / 20, 2),
                 "P0" if momentum >= 85 else "P1" if momentum >= 70 else "P2" if momentum >= 45 else "P3"),
            )
    conn.commit()
    return len(groups)


def refresh_daily_briefing(conn) -> int:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """SELECT * FROM cluster_summaries WHERE article_count>0
               ORDER BY momentum_score DESC NULLS LAST,article_count DESC LIMIT 1"""
        )
        cluster = cur.fetchone()
        cur.execute(
            """SELECT title,semantic_cluster,sentiment_score,sentiment_label,priority_score
               FROM article_intelligence WHERE local_embedding IS NOT NULL
                 AND published_at>=NOW()-INTERVAL '72 hours'
               ORDER BY priority_score DESC NULLS LAST,published_at DESC LIMIT 5"""
        )
        articles = cur.fetchall()
        cur.execute(
            """SELECT * FROM driver_sentiment_daily WHERE entity_type='driver' AND date=CURRENT_DATE
               ORDER BY mention_count DESC,sentiment_avg DESC NULLS LAST LIMIT 1"""
        )
        driver = cur.fetchone()
        cur.execute(
            """SELECT * FROM regulatory_risk_score
               WHERE calculated_at>=NOW()-INTERVAL '24 hours'
               ORDER BY risk_score DESC NULLS LAST LIMIT 1"""
        )
        risk = cur.fetchone()
    if not articles:
        return 0
    avg = sum(float(row["sentiment_score"] or 0) for row in articles) / len(articles)
    headline = articles[0]["title"] or "F1 intelligence feed is updating"
    top_cluster = cluster["cluster_name"] if cluster else articles[0]["semantic_cluster"]
    lead = cluster["summary"] if cluster else headline
    story_summary = " | ".join(row["title"] for row in articles[:3] if row["title"])
    driver_spotlight = (
        f"{driver['driver_name']} leads current driver coverage with {driver['mention_count']} mentions."
        if driver else "No single driver dominates current coverage."
    )
    controversy_note = (
        f"{risk['entity_name']} is the leading regulatory watch: {risk['watchlist_reason']}"
        if risk else "No elevated regulatory watch signal is active."
    )
    what_to_watch = "Watch " + ", ".join(row["title"] for row in articles[1:4] if row["title"])
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO daily_briefings (briefing_date,headline,lead_paragraph,top_story_summary,
              driver_spotlight,controversy_note,what_to_watch,top_cluster,top_driver,total_signals,
              breaking_count,avg_sentiment,sentiment_label,active_spike_count,top_controversy_entity,
              top_controversy_score,generated_at,model_used,generation_skipped,skip_reason)
            VALUES (CURRENT_DATE,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW(),
              'neon-local-v2',FALSE,NULL)
            ON CONFLICT (briefing_date) DO UPDATE SET headline=EXCLUDED.headline,
              lead_paragraph=EXCLUDED.lead_paragraph,top_story_summary=EXCLUDED.top_story_summary,
              driver_spotlight=EXCLUDED.driver_spotlight,controversy_note=EXCLUDED.controversy_note,
              what_to_watch=EXCLUDED.what_to_watch,top_cluster=EXCLUDED.top_cluster,
              top_driver=EXCLUDED.top_driver,total_signals=EXCLUDED.total_signals,
              breaking_count=EXCLUDED.breaking_count,avg_sentiment=EXCLUDED.avg_sentiment,
              sentiment_label=EXCLUDED.sentiment_label,active_spike_count=EXCLUDED.active_spike_count,
              top_controversy_entity=EXCLUDED.top_controversy_entity,
              top_controversy_score=EXCLUDED.top_controversy_score,generated_at=NOW(),
              model_used='neon-local-v2',generation_skipped=FALSE,skip_reason=NULL
            """,
            (headline,lead,story_summary,driver_spotlight,controversy_note,what_to_watch,top_cluster,
             driver["driver_name"] if driver else None,len(articles),
             sum(float(row["priority_score"] or 0)>=85 for row in articles),avg,sentiment_label(avg),
             sum(bool(row["is_spike"]) for row in [cluster] if row),
             risk["entity_name"] if risk else None,float(risk["risk_score"] or 0) if risk else 0),
        )
    conn.commit()
    return 1


def matching_entities(text: str) -> list[tuple[str, str]]:
    return [
        (name, entity_type)
        for name, (entity_type, patterns) in ENTITIES.items()
        if any(re.search(pattern, text, re.I) for pattern in patterns)
    ]


def refresh_entity_sentiment_and_risk(conn) -> tuple[int, int]:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            SELECT ai.guid, ai.title, COALESCE(e.summary,'') AS summary, ai.semantic_cluster,
                   ai.sentiment_score, ai.sentiment_label, ai.priority_score,
                   ARRAY_REMOVE(ARRAY_AGG(DISTINCT rt.regulatory_tag), NULL) AS tags
            FROM article_intelligence ai
            LEFT JOIN event_f1_only e ON e.url=ai.guid
            LEFT JOIN regulatory_tags rt ON rt.guid=ai.guid
            WHERE ai.local_embedding IS NOT NULL AND ai.published_at >= NOW()-INTERVAL '14 days'
            GROUP BY ai.guid,ai.title,e.summary,ai.semantic_cluster,ai.sentiment_score,
                     ai.sentiment_label,ai.priority_score
            """
        )
        articles = cur.fetchall()

    grouped: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for article in articles:
        text = f"{article['title'] or ''} {article['summary'] or ''}"
        for entity in matching_entities(text):
            grouped[entity].append(dict(article))

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT * FROM weekend_state WHERE id=1")
        state = cur.fetchone()
    race_round = int(state["next_race_round"]) if state else 0
    race_name = state["next_race_name"] if state else None

    sentiment_rows = risk_rows = 0
    with conn.cursor() as cur:
        for (name, entity_type), items in grouped.items():
            scores = [float(item["sentiment_score"] or 0) for item in items]
            avg = sum(scores) / len(scores)
            labels = Counter(item["sentiment_label"] or "neutral" for item in items)
            top_cluster = Counter(item["semantic_cluster"] for item in items).most_common(1)[0][0]
            cur.execute("SELECT sentiment_avg FROM driver_sentiment_daily WHERE driver_name=%s AND entity_type=%s AND date=CURRENT_DATE-1", (name, entity_type))
            previous = cur.fetchone()
            delta = avg - float(previous[0]) if previous and previous[0] is not None else 0.0
            cur.execute(
                """
                INSERT INTO driver_sentiment_daily (driver_name,entity_type,date,sentiment_avg,sentiment_delta,
                  sentiment_label,mention_count,positive_count,negative_count,neutral_count,top_cluster)
                VALUES (%s,%s,CURRENT_DATE,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (driver_name,entity_type,date) DO UPDATE SET
                  sentiment_avg=EXCLUDED.sentiment_avg,sentiment_delta=EXCLUDED.sentiment_delta,
                  sentiment_label=EXCLUDED.sentiment_label,mention_count=EXCLUDED.mention_count,
                  positive_count=EXCLUDED.positive_count,negative_count=EXCLUDED.negative_count,
                  neutral_count=EXCLUDED.neutral_count,top_cluster=EXCLUDED.top_cluster
                """,
                (name, entity_type, avg, delta, sentiment_label(avg), len(items), labels["positive"],
                 labels["negative"], labels["neutral"], top_cluster),
            )
            sentiment_rows += 1

            tagged = [item for item in items if item["tags"]]
            investigations = sum("INVESTIGATION" in item["tags"] for item in tagged)
            penalties = sum("PENALTY" in item["tags"] for item in tagged)
            fia_notices = sum(bool(item["tags"]) for item in tagged)
            investigation_score = min(100.0, investigations * 18.0)
            penalty_score = min(100.0, penalties * 20.0)
            fia_score = min(100.0, fia_notices * 5.0)
            controversy = min(100.0, labels["negative"] * 6.0 + len(tagged) * 5.0)
            risk = min(100.0, investigation_score * 0.35 + penalty_score * 0.35 + fia_score * 0.15 + controversy * 0.15)
            if risk <= 0:
                continue
            risk_label = "critical" if risk >= 75 else "high" if risk >= 50 else "medium" if risk >= 25 else "low"
            reasons = []
            if investigations: reasons.append(f"{investigations} investigation signal{'s' if investigations != 1 else ''}")
            if penalties: reasons.append(f"{penalties} penalty signal{'s' if penalties != 1 else ''}")
            if fia_notices: reasons.append(f"{fia_notices} regulatory mention{'s' if fia_notices != 1 else ''}")
            cur.execute(
                """
                INSERT INTO regulatory_risk_score (entity_name,entity_type,race_round,race_name,
                  investigation_score,penalty_score,fia_notice_score,controversy_score,risk_score,risk_label,
                  active_investigations,recent_penalties,fia_notices_7d,watchlist_reason,calculated_at)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW())
                ON CONFLICT (entity_name,entity_type,race_round) DO UPDATE SET
                  race_name=EXCLUDED.race_name,investigation_score=EXCLUDED.investigation_score,
                  penalty_score=EXCLUDED.penalty_score,fia_notice_score=EXCLUDED.fia_notice_score,
                  controversy_score=EXCLUDED.controversy_score,risk_score=EXCLUDED.risk_score,
                  risk_label=EXCLUDED.risk_label,active_investigations=EXCLUDED.active_investigations,
                  recent_penalties=EXCLUDED.recent_penalties,fia_notices_7d=EXCLUDED.fia_notices_7d,
                  watchlist_reason=EXCLUDED.watchlist_reason,calculated_at=NOW()
                """,
                (name, entity_type, race_round, race_name, investigation_score, penalty_score,
                 fia_score, controversy, risk, risk_label, investigations, penalties,
                 fia_notices, "; ".join(reasons)),
            )
            risk_rows += 1
    conn.commit()
    return sentiment_rows, risk_rows


def refresh_weekend_state(conn) -> dict | None:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            SELECT * FROM race_calendar
            WHERE season=EXTRACT(YEAR FROM CURRENT_DATE)::int
              AND COALESCE(race_start_utc + INTERVAL '3 hours', race_date::timestamp + INTERVAL '23 hours') >= NOW()
            ORDER BY race_date LIMIT 1
            """
        )
        race = cur.fetchone()
        if not race:
            return None
        session = (
            "RACE" if race["race_date"] == date.today() else
            "SPRINT" if race["sprint_date"] == date.today() else
            "QUALIFYING" if race["quali_date"] == date.today() else
            "FP3" if race["fp3_date"] == date.today() else
            "FP2" if race["fp2_date"] == date.today() else
            "FP1" if race["fp1_date"] == date.today() else
            "RACE_WEEK" if 0 <= (race["race_date"] - date.today()).days <= 5 else None
        )
        days = (race["race_date"] - date.today()).days
        cur.execute(
            """
            INSERT INTO weekend_state (id,is_race_week,days_until_race,next_race_round,next_race_name,
              next_race_circuit,next_race_city,next_race_country,next_race_flag,next_race_date,
              next_race_start_utc,is_sprint_weekend,circuit_length_km,race_laps,lap_record,
              lap_record_holder,drs_zones,fp1_today,fp2_today,fp3_today,quali_today,sprint_today,
              race_today,current_session,updated_at)
            VALUES (1,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW())
            ON CONFLICT (id) DO UPDATE SET
              is_race_week=EXCLUDED.is_race_week,days_until_race=EXCLUDED.days_until_race,
              next_race_round=EXCLUDED.next_race_round,next_race_name=EXCLUDED.next_race_name,
              next_race_circuit=EXCLUDED.next_race_circuit,next_race_city=EXCLUDED.next_race_city,
              next_race_country=EXCLUDED.next_race_country,next_race_flag=EXCLUDED.next_race_flag,
              next_race_date=EXCLUDED.next_race_date,next_race_start_utc=EXCLUDED.next_race_start_utc,
              is_sprint_weekend=EXCLUDED.is_sprint_weekend,circuit_length_km=EXCLUDED.circuit_length_km,
              race_laps=EXCLUDED.race_laps,lap_record=EXCLUDED.lap_record,
              lap_record_holder=EXCLUDED.lap_record_holder,drs_zones=EXCLUDED.drs_zones,
              fp1_today=EXCLUDED.fp1_today,fp2_today=EXCLUDED.fp2_today,fp3_today=EXCLUDED.fp3_today,
              quali_today=EXCLUDED.quali_today,sprint_today=EXCLUDED.sprint_today,
              race_today=EXCLUDED.race_today,current_session=EXCLUDED.current_session,updated_at=NOW()
            """,
            (days <= 5, days, race["round"], race["race_name"], race["circuit_name"], race["city"],
             race["country"], race["flag_emoji"], race["race_date"], race["race_start_utc"],
             race["is_sprint_weekend"], race["circuit_length_km"], race["race_laps"], race["lap_record"],
             race["lap_record_holder"], race["drs_zones"], race["fp1_date"] == date.today(),
             race["fp2_date"] == date.today(), race["fp3_date"] == date.today(),
             race["quali_date"] == date.today(), race["sprint_date"] == date.today(),
             race["race_date"] == date.today(), session),
        )
    conn.commit()
    return dict(race)


def session_for(text: str) -> str:
    for session, pattern in SESSION_RULES:
        if re.search(pattern, text, re.I):
            return session
    return "GENERAL"


def refresh_session_chatter(conn, race: dict | None) -> int:
    if not race or (race["race_date"] - date.today()).days > 5:
        log.info("Session chatter idle until race week")
        return 0
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            SELECT ai.guid,ai.title,COALESCE(e.summary,'') AS summary,ai.source_type,
                   ai.semantic_cluster,ai.sentiment_score,ai.sentiment_label,ai.priority_score,
                   ai.published_at
            FROM article_intelligence ai JOIN event_f1_only e ON e.url=ai.guid
            WHERE ai.local_embedding IS NOT NULL AND ai.published_at >= NOW()-INTERVAL '5 days'
            ORDER BY ai.published_at DESC LIMIT 300
            """
        )
        articles = cur.fetchall()
    rows = []
    place_terms = [race.get("city"), race.get("country"), race.get("circuit_name"), race.get("race_name")]
    for article in articles:
        text = f"{article['title'] or ''} {article['summary'] or ''}"
        session = session_for(text)
        place_match = any(term and term.lower().replace("grand prix", "").strip() in text.lower() for term in place_terms)
        relevance = min(1.0, 0.25 + (0.4 if place_match else 0) + (0.3 if session != "GENERAL" else 0))
        if not place_match and session == "GENERAL":
            continue
        rows.append((article["guid"],article["title"],article["summary"],article["source_type"],
                     article["semantic_cluster"],article["sentiment_score"],article["sentiment_label"],
                     article["priority_score"],article["published_at"],race["round"],race["race_name"],
                     race["circuit_name"],session,relevance,0))
    if rows:
        with conn.cursor() as cur:
            psycopg2.extras.execute_values(
                cur,
                """INSERT INTO session_chatter (guid,title,summary,source_type,cluster_name,sentiment_score,
                   sentiment_label,priority_score,published_at,race_round,race_name,circuit_name,
                   session_relevance,relevance_score,engagement_score,created_at) VALUES %s
                   ON CONFLICT (guid,race_round) DO UPDATE SET title=EXCLUDED.title,summary=EXCLUDED.summary,
                   cluster_name=EXCLUDED.cluster_name,sentiment_score=EXCLUDED.sentiment_score,
                   sentiment_label=EXCLUDED.sentiment_label,priority_score=EXCLUDED.priority_score,
                   session_relevance=EXCLUDED.session_relevance,relevance_score=EXCLUDED.relevance_score,
                   created_at=NOW()""",
                rows,
                template="(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW())",
            )
    conn.commit()
    return len(rows)


def refresh_pre_race(conn, race: dict | None) -> int:
    if not race:
        return 0
    round_no = race["round"]
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT * FROM cluster_momentum_72h ORDER BY momentum_score DESC NULLS LAST LIMIT 1")
        momentum = cur.fetchone()
        cur.execute("SELECT * FROM regulatory_risk_score WHERE race_round=%s ORDER BY risk_score DESC NULLS LAST LIMIT 1", (round_no,))
        risk = cur.fetchone()
        cur.execute("SELECT * FROM driver_sentiment_daily WHERE entity_type='driver' ORDER BY date DESC,sentiment_avg DESC NULLS LAST LIMIT 1")
        sentiment = cur.fetchone()
        cur.execute("SELECT driver_code,predicted_position,podium_probability,model_version FROM predictions WHERE season=%s AND round=%s ORDER BY predicted_at DESC,predicted_position LIMIT 3", (race["season"],round_no))
        predictions = cur.fetchall()
        cur.execute("SELECT COUNT(*) AS count FROM session_chatter WHERE race_round=%s AND published_at >= NOW()-INTERVAL '5 days'", (round_no,))
        signals = int(cur.fetchone()["count"])
        cur.execute("SELECT COUNT(*) AS count FROM regulatory_risk_score WHERE race_round=%s AND risk_score >= 25", (round_no,))
        controversies = int(cur.fetchone()["count"])

    days = (race["race_date"] - date.today()).days
    top_cluster = momentum["cluster_name"] if momentum else "GENERAL_F1"
    top_driver = sentiment["driver_name"] if sentiment else None
    top_risk = risk["entity_name"] if risk else None
    overview = f"{race['race_name']} at {race['circuit_name']} is {days} day{'s' if days != 1 else ''} away. "
    overview += f"The strongest news theme is {top_cluster.replace('_',' ').lower()}."
    watchlist = risk["watchlist_reason"] if risk and risk["watchlist_reason"] else "No elevated regulatory risk is currently detected."
    if predictions:
        form = "Current model order: " + ", ".join(f"{row['driver_code']} P{row['predicted_position']}" for row in predictions) + "."
        battles = "Front-running focus: " + " vs ".join(row["driver_code"] for row in predictions[:3]) + "."
    else:
        form = "The race prediction model has not published this round yet."
        battles = "Key battles will sharpen when practice and qualifying data arrive."
    controversy = f"{controversies} active regulatory-risk signal{'s' if controversies != 1 else ''} are on the watchlist."
    preview = "Session chatter is live for race week." if days <= 5 else f"Session chatter activates when the race is five days away; currently {days} days remain."
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO pre_race_intelligence (race_round,race_name,race_date,weekend_overview,
              regulatory_watchlist,form_guide,controversy_radar,key_battles,session_preview,
              top_risk_entity,top_risk_score,top_momentum_cluster,top_sentiment_driver,
              active_controversies,total_weekend_signals,generated_at,model_used,regen_triggered,regen_reason)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW(),'neon-local-v2',TRUE,'scheduled incremental refresh')
            ON CONFLICT (race_round) DO UPDATE SET race_name=EXCLUDED.race_name,race_date=EXCLUDED.race_date,
              weekend_overview=EXCLUDED.weekend_overview,regulatory_watchlist=EXCLUDED.regulatory_watchlist,
              form_guide=EXCLUDED.form_guide,controversy_radar=EXCLUDED.controversy_radar,
              key_battles=EXCLUDED.key_battles,session_preview=EXCLUDED.session_preview,
              top_risk_entity=EXCLUDED.top_risk_entity,top_risk_score=EXCLUDED.top_risk_score,
              top_momentum_cluster=EXCLUDED.top_momentum_cluster,top_sentiment_driver=EXCLUDED.top_sentiment_driver,
              active_controversies=EXCLUDED.active_controversies,total_weekend_signals=EXCLUDED.total_weekend_signals,
              generated_at=NOW(),model_used='neon-local-v2',regen_triggered=TRUE,
              regen_reason='scheduled incremental refresh'
            """,
            (round_no,race["race_name"],race["race_date"],overview,watchlist,form,controversy,battles,
             preview,top_risk,float(risk["risk_score"] or 0) if risk else 0,top_cluster,top_driver,
             controversies,signals),
        )
    conn.commit()
    return 1


def log_run(conn, stats: dict, duration: float, status: str, error: str | None = None) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """INSERT INTO pipeline_run_log (run_at,articles_processed,clusters_summarized,
               spikes_detected,drivers_updated,duration_seconds,status,error_message,snowflake_credits_used)
               VALUES (NOW(),%s,%s,0,%s,%s,%s,%s,0)""",
            (stats.get("embedded",0),stats.get("clusters",0),stats.get("sentiment",0),duration,status,error),
        )
    conn.commit()


def run(args) -> dict:
    started = time.time()
    stats: dict[str, int] = {}
    with psycopg2.connect(database_url()) as conn:
        apply_migration(conn)
        before = database_size(conn)
        stats["database_bytes_before"] = before
        stats["pruned"] = prune_old_embeddings(conn)
        race = refresh_weekend_state(conn)

        candidates = fetch_embedding_candidates(conn, args.max_articles)
        if args.skip_embeddings:
            log.info("Embeddings explicitly skipped")
            stats["embedded"] = 0
        elif before >= STORAGE_GUARD_BYTES:
            log.warning("Database is %.1f MB; storage guard stopped new embeddings", before / 1024 / 1024)
            stats["embedded"] = 0
            stats["storage_guard_triggered"] = 1
        else:
            cache_dir = os.path.expanduser(os.getenv("FASTEMBED_CACHE_PATH", "~/.cache/fastembed"))
            stats["embedded"] = embed_articles(conn, candidates, cache_dir)

        stats["regulatory_tags"] = refresh_regulatory_tags(conn)
        stats["clusters"] = refresh_momentum_and_summaries(conn)
        stats["sentiment"], stats["risk"] = refresh_entity_sentiment_and_risk(conn)
        stats["briefing"] = refresh_daily_briefing(conn)
        stats["chatter"] = refresh_session_chatter(conn, race)
        stats["pre_race"] = refresh_pre_race(conn, race)
        stats["database_bytes_after"] = database_size(conn)
        log_run(conn, stats, time.time()-started, "neon_v2:success")
    return stats


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--max-articles", type=int, default=DEFAULT_BATCH_SIZE)
    parser.add_argument("--skip-embeddings", action="store_true")
    args = parser.parse_args()
    try:
        stats = run(args)
    except Exception as exc:
        log.exception("Neon intelligence v2 failed: %s", exc)
        return 1
    log.info("Completed: %s", stats)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
