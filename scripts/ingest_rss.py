#!/usr/bin/env python3
"""
ingest_rss.py — pulls latest F1 articles into Snowflake RAW.RSS_ITEMS

Run manually:
  python3 ingest_rss.py

Recommended env vars in .env:
  SNOWFLAKE_USER=...
  SNOWFLAKE_PASSWORD=...
  SNOWFLAKE_ACCOUNT=...
  SNOWFLAKE_WAREHOUSE=...
  SNOWFLAKE_DATABASE=F1_BULLETIN
  SNOWFLAKE_ROLE=SYSADMIN

Notes
-----
- Dedupes using payload:guid_hash::STRING
- guid_hash is built from:
    entry.id -> entry.link -> title|published_at fallback
- Stores raw normalized payload as VARIANT in RAW.RSS_ITEMS
"""

import os
import json
import time
import hashlib
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any, Dict, Optional, Tuple

import feedparser
import snowflake.connector
from dotenv import load_dotenv

load_dotenv()

FEEDS = [

# ---------------------------
# Official F1
# ---------------------------
("formula1-official", "https://www.formula1.com/en/latest/all.xml"),

# ---------------------------
# Major Motorsport Journalism
# ---------------------------
("autosport", "https://www.autosport.com/rss/f1/news/"),
("motorsport", "https://www.motorsport.com/rss/f1/news/"),
("the-race", "https://www.the-race.com/formula-1/feed/"),
("racefans", "https://www.racefans.net/feed/"),
("planetf1", "https://www.planetf1.com/feed/"),
("crash", "https://www.crash.net/rss/f1"),
("racer", "https://racer.com/category/f1/feed/"),
("grandprix247", "https://grandprix247.com/feed"),
("f1i", "https://f1i.com/feed"),

# ---------------------------
# Mainstream Sports Media
# ---------------------------
("bbc-f1", "https://feeds.bbci.co.uk/sport/formula1/rss.xml"),
("espn-f1", "https://www.espn.com/espn/rss/f1/news"),
("skysports-f1", "https://www.skysports.com/rss/12040"),

# ---------------------------
# Automotive / General Media
# ---------------------------
("jalopnik-f1", "https://jalopnik.com/tag/formula-1/rss"),
("motor1-f1", "https://www.motor1.com/rss/news/all/"),
("roadandtrack-f1", "https://www.roadandtrack.com/rss/all.xml"),

# ---------------------------
# Analysis / Commentary
# ---------------------------
("autosport-features", "https://www.autosport.com/rss/f1/features/"),
("motorsport-analysis", "https://www.motorsport.com/rss/f1/features/"),
("the-race-analysis", "https://www.the-race.com/formula-1/category/analysis/feed/"),

# ---------------------------
# Community / Social
# ---------------------------
("reddit-f1-new", "https://www.reddit.com/r/formula1/new/.rss"),
("reddit-f1-hot", "https://www.reddit.com/r/formula1/hot/.rss"),
("reddit-f1technical", "https://www.reddit.com/r/F1Technical/new/.rss"),

# ---------------------------
# Additional News Coverage
# ---------------------------
("gpblog", "https://www.gpblog.com/en/rss.xml"),
("formula1news", "https://formula1news.co.uk/feed/"),
("racingnews365", "https://racingnews365.com/feed"),

]

USER_AGENT = "F1Bulletin/1.0 (+local ingestion)"

MAX_ENTRIES_PER_FEED = 100
REQUEST_TIMEOUT_SECONDS = 20


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def safe_get(entry: Any, key: str, default: Any = None) -> Any:
    return getattr(entry, key, default)


def parse_published_to_iso(value: Optional[str]) -> Optional[str]:
    """
    Try to normalize feed published/updated string to UTC ISO-8601.
    If parsing fails, return the original string.
    """
    if not value:
        return None

    try:
        dt = parsedate_to_datetime(value)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat()
    except Exception:
        return value


