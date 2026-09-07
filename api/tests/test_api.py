from datetime import datetime, timezone
from pathlib import Path
import os
import subprocess

from fastapi.testclient import TestClient
import pytest

from newsletter_integration_api.db import DatabaseUnavailable
from newsletter_integration_api.main import app
from newsletter_integration_api.models import (
    EMPTY_CONTENT_FEED,
    StoriesResponse,
    StoryModel,
    utc_timestamp,
)

client = TestClient(app)
ROOT = Path(__file__).resolve().parents[2]
DEFAULT_LOCAL_URL = "postgres://integration:integration@127.0.0.1:5433/newsletter_integration"


def test_health_success(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("newsletter_integration_api.main.ping_database", lambda: None)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert "postgres://" not in response.text


def test_health_database_unavailable(monkeypatch: pytest.MonkeyPatch) -> None:
    def fail() -> None:
        raise DatabaseUnavailable()

    monkeypatch.setattr("newsletter_integration_api.main.ping_database", fail)
    response = client.get("/health")
    assert response.status_code == 503
    assert response.json() == {"status": "unavailable"}
    assert "password" not in response.text
    assert "INTEGRATION_DATABASE_URL" not in response.text
    assert "postgres://" not in response.text


def five_story_catalog() -> StoriesResponse:
    fixture = StoriesResponse.model_validate_json(
        (ROOT / "tests/fixtures/integration-stories-response.json").read_text(),
    )
    assert len(fixture.stories) == 5
    return fixture


def test_stories_returns_five_fixture_stories(monkeypatch: pytest.MonkeyPatch) -> None:
    catalog = five_story_catalog()
    monkeypatch.setattr("newsletter_integration_api.main.read_stories_catalog", lambda: catalog)
    response = client.get("/stories")
    assert response.status_code == 200
    body = response.json()
    assert body["contentFeed"]["id"] == "content_feed_benzinga_shaped_fixture"
    assert len(body["stories"]) == 5
    assert [story["id"] for story in body["stories"]][0] == "story_6c43c8a1944281017858d68b"
    assert "body" in body["stories"][0]
    assert body["stories"][1]["imageUrl"] is None
    assert body["stories"][1]["sourceAuthor"] is None


def test_stories_empty_database(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "newsletter_integration_api.main.read_stories_catalog",
        lambda: StoriesResponse(contentFeed=EMPTY_CONTENT_FEED, stories=[]),
    )
    response = client.get("/stories")
    assert response.status_code == 200
    body = response.json()
    assert body["stories"] == []
    assert body["contentFeed"]["sourceKind"] == "rss"
    assert body["contentFeed"]["id"] == "content_feed_unsynchronized"


def test_timestamp_and_optional_field_serialization() -> None:
    timestamp = utc_timestamp(datetime(2026, 9, 2, 3, 30, tzinfo=timezone.utc))
    assert timestamp == "2026-09-02T03:30:00.000Z"
    story = StoryModel(
        id="story_optional",
        contentFeedId="feed_1",
        title="Title",
        summary="Summary",
        body=None,
        canonicalUrl="https://fixture.example.test/story",
        imageUrl=None,
        publishedAt=timestamp,
        sourceAuthor=None,
        sourceItemId=None,
    )
    dumped = story.model_dump()
    assert dumped["body"] is None
    assert dumped["imageUrl"] is None
    assert dumped["sourceAuthor"] is None
    assert dumped["publishedAt"] == "2026-09-02T03:30:00.000Z"


def test_stories_sanitized_database_unavailable(monkeypatch: pytest.MonkeyPatch) -> None:
    def fail() -> StoriesResponse:
        raise DatabaseUnavailable()

    monkeypatch.setattr("newsletter_integration_api.main.read_stories_catalog", fail)
    response = client.get("/stories")
    assert response.status_code == 503
    body = response.json()
    assert body == {
        "error": "Stories catalog is temporarily unavailable.",
        "code": "DATABASE_UNAVAILABLE",
    }
    assert "traceback" not in response.text.lower()
    assert "postgres://" not in response.text


def test_stories_sanitized_internal_error(monkeypatch: pytest.MonkeyPatch) -> None:
    def fail() -> StoriesResponse:
        raise RuntimeError("password=supersecret postgres://integration:integration@127.0.0.1/db")

    monkeypatch.setattr("newsletter_integration_api.main.read_stories_catalog", fail)
    response = client.get("/stories")
    assert response.status_code == 500
    assert response.json() == {
        "error": "Stories catalog could not be loaded.",
        "code": "INTERNAL_ERROR",
    }
    assert "supersecret" not in response.text
    assert "postgres://" not in response.text
    assert "password=" not in response.text


def _postgres_available() -> str | None:
    url = os.environ.get("INTEGRATION_DATABASE_URL", "").strip() or DEFAULT_LOCAL_URL
    try:
        import psycopg

        with psycopg.connect(url, connect_timeout=2) as connection:
            connection.execute("SELECT 1")
        return url
    except Exception:
        return None


@pytest.mark.skipif(_postgres_available() is None, reason="Postgres is not available")
def test_stories_returns_five_synchronized_postgres_stories(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    admin_url = _postgres_available()
    assert admin_url is not None
    import psycopg
    from psycopg import sql

    database_name = f"ihd_api_{os.urandom(4).hex()}"
    admin = psycopg.connect(admin_url, autocommit=True)
    try:
        admin.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(database_name)))
        parsed = admin_url.rsplit("/", 1)[0] + f"/{database_name}"
        env = {**os.environ, "INTEGRATION_DATABASE_URL": parsed}
        subprocess.run(
            ["npm", "run", "integration:db:migrate"],
            cwd=ROOT,
            env=env,
            check=True,
            capture_output=True,
            text=True,
        )
        subprocess.run(
            ["npm", "run", "integration:sync", "--", "stories"],
            cwd=ROOT,
            env=env,
            check=True,
            capture_output=True,
            text=True,
        )
        monkeypatch.setenv("INTEGRATION_DATABASE_URL", parsed)
        from newsletter_integration_api.catalog import read_stories_catalog as live_read

        catalog = live_read()
        assert len(catalog.stories) == 5
        response = TestClient(app).get("/stories")
        assert response.status_code == 200
        body = response.json()
        assert len(body["stories"]) == 5
        assert all(story["publishedAt"].endswith("Z") for story in body["stories"])
        assert body["stories"][1]["imageUrl"] is None
    finally:
        admin.execute(
            sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(sql.Identifier(database_name)),
        )
        admin.close()
