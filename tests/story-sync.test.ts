import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { Client } from "pg";

import {
  BenzingaShapedFixtureSource,
  parseBenzingaShapedRss,
} from "@/src/adapters/rss/benzinga-shaped-rss";
import { ContentSourceError, type ContentSource } from "@/src/content/content-source";
import type { NormalizedContentBatch, Story } from "@/src/domain/story";
import {
  INTEGRATION_DATABASE_URL_ENV,
  IntegrationDatabaseConfigError,
  readIntegrationDatabaseUrl,
} from "@/src/integration/postgres/config";
import {
  openIntegrationDatabase,
  type IntegrationDatabaseHandle,
} from "@/src/integration/postgres/database";
import { applyIntegrationMigrations } from "@/src/integration/postgres/migrate";
import { contentFeeds, stories } from "@/src/integration/postgres/schema";
import {
  IntegrationStoryIdentityConflictError,
  IntegrationStoryRepository,
} from "@/src/integration/postgres/story-repository";
import {
  INTEGRATION_RSS_FIXTURE_PATH,
  syncRssStoriesToPostgres,
} from "@/src/integration/story-sync";

const DEFAULT_LOCAL_URL =
  "postgres://integration:integration@127.0.0.1:5433/newsletter_integration";

const EXPECTED_STORY_IDS = [
  "story_6c43c8a1944281017858d68b",
  "story_5c6a67b4a9b7cb360ddc7877",
  "story_f4144563fa09bd90887c8750",
  "story_93f71084652e4497fce59719",
  "story_59126e4750a900a3ba188f34",
] as const;

type PostgresProbe =
  | { ok: true; url: string }
  | { ok: false; reason: string };

let postgresProbe: PostgresProbe | undefined;

function sortStories(items: readonly Story[]): Story[] {
  return [...items].sort((left, right) => left.id.localeCompare(right.id));
}

function urlWithDatabase(url: string, databaseName: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${databaseName}`;
  return parsed.toString();
}

async function canConnect(url: string): Promise<boolean> {
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 2000 });
  try {
    await client.connect();
    await client.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function probeIntegrationPostgres(): Promise<PostgresProbe> {
  const configured = process.env[INTEGRATION_DATABASE_URL_ENV]?.trim();
  if (configured) {
    try {
      const url = readIntegrationDatabaseUrl();
      if (await canConnect(url)) {
        return { ok: true, url };
      }
      return {
        ok: false,
        reason:
          "INTEGRATION_DATABASE_URL is set but Postgres is unreachable. " +
            "Integration validation is blocked by the environment; these tests were skipped, not passed.",
      };
    } catch (error) {
      if (error instanceof IntegrationDatabaseConfigError) {
        return { ok: false, reason: error.message };
      }
      throw error;
    }
  }

  if (await canConnect(DEFAULT_LOCAL_URL)) {
    return { ok: true, url: DEFAULT_LOCAL_URL };
  }

  return {
    ok: false,
    reason:
      "Postgres is not available (INTEGRATION_DATABASE_URL unset and 127.0.0.1:5433 unreachable). " +
        "Start it with: docker compose -f compose.integration.yml up -d. " +
        "Parser tests still run; these Postgres tests are skipped, not passed.",
  };
}

async function requirePostgres(t: TestContext): Promise<string | null> {
  postgresProbe ??= await probeIntegrationPostgres();
  if (!postgresProbe.ok) {
    t.skip(postgresProbe.reason);
    return null;
  }
  return postgresProbe.url;
}

async function withIsolatedIntegrationDatabase(
  adminUrl: string,
  run: (handle: IntegrationDatabaseHandle, testUrl: string) => Promise<void>,
): Promise<void> {
  const databaseName = `ihd_test_${randomBytes(6).toString("hex")}`;
  const admin = new Client({ connectionString: adminUrl, connectionTimeoutMillis: 5000 });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${databaseName}"`);
  } catch (error) {
    await admin.end().catch(() => undefined);
    throw error;
  }

  const testUrl = urlWithDatabase(adminUrl, databaseName);
  const handle = openIntegrationDatabase(testUrl);
  try {
    await applyIntegrationMigrations(handle.db);
    await run(handle, testUrl);
  } finally {
    await handle.close();
    try {
      await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    } finally {
      await admin.end();
    }
  }
}

