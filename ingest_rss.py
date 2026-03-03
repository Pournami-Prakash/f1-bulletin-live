import os
import json
from datetime import datetime, timezone

import feedparser
import snowflake.connector
from dotenv import load_dotenv

load_dotenv()

FEEDS = [
    # Start with a couple; we’ll expand once pipeline works
    ("Formula 1 (News)", "https://www.formula1.com/en/latest/all.xml"),
    ("Reddit F1 (RSS mirror)", "https://www.reddit.com/r/formula1/.rss"),
]

def sf_connect():
    return snowflake.connector.connect(
        user=os.getenv("SNOWFLAKE_USER"),
        password=os.getenv("SNOWFLAKE_PASSWORD"),
        account=os.getenv("SNOWFLAKE_ACCOUNT"),
        warehouse=os.getenv("SNOWFLAKE_WAREHOUSE"),
        database=os.getenv("SNOWFLAKE_DATABASE"),
        schema=os.getenv("SNOWFLAKE_SCHEMA"),
        role=os.getenv("SNOWFLAKE_ROLE"),
        paramstyle="qmark",
        client_session_keep_alive=True,
    )


def normalize_entry(entry):
    # Feedparser fields vary by feed; keep it resilient
    published = None
    if getattr(entry, "published", None):
        published = entry.published
    elif getattr(entry, "updated", None):
        published = entry.updated

    return {
        "title": getattr(entry, "title", None),
        "link": getattr(entry, "link", None),
        "published_at": published,
        "summary": getattr(entry, "summary", None),
        "id": getattr(entry, "id", None),
    }

def ingest_feed(cur, source_name, feed_url):
    feed = feedparser.parse(feed_url)
    fetched_at = datetime.now(timezone.utc).isoformat()

    rows = []
    for entry in feed.entries[:50]:
        payload = normalize_entry(entry)
        payload["fetched_at_utc"] = fetched_at
        payload["feed_url"] = feed_url
        rows.append((source_name, feed_url, json.dumps(payload, ensure_ascii=False)))

    sql = """
    INSERT INTO RSS_ITEMS (source, feed_url, payload)
    SELECT ?, ?, PARSE_JSON(?)
    """
    for r in rows:
        cur.execute(sql, r)


def main():
    con = sf_connect()
    try:
        cur = con.cursor()
        for source_name, feed_url in FEEDS:
            ingest_feed(cur, source_name, feed_url)
        con.commit()
        print("✅ Ingestion completed.")
    finally:
        con.close()

if __name__ == "__main__":
    main()