def normalize_entry(entry: Any) -> Dict[str, Any]:
    published_raw = safe_get(entry, "published", None) or safe_get(entry, "updated", None)

    author = safe_get(entry, "author", None)
    category = None
    tags = safe_get(entry, "tags", None)
    if tags and isinstance(tags, list) and len(tags) > 0:
        category = safe_get(tags[0], "term", None)

    payload = {
        "title": safe_get(entry, "title", None),
        "link": safe_get(entry, "link", None),
        "published_at": parse_published_to_iso(published_raw),
        "published_raw": published_raw,
        "summary": safe_get(entry, "summary", None),
        "id": safe_get(entry, "id", None),
        "author": author,
        "category": category,
    }

    return payload


def build_guid(payload: Dict[str, Any]) -> Tuple[str, str]:
    """
    Returns:
      guid_source: description of which field was used
      guid: stable string used to generate guid_hash
    """
    if payload.get("id"):
        return "id", str(payload["id"]).strip()

    if payload.get("link"):
        return "link", str(payload["link"]).strip()

    fallback = f"{payload.get('title', '')}|{payload.get('published_at', '')}"
    return "title+published_at", fallback.strip()


def hash_guid(guid: str) -> str:
    return hashlib.md5(guid.encode("utf-8")).hexdigest()


def sf_connect():
    return snowflake.connector.connect(
        user=os.getenv("SNOWFLAKE_USER"),
        password=os.getenv("SNOWFLAKE_PASSWORD"),
        account=os.getenv("SNOWFLAKE_ACCOUNT", "ypatcae-ur62720"),
        warehouse=os.getenv("SNOWFLAKE_WAREHOUSE", "COMPUTE_WH"),
        database=os.getenv("SNOWFLAKE_DATABASE", "F1_BULLETIN"),
        schema="RAW",
        role=os.getenv("SNOWFLAKE_ROLE", "SYSADMIN"),
        paramstyle="qmark",
        client_session_keep_alive=True,
    )


def ensure_session(cur) -> None:
    cur.execute("USE DATABASE IDENTIFIER(?)", (os.getenv("SNOWFLAKE_DATABASE", "F1_BULLETIN"),))
    cur.execute("USE SCHEMA RAW")


def check_table_exists(cur) -> None:
    cur.execute("""
        SELECT COUNT(*)
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = 'RAW'
          AND TABLE_NAME = 'RSS_ITEMS'
    """)
    exists = cur.fetchone()[0]
    if not exists:
        raise RuntimeError("RAW.RSS_ITEMS does not exist. Create the table first.")


def maybe_add_columns_notice(cur) -> None:
    """
    Not altering schema here since your current insert uses only:
      (source, feed_url, payload)

    Just a reminder if you want stronger relational querying later.
    """
    pass


def fetch_feed(source_name: str, feed_url: str):
    print(f"  Fetching {source_name}...")
    start = time.time()

    feed = feedparser.parse(
        feed_url,
        request_headers={"User-Agent": USER_AGENT},
    )

    elapsed = time.time() - start

    status = getattr(feed, "status", None)
    version = getattr(feed, "version", None)
    bozo = getattr(feed, "bozo", 0)

    print(f"    status={status} version={version or 'unknown'} entries={len(feed.entries)} fetched_in={elapsed:.2f}s")

    if bozo:
        print(f"    parser warning: {feed.bozo_exception}")

    return feed


def record_exists(cur, guid_hash: str) -> bool:
    cur.execute(
        "SELECT COUNT(*) FROM RSS_ITEMS WHERE payload:guid_hash::STRING = ?",
        (guid_hash,),
    )
    return cur.fetchone()[0] > 0


def insert_record(cur, source_name: str, feed_url: str, payload: Dict[str, Any]) -> None:
    cur.execute(
        "INSERT INTO RSS_ITEMS (source, feed_url, payload) SELECT ?, ?, PARSE_JSON(?)",
        (source_name, feed_url, json.dumps(payload, ensure_ascii=False)),
    )