test("existing RSS parser still produces the expected five stories", async () => {
  const source = new BenzingaShapedFixtureSource(INTEGRATION_RSS_FIXTURE_PATH);
  const batch = await source.read();

  assert.equal(batch.contentFeed.id, "content_feed_benzinga_shaped_fixture");
  assert.equal(batch.stories.length, 5);
  assert.deepEqual(
    batch.stories.map((story) => story.id),
    [...EXPECTED_STORY_IDS],
  );
});

test("existing required-field validation still works", () => {
  const xml = readFileSync(INTEGRATION_RSS_FIXTURE_PATH, "utf8").replace(
    "<title>Aurora Grid Reports Higher Storage Orders</title>",
    "<title></title>",
  );

  assert.throws(
    () => parseBenzingaShapedRss(xml),
    (error: unknown) =>
      error instanceof ContentSourceError &&
      error.code === "INVALID_ITEM" &&
      error.message === "RSS item 1 is missing a required title value.",
  );
});

test("normalization remains unchanged", () => {
  const xml = readFileSync(INTEGRATION_RSS_FIXTURE_PATH, "utf8");
  const first = parseBenzingaShapedRss(xml);
  const second = parseBenzingaShapedRss(xml);

  assert.deepEqual(first, second);
  assert.equal(
    first.stories[0]?.canonicalUrl,
    "https://fixture.example.test/news/aurora-grid-storage-orders",
  );
  assert.equal(first.stories[0]?.publishedAt, "2026-09-02T03:30:00.000Z");
  assert.equal(first.stories[0]?.id, EXPECTED_STORY_IDS[0]);
  assert.equal(first.stories[0]?.sourceItemId, "fixture-aurora-grid-2026-09-02");
});

test("first sync produces exactly five Postgres stories", async (t) => {
  const adminUrl = await requirePostgres(t);
  if (!adminUrl) {
    return;
  }

  await withIsolatedIntegrationDatabase(adminUrl, async (handle) => {
    const result = await syncRssStoriesToPostgres({ db: handle.db });
    const repository = new IntegrationStoryRepository(handle.db);
    const stored = await repository.listStories();

    assert.equal(result.processed, 5);
    assert.equal(result.stored, 5);
    assert.equal(stored.length, 5);
    assert.deepEqual(
      stored.map((story) => story.id).sort(),
      [...EXPECTED_STORY_IDS].sort(),
    );
  });
});

test("second identical sync still produces exactly five Postgres stories", async (t) => {
  const adminUrl = await requirePostgres(t);
  if (!adminUrl) {
    return;
  }

  await withIsolatedIntegrationDatabase(adminUrl, async (handle) => {
    await syncRssStoriesToPostgres({ db: handle.db });
    const second = await syncRssStoriesToPostgres({ db: handle.db });
    const repository = new IntegrationStoryRepository(handle.db);

    assert.equal(second.processed, 5);
    assert.equal(second.stored, 5);
    assert.equal(await repository.countStories(), 5);
  });
});

test("stable Story ID updates the same row", async (t) => {
  const adminUrl = await requirePostgres(t);
  if (!adminUrl) {
    return;
  }

  await withIsolatedIntegrationDatabase(adminUrl, async (handle) => {
    const original = await new BenzingaShapedFixtureSource(INTEGRATION_RSS_FIXTURE_PATH).read();
    await syncRssStoriesToPostgres({ db: handle.db });

    const updatedTitle = "Aurora Grid Reports Higher Storage Orders (updated)";
    const updatedBatch: NormalizedContentBatch = {
      contentFeed: original.contentFeed,
      stories: original.stories.map((story) =>
        story.id === EXPECTED_STORY_IDS[0] ? { ...story, title: updatedTitle } : story,
      ),
    };
    const source: ContentSource = { read: async () => updatedBatch };
    await syncRssStoriesToPostgres({ db: handle.db, source });

    const repository = new IntegrationStoryRepository(handle.db);
    const stored = await repository.listStories();
    const updated = stored.find((story) => story.id === EXPECTED_STORY_IDS[0]);

    assert.equal(stored.length, 5);
    assert.equal(updated?.title, updatedTitle);
    assert.equal(updated?.canonicalUrl, original.stories[0]?.canonicalUrl);
  });
});

