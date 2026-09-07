from __future__ import annotations

import psycopg

from newsletter_integration_api.db import DatabaseUnavailable, connect
from newsletter_integration_api.models import (
    EMPTY_CONTENT_FEED,
    ContentFeedModel,
    StoriesResponse,
    StoryModel,
    utc_timestamp,
)


def ping_database() -> None:
    connection = connect()
    try:
        connection.execute("SELECT 1")
    except psycopg.Error:
        raise DatabaseUnavailable() from None
    finally:
        connection.close()


def _content_feed_from_row(row: dict[str, object]) -> ContentFeedModel:
    source_kind = row["source_kind"]
    if source_kind != "rss":
        raise RuntimeError("unsupported source kind")
    return ContentFeedModel(
        id=str(row["id"]),
        name=str(row["name"]),
        sourceKind="rss",
    )


def read_stories_catalog() -> StoriesResponse:
    connection = connect()
    try:
        try:
            feeds = connection.execute(
                "SELECT id, name, source_kind FROM content_feeds ORDER BY id",
            ).fetchall()
            rows = connection.execute(
                """
                SELECT id, content_feed_id, title, summary, body, canonical_url,
                       image_url, published_at, source_author, source_item_id
                FROM stories
                ORDER BY published_at ASC, id ASC
                """,
            ).fetchall()
        except psycopg.Error:
            raise DatabaseUnavailable() from None
    finally:
        connection.close()

    stories = [
        StoryModel(
            id=row["id"],
            contentFeedId=row["content_feed_id"],
            title=row["title"],
            summary=row["summary"],
            body=row["body"],
            canonicalUrl=row["canonical_url"],
            imageUrl=row["image_url"],
            publishedAt=utc_timestamp(row["published_at"]),
            sourceAuthor=row["source_author"],
            sourceItemId=row["source_item_id"],
        )
        for row in rows
    ]

    if stories:
        feed_id = stories[0].contentFeedId
        feed_row = next((feed for feed in feeds if feed["id"] == feed_id), None)
        if feed_row is None:
            raise DatabaseUnavailable()
        return StoriesResponse(contentFeed=_content_feed_from_row(feed_row), stories=stories)

    if feeds:
        return StoriesResponse(contentFeed=_content_feed_from_row(feeds[0]), stories=[])

    return StoriesResponse(contentFeed=EMPTY_CONTENT_FEED, stories=[])