def ingest_feed(cur, source_name: str, feed_url: str) -> int:
    feed = fetch_feed(source_name, feed_url)
    fetched_at = utc_now_iso()

    inserted = 0
    skipped = 0
    fallback_guid_count = 0
    missing_title_count = 0
    parse_error_count = 0

    entries = feed.entries[:MAX_ENTRIES_PER_FEED]

    preview_titles = []
    for entry in entries[:3]:
        title = safe_get(entry, "title", None)
        if title:
            preview_titles.append(title.strip()[:100])

    if preview_titles:
        print("    preview:")
        for i, title in enumerate(preview_titles, start=1):
            print(f"      {i}. {title}")

    for entry in entries:
        try:
            payload = normalize_entry(entry)

            if not payload.get("title"):
                missing_title_count += 1

            guid_source, guid = build_guid(payload)
            if guid_source == "title+published_at":
                fallback_guid_count += 1

            if not guid:
                parse_error_count += 1
                continue

            guid_hash = hash_guid(guid)

            payload["guid_source"] = guid_source
            payload["guid_hash"] = guid_hash
            payload["fetched_at_utc"] = fetched_at
            payload["feed_url"] = feed_url
            payload["source_name"] = source_name

            if record_exists(cur, guid_hash):
                skipped += 1
                continue

            insert_record(cur, source_name, feed_url, payload)
            inserted += 1

        except Exception as e:
            parse_error_count += 1
            print(f"    entry parse/insert warning: {e}")

    print(
        f"    → inserted={inserted} skipped={skipped} "
        f"fallback_guid={fallback_guid_count} missing_title={missing_title_count} "
        f"errors={parse_error_count}"
    )
    return inserted


def print_source_counts(cur) -> None:
    print("\nCurrent counts by source:")
    cur.execute("""
        SELECT source, COUNT(*) AS n
        FROM RSS_ITEMS
        GROUP BY 1
        ORDER BY 2 DESC, 1
    """)
    for source, n in cur.fetchall():
        print(f"  {source:<20} {n}")


def print_latest_by_source(cur) -> None:
    print("\nLatest published_at by source:")
    cur.execute("""
        SELECT
            source,
            MAX(TRY_TO_TIMESTAMP_TZ(payload:published_at::STRING)) AS latest_published
        FROM RSS_ITEMS
        GROUP BY 1
        ORDER BY latest_published DESC NULLS LAST
    """)
    for source, latest in cur.fetchall():
        print(f"  {source:<20} {latest}")


def print_recent_rows(cur, limit: int = 10) -> None:
    print(f"\nMost recent {limit} ingested rows:")
    cur.execute(f"""
        SELECT
            source,
            payload:title::STRING AS title,
            payload:published_at::STRING AS published_at,
            payload:guid_source::STRING AS guid_source
        FROM RSS_ITEMS
        ORDER BY TRY_TO_TIMESTAMP_TZ(payload:fetched_at_utc::STRING) DESC
        LIMIT {limit}
    """)
    rows = cur.fetchall()
    for source, title, published_at, guid_source in rows:
        short_title = (title or "NO TITLE")[:100]
        print(f"  [{source}] {short_title} | published_at={published_at} | guid={guid_source}")


def main():
    account = os.getenv("SNOWFLAKE_ACCOUNT", "ypatcae-ur62720")
    print(f"Connecting to Snowflake ({account})...")

    con = sf_connect()
    total_inserted = 0

    try:
        cur = con.cursor()
        ensure_session(cur)
        check_table_exists(cur)
        maybe_add_columns_notice(cur)

        cur.execute("SELECT COUNT(*) FROM RSS_ITEMS")
        before = cur.fetchone()[0]
        print(f"RSS_ITEMS before: {before}\n")

        for source_name, feed_url in FEEDS:
            try:
                total_inserted += ingest_feed(cur, source_name, feed_url)
            except Exception as e:
                print(f"  ⚠ {source_name} failed: {e}")

        con.commit()

        cur.execute("SELECT COUNT(*) FROM RSS_ITEMS")
        after = cur.fetchone()[0]

        print(f"\n✅ Done. Inserted {total_inserted} new items.")
        print(f"RSS_ITEMS total: {after}")

        print_source_counts(cur)
        print_latest_by_source(cur)
        print_recent_rows(cur, limit=10)

    finally:
        con.close()

    if total_inserted > 0:
        print("\nNext step:")
        print("  1. Run intelligence_pipeline.sql in Snowflake Worksheets")
        print("  2. Run sync scripts to push data to Neon")
    else:
        print("\nNo new items inserted.")
        print("This may be normal if feeds have not published new content since the last run.")


if __name__ == "__main__":
    main()