import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  BenzingaShapedFixtureSource,
  parseBenzingaShapedRss,
} from "@/src/adapters/rss/benzinga-shaped-rss";
import { ContentSourceError } from "@/src/content/content-source";
import { openContentDatabase } from "@/src/db/database";
import { applyContentFoundationMigrations } from "@/src/db/migrate";
import { ContentRepository } from "@/src/repositories/content-repository";

const fixturePath = path.join(
  process.cwd(),
  "tests/fixtures/benzinga-shaped-financial-news.xml",
);

test("RSS fixture parsing returns the expected normalized stories", async () => {
  const source = new BenzingaShapedFixtureSource(fixturePath);
  const batch = await source.read();

  assert.equal(batch.contentFeed.id, "content_feed_benzinga_shaped_fixture");
  assert.equal(batch.stories.length, 5);
  assert.deepEqual(
    batch.stories.map(({ id, title, publishedAt }) => ({ id, title, publishedAt })),
    [
      {
        id: "story_6c43c8a1944281017858d68b",
        title: "Aurora Grid Reports Higher Storage Orders",
        publishedAt: "2026-09-02T03:30:00.000Z",
      },
      {
        id: "story_5c6a67b4a9b7cb360ddc7877",
        title: "Northline Retail Updates Its Seasonal Outlook",
        publishedAt: "2026-09-02T05:00:00.000Z",
      },
      {
        id: "story_f4144563fa09bd90887c8750",
        title: "Calder Ridge Bank Expands Small-Business Lending Pilot",
        publishedAt: "2026-09-02T06:15:00.000Z",
      },
      {
        id: "story_93f71084652e4497fce59719",
        title: "Meridian Freight Trims Annual Fuel-Cost Forecast",
        publishedAt: "2026-09-02T07:40:00.000Z",
      },
      {
        id: "story_59126e4750a900a3ba188f34",
        title: "Harborlight Foods Plans Regional Distribution Hub",
        publishedAt: "2026-09-02T09:05:00.000Z",
      },
    ],
  );

  assert.equal(new Set(batch.stories.map((story) => story.summary)).size, 5);
  assert.equal(new Set(batch.stories.map((story) => story.body)).size, 5);
  for (const story of batch.stories) {
    assert.ok(story.body);
    assert.ok(story.body.length > 600);
    assert.equal(story.body.split(/\n{2,}/).length, 4);
    assert.doesNotMatch(story.body, /<[^>]+>/);
  }

  const firstStory = batch.stories[0];
  assert.ok(firstStory);
  assert.equal(firstStory.contentFeedId, "content_feed_benzinga_shaped_fixture");
  assert.equal(
    firstStory.summary,
    "Aurora Grid said quarterly storage orders rose after a new utility contract expanded its project backlog.",
  );
  assert.equal(firstStory.canonicalUrl, "https://fixture.example.test/news/aurora-grid-storage-orders");
  assert.equal(firstStory.imageUrl, "https://images.example.test/aurora-grid.jpg");
  assert.equal(firstStory.sourceAuthor, "Market Desk");
  assert.equal(firstStory.sourceItemId, "fixture-aurora-grid-2026-09-02");
  assert.match(firstStory.body ?? "", /^Aurora Grid reported a rise in quarterly orders/);
});

test("normalization is deterministic for the same fixture", () => {
  const xml = readFileSync(fixturePath, "utf8");

  assert.deepEqual(parseBenzingaShapedRss(xml), parseBenzingaShapedRss(xml));
});

test("optional image and author values do not crash normalization", () => {
  const xml = readFileSync(fixturePath, "utf8");
  const batch = parseBenzingaShapedRss(xml);

  assert.equal(batch.stories[1]?.imageUrl, undefined);
  assert.equal(batch.stories[1]?.sourceAuthor, undefined);
  assert.equal(batch.stories[1]?.title, "Northline Retail Updates Its Seasonal Outlook");
  assert.equal(batch.stories[2]?.imageUrl, undefined);
  assert.equal(batch.stories[2]?.sourceAuthor, "Elena Park");
  assert.equal(batch.stories[3]?.sourceAuthor, undefined);
  assert.equal(batch.stories[3]?.imageUrl, "https://images.example.test/meridian-freight.jpg");
});

test("optional story body content normalizes safely when absent", () => {
  const xmlWithoutFirstBody = readFileSync(fixturePath, "utf8").replace(
    /\s*<content:encoded><!\[CDATA\[[\s\S]*?\]\]><\/content:encoded>/,
    "",
  );
  const batch = parseBenzingaShapedRss(xmlWithoutFirstBody);

  assert.equal(batch.stories.length, 5);
  assert.equal(batch.stories[0]?.body, undefined);
  assert.ok(batch.stories[1]?.body);
});

test("valid HTTPS URLs pass normalization", () => {
  const batch = parseBenzingaShapedRss(readFileSync(fixturePath, "utf8"));

  assert.equal(
    batch.stories[0]?.canonicalUrl,
    "https://fixture.example.test/news/aurora-grid-storage-orders",
  );
});

test("HTTP content URLs are rejected clearly", () => {
  const httpUrlFixture = readFileSync(fixturePath, "utf8").replace(
    "https://fixture.example.test/news/aurora-grid-storage-orders",
    "http://fixture.example.test/news/aurora-grid-storage-orders",
  );

  assert.throws(
    () => parseBenzingaShapedRss(httpUrlFixture),
    (error: unknown) =>
      error instanceof ContentSourceError &&
      error.code === "INVALID_ITEM" &&
      error.message === "RSS item 1 canonical URL must use HTTPS.",
  );
});

test("malformed content URLs are rejected clearly", () => {
  const malformedUrlFixture = readFileSync(fixturePath, "utf8").replace(
    "https://fixture.example.test/news/aurora-grid-storage-orders",
    "not a URL",
  );

  assert.throws(
    () => parseBenzingaShapedRss(malformedUrlFixture),
    (error: unknown) =>
      error instanceof ContentSourceError &&
      error.code === "INVALID_ITEM" &&
      error.message === "RSS item 1 has an invalid canonical URL.",
  );
});

test("malformed RSS fails with a sanitized content-source error", () => {
  const malformedXml = readFileSync(
    path.join(process.cwd(), "tests/fixtures/malformed-rss.xml"),
    "utf8",
  );

  assert.throws(
    () => parseBenzingaShapedRss(malformedXml),
    (error: unknown) =>
      error instanceof ContentSourceError &&
      error.code === "MALFORMED_XML" &&
      error.message === "RSS fixture XML is malformed.",
  );
});

test("all normalized stories and bodies persist and reload without corruption", () => {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "newsletter-poc-"));
  const databasePath = path.join(temporaryDirectory, "content.db");

  try {
    const batch = parseBenzingaShapedRss(readFileSync(fixturePath, "utf8"));
    const { client, db } = openContentDatabase(databasePath);
    applyContentFoundationMigrations(db);
    const repository = new ContentRepository(db);

    repository.saveContentFeed(batch.contentFeed);
    repository.saveStories(batch.stories);

    const reloadedStories = repository.listStories(batch.contentFeed.id);
    assert.deepEqual(reloadedStories, [
      ...batch.stories,
    ].sort((left, right) => left.id.localeCompare(right.id)));
    assert.equal(reloadedStories.length, 5);
    assert.ok(reloadedStories.every((story) => story.body && story.body.length > 600));

    client.close();
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