test("canonical URL collision with a conflicting ID fails explicitly", async (t) => {
  const adminUrl = await requirePostgres(t);
  if (!adminUrl) {
    return;
  }

  await withIsolatedIntegrationDatabase(adminUrl, async (handle) => {
    const original = await new BenzingaShapedFixtureSource(INTEGRATION_RSS_FIXTURE_PATH).read();
    await syncRssStoriesToPostgres({ db: handle.db });

    const conflicting: NormalizedContentBatch = {
      contentFeed: original.contentFeed,
      stories: original.stories.map((story, index) =>
        index === 0 ? { ...story, id: "story_conflicting_identity" } : story,
      ),
    };

    await assert.rejects(
      () => syncRssStoriesToPostgres({ db: handle.db, source: { read: async () => conflicting } }),
      (error: unknown) =>
        error instanceof IntegrationStoryIdentityConflictError &&
        error.existingId === EXPECTED_STORY_IDS[0] &&
        error.incomingId === "story_conflicting_identity",
    );

    const repository = new IntegrationStoryRepository(handle.db);
    const stored = await repository.listStories();
    assert.equal(stored.length, 5);
    assert.ok(stored.some((story) => story.id === EXPECTED_STORY_IDS[0]));
    assert.ok(!stored.some((story) => story.id === "story_conflicting_identity"));
  });
});

test("failed batch rolls back completely", async (t) => {
  const adminUrl = await requirePostgres(t);
  if (!adminUrl) {
    return;
  }

  await withIsolatedIntegrationDatabase(adminUrl, async (handle) => {
    const original = await new BenzingaShapedFixtureSource(INTEGRATION_RSS_FIXTURE_PATH).read();
    const fourthStory = original.stories[3];
    assert.ok(fourthStory);

    await handle.db.insert(contentFeeds).values({
      id: original.contentFeed.id,
      name: original.contentFeed.name,
      sourceKind: original.contentFeed.sourceKind,
    });
    await handle.db.insert(stories).values({
      id: "story_preexisting_conflict",
      contentFeedId: original.contentFeed.id,
      title: "Preexisting conflict",
      summary: "Should remain after rollback",
      canonicalUrl: fourthStory.canonicalUrl,
      publishedAt: new Date(fourthStory.publishedAt),
    });

    await assert.rejects(
      () => syncRssStoriesToPostgres({ db: handle.db }),
      IntegrationStoryIdentityConflictError,
    );

    const repository = new IntegrationStoryRepository(handle.db);
    const stored = await repository.listStories();
    assert.equal(stored.length, 1);
    assert.equal(stored[0]?.id, "story_preexisting_conflict");
    assert.ok(!EXPECTED_STORY_IDS.slice(0, 3).some((id) => stored.some((story) => story.id === id)));
  });
});

test("persisted fields survive reopening the database connection", async (t) => {
  const adminUrl = await requirePostgres(t);
  if (!adminUrl) {
    return;
  }

  await withIsolatedIntegrationDatabase(adminUrl, async (handle, testUrl) => {
    const original = await new BenzingaShapedFixtureSource(INTEGRATION_RSS_FIXTURE_PATH).read();
    await syncRssStoriesToPostgres({ db: handle.db });
    await handle.close();

    const reopened = openIntegrationDatabase(testUrl);
    try {
      const stored = await new IntegrationStoryRepository(reopened.db).listStories();
      assert.deepEqual(sortStories(stored), sortStories(original.stories));
    } finally {
      await reopened.close();
    }
  });
});

test("missing INTEGRATION_DATABASE_URL fails safely", () => {
  const env = { ...process.env };
  delete env[INTEGRATION_DATABASE_URL_ENV];
  const result = spawnSync(
    path.join(process.cwd(), "node_modules/.bin/tsx"),
    ["scripts/sync-integration.ts", "stories"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env,
    },
  );

  assert.notEqual(result.status, 0);
  const output = `${result.stdout}\n${result.stderr}`;
  assert.match(output, /INTEGRATION_DATABASE_URL is required/);
  assert.doesNotMatch(output, /postgres:\/\/[^i]/);
});
