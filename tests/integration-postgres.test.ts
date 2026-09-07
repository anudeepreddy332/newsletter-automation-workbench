import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test, { type TestContext } from "node:test";
import { Client } from "pg";

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
import { contentFeeds, offers, stories } from "@/src/integration/postgres/schema";

const DEFAULT_LOCAL_URL =
  "postgres://integration:integration@127.0.0.1:5433/newsletter_integration";

const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";

type PostgresProbe =
  | { ok: true; url: string }
  | { ok: false; reason: string };

let postgresProbe: PostgresProbe | undefined;

function pgCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  if ("code" in error && typeof error.code === "string") {
    return error.code;
  }

  if ("cause" in error) {
    return pgCode(error.cause);
  }

  return undefined;
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
        "Config tests still run; these Postgres tests are skipped, not passed.",
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
  run: (handle: IntegrationDatabaseHandle) => Promise<void>,
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

  const handle = openIntegrationDatabase(urlWithDatabase(adminUrl, databaseName));
  try {
    await run(handle);
  } finally {
    await handle.close();
    try {
      await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    } finally {
      await admin.end();
    }
  }
}

async function listPublicTables(handle: IntegrationDatabaseHandle): Promise<string[]> {
  const result = await handle.pool.query<{ table_name: string }>(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_catalog = current_database()
       AND table_schema = 'public'
       AND table_name = ANY($1)
     ORDER BY table_name`,
    [["content_feeds", "offers", "stories"]],
  );
  return result.rows.map((row) => row.table_name);
}

async function insertFeed(handle: IntegrationDatabaseHandle, id = "feed_1"): Promise<void> {
  await handle.db.insert(contentFeeds).values({
    id,
    name: "Fixture Feed",
    sourceKind: "rss",
  });
}

test("clean Postgres migration creates integration tables", async (t) => {
  const adminUrl = await requirePostgres(t);
  if (!adminUrl) {
    return;
  }

  await withIsolatedIntegrationDatabase(adminUrl, async (handle) => {
    await applyIntegrationMigrations(handle.db);
    assert.deepEqual(await listPublicTables(handle), ["content_feeds", "offers", "stories"]);
  });
});

test("Postgres migrations can be applied repeatedly", async (t) => {
  const adminUrl = await requirePostgres(t);
  if (!adminUrl) {
    return;
  }

  await withIsolatedIntegrationDatabase(adminUrl, async (handle) => {
    await applyIntegrationMigrations(handle.db);
    await applyIntegrationMigrations(handle.db);
    assert.deepEqual(await listPublicTables(handle), ["content_feeds", "offers", "stories"]);
    await insertFeed(handle);
  });
});

test("content_feeds primary key is unique", async (t) => {
  const adminUrl = await requirePostgres(t);
  if (!adminUrl) {
    return;
  }

  await withIsolatedIntegrationDatabase(adminUrl, async (handle) => {
    await applyIntegrationMigrations(handle.db);
    await insertFeed(handle);
    await assert.rejects(
      () =>
        handle.db.insert(contentFeeds).values({
          id: "feed_1",
          name: "Duplicate Feed",
          sourceKind: "rss",
        }),
      (error: unknown) => pgCode(error) === UNIQUE_VIOLATION,
    );
  });
});

test("stories require a content_feeds foreign key", async (t) => {
  const adminUrl = await requirePostgres(t);
  if (!adminUrl) {
    return;
  }

  await withIsolatedIntegrationDatabase(adminUrl, async (handle) => {
    await applyIntegrationMigrations(handle.db);
    const storyValues = {
      id: "story_1",
      contentFeedId: "missing_feed",
      title: "Title",
      summary: "Summary",
      canonicalUrl: "https://fixture.example.test/story-1",
      publishedAt: new Date("2026-09-02T03:30:00.000Z"),
    };

    await assert.rejects(
      () => handle.db.insert(stories).values(storyValues),
      (error: unknown) => pgCode(error) === FOREIGN_KEY_VIOLATION,
    );

    await insertFeed(handle);
    await handle.db.insert(stories).values({
      ...storyValues,
      contentFeedId: "feed_1",
    });
  });
});

test("stories canonical URL is unique", async (t) => {
  const adminUrl = await requirePostgres(t);
  if (!adminUrl) {
    return;
  }

  await withIsolatedIntegrationDatabase(adminUrl, async (handle) => {
    await applyIntegrationMigrations(handle.db);
    await insertFeed(handle);
    const canonicalUrl = "https://fixture.example.test/unique-story";
    await handle.db.insert(stories).values({
      id: "story_1",
      contentFeedId: "feed_1",
      title: "First",
      summary: "Summary",
      canonicalUrl,
      publishedAt: new Date("2026-09-02T03:30:00.000Z"),
    });
    await assert.rejects(
      () =>
        handle.db.insert(stories).values({
          id: "story_2",
          contentFeedId: "feed_1",
          title: "Second",
          summary: "Summary",
          canonicalUrl,
          publishedAt: new Date("2026-09-02T04:30:00.000Z"),
        }),
      (error: unknown) => pgCode(error) === UNIQUE_VIOLATION,
    );
  });
});

test("offers source and source_offer_id are unique together", async (t) => {
  const adminUrl = await requirePostgres(t);
  if (!adminUrl) {
    return;
  }

  await withIsolatedIntegrationDatabase(adminUrl, async (handle) => {
    await applyIntegrationMigrations(handle.db);
    const offer = {
      source: "everflow",
      sourceOfferId: "src-1",
      advertiserName: "Harborline Savings",
      offerName: "High-yield savings account review",
      status: "active",
      trackingUrl: "https://offers-fixture.test/track/harborline-savings",
    };
    await handle.db.insert(offers).values({ id: "offer_1", ...offer });
    await assert.rejects(
      () => handle.db.insert(offers).values({ id: "offer_2", ...offer }),
      (error: unknown) => pgCode(error) === UNIQUE_VIOLATION,
    );
    await handle.db.insert(offers).values({
      id: "offer_3",
      ...offer,
      source: "other",
    });
  });
});

test("content_feeds, stories, and offers exist in the same Postgres database", async (t) => {
  const adminUrl = await requirePostgres(t);
  if (!adminUrl) {
    return;
  }

  await withIsolatedIntegrationDatabase(adminUrl, async (handle) => {
    await applyIntegrationMigrations(handle.db);
    const result = await handle.pool.query<{
      table_name: string;
      table_catalog: string;
    }>(
      `SELECT table_name, table_catalog
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = ANY($1)
       ORDER BY table_name`,
      [["content_feeds", "offers", "stories"]],
    );

    assert.equal(result.rows.length, 3);
    assert.equal(new Set(result.rows.map((row) => row.table_catalog)).size, 1);
    assert.deepEqual(
      result.rows.map((row) => row.table_name),
      ["content_feeds", "offers", "stories"],
    );

    await insertFeed(handle);
    await handle.db.insert(stories).values({
      id: "story_1",
      contentFeedId: "feed_1",
      title: "Title",
      summary: "Summary",
      canonicalUrl: "https://fixture.example.test/same-db",
      publishedAt: new Date("2026-09-02T03:30:00.000Z"),
    });
    await handle.db.insert(offers).values({
      id: "offer_1",
      source: "everflow",
      sourceOfferId: "src-same-db",
      advertiserName: "Acme",
      offerName: "Offer",
      status: "active",
      trackingUrl: "https://offers-fixture.test/track/acme",
    });
  });
});
