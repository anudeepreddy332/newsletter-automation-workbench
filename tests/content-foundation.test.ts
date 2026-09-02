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

  assert.equal(batch.publication.id, "publication_benzinga_shaped_fixture");
  assert.equal(batch.stories.length, 2);
  const firstStory = batch.stories[0];
  assert.ok(firstStory);
  assert.deepEqual(firstStory, {
    id: "story_6c43c8a1944281017858d68b",
    publicationId: "publication_benzinga_shaped_fixture",
    title: "Aurora Grid Reports Higher Storage Orders",
    summary:
      "Aurora Grid said quarterly storage orders rose after a fictional utility contract.",
    canonicalUrl:
      "https://fixture.example.test/news/aurora-grid-storage-orders",
    imageUrl: "https://images.example.test/aurora-grid.jpg",
    publishedAt: "2026-09-02T03:30:00.000Z",
    sourceAuthor: "Fixture Market Desk",
    sourceItemId: "fixture-aurora-grid-2026-09-02",
  });
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

test("normalized stories persist and reload without identifier corruption", () => {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "newsletter-poc-"));
  const databasePath = path.join(temporaryDirectory, "content.db");

  try {
    const batch = parseBenzingaShapedRss(readFileSync(fixturePath, "utf8"));
    const { client, db } = openContentDatabase(databasePath);
    applyContentFoundationMigrations(db);
    const repository = new ContentRepository(db);

    repository.savePublication(batch.publication);
    repository.saveStories(batch.stories);

    assert.deepEqual(repository.listStories(batch.publication.id), [
      ...batch.stories,
    ].sort((left, right) => left.id.localeCompare(right.id)));

    client.close();
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
