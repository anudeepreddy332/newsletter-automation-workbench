import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { Client } from "pg";

import {
  IntegrationOfferSyncError,
  MOCK_EVERFLOW_OFFERS_FIXTURE_PATH,
  MockEverflowOfferFixtureSource,
  integrationOfferId,
  parseMockEverflowOffers,
} from "@/src/integration/offers/fixture-source";
import { MOCK_EVERFLOW_SOURCE } from "@/src/integration/offers/model";
import { syncMockEverflowOffersToPostgres } from "@/src/integration/offers/sync";
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
import {
  IntegrationOfferIdentityConflictError,
  IntegrationOfferRepository,
} from "@/src/integration/postgres/offer-repository";
import { offers } from "@/src/integration/postgres/schema";
import { IntegrationStoryRepository } from "@/src/integration/postgres/story-repository";
import { syncRssStoriesToPostgres } from "@/src/integration/story-sync";

const DEFAULT_LOCAL_URL =
  "postgres://integration:integration@127.0.0.1:5433/newsletter_integration";

type PostgresProbe =
  | { ok: true; url: string }
  | { ok: false; reason: string };

let postgresProbe: PostgresProbe | undefined;

function fixtureRecords(): unknown[] {
  return JSON.parse(readFileSync(MOCK_EVERFLOW_OFFERS_FIXTURE_PATH, "utf8")) as unknown[];
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
        "Normalization tests still run; these Postgres tests are skipped, not passed.",
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

test("fixture contains exactly 10 records", async () => {
  assert.equal(fixtureRecords().length, 10);
  const offers = await new MockEverflowOfferFixtureSource().read();
  assert.equal(offers.length, 10);
});

test("valid records normalize correctly", async () => {
  const offers = await new MockEverflowOfferFixtureSource().read();
  const first = offers[0];
  const paused = offers.find((offer) => offer.status === "paused");

  assert.equal(first?.source, MOCK_EVERFLOW_SOURCE);
  assert.equal(first?.sourceOfferId, "1001");
  assert.equal(first?.advertiserName, "Cedar Brook Insurance");
  assert.equal(first?.offerName, "Term life quote worksheet");
  assert.equal(first?.status, "active");
  assert.equal(first?.trackingUrl, "https://offers-fixture.test/mock-everflow/track/1001");
  assert.equal(paused?.sourceOfferId, "1007");
  assert.equal(paused?.status, "paused");
});

test("required fields are enforced", () => {
  const records = fixtureRecords();
  const first = records[0] as Record<string, unknown>;
  assert.throws(
    () => parseMockEverflowOffers([{ ...first, offer_id: "" }, ...records.slice(1)]),
    (error: unknown) =>
      error instanceof IntegrationOfferSyncError &&
      error.message === "Offer 1 is missing a required offer_id value.",
  );
});

test("non-HTTPS tracking URL fails", () => {
  const records = fixtureRecords();
  const first = records[0] as Record<string, unknown>;
  assert.throws(
    () =>
      parseMockEverflowOffers([
        { ...first, tracking_url: "http://offers-fixture.test/mock-everflow/track/1001" },
        ...records.slice(1),
      ]),
    (error: unknown) =>
      error instanceof IntegrationOfferSyncError &&
      error.message === "Offer 1 tracking URL must use HTTPS.",
  );
});

test("unsupported status fails", () => {
  const records = fixtureRecords();
  const first = records[0] as Record<string, unknown>;
  assert.throws(
    () => parseMockEverflowOffers([{ ...first, status: "archived" }, ...records.slice(1)]),
    (error: unknown) =>
      error instanceof IntegrationOfferSyncError &&
      error.message === "Offer 1 has an unsupported status.",
  );
});

test("stable deterministic IDs", async () => {
  const first = await new MockEverflowOfferFixtureSource().read();
  const second = await new MockEverflowOfferFixtureSource().read();
  assert.deepEqual(
    first.map((offer) => offer.id),
    second.map((offer) => offer.id),
  );
  assert.equal(first[0]?.id, integrationOfferId(MOCK_EVERFLOW_SOURCE, "1001"));
  assert.equal(new Set(first.map((offer) => offer.id)).size, 10);
});

test("first sync stores exactly 10 offers", async (t) => {
  const adminUrl = await requirePostgres(t);
  if (!adminUrl) {
    return;
  }

  await withIsolatedIntegrationDatabase(adminUrl, async (handle) => {
    const result = await syncMockEverflowOffersToPostgres({ db: handle.db });
    const stored = await new IntegrationOfferRepository(handle.db).listOffers();
    assert.equal(result.processed, 10);
    assert.equal(result.stored, 10);
    assert.equal(stored.length, 10);
    assert.equal(stored.filter((offer) => offer.status === "paused").length, 1);
  });
});

test("second identical sync still stores exactly 10 offers", async (t) => {
  const adminUrl = await requirePostgres(t);
  if (!adminUrl) {
    return;
  }

  await withIsolatedIntegrationDatabase(adminUrl, async (handle) => {
    await syncMockEverflowOffersToPostgres({ db: handle.db });
    const second = await syncMockEverflowOffersToPostgres({ db: handle.db });
    assert.equal(second.processed, 10);
    assert.equal(second.stored, 10);
    assert.equal(await new IntegrationOfferRepository(handle.db).countOffers(), 10);
  });
});

test("same source offer ID updates the same record", async (t) => {
  const adminUrl = await requirePostgres(t);
  if (!adminUrl) {
    return;
  }

  await withIsolatedIntegrationDatabase(adminUrl, async (handle) => {
    const original = await new MockEverflowOfferFixtureSource().read();
    await syncMockEverflowOffersToPostgres({ db: handle.db });
    const updatedName = "Term life quote worksheet (updated)";
    const updated = original.map((offer) =>
      offer.sourceOfferId === "1001" ? { ...offer, offerName: updatedName } : offer,
    );
    await syncMockEverflowOffersToPostgres({ db: handle.db, offers: updated });
    const stored = await new IntegrationOfferRepository(handle.db).listOffers();
    const changed = stored.find((offer) => offer.sourceOfferId === "1001");
    assert.equal(stored.length, 10);
    assert.equal(changed?.id, original[0]?.id);
    assert.equal(changed?.offerName, updatedName);
  });
});

test("conflicting duplicate identity fails", () => {
  const records = fixtureRecords();
  const first = records[0] as Record<string, unknown>;
  assert.throws(
    () =>
      parseMockEverflowOffers([
        first,
        { ...first, name: "A different offer name" },
        ...records.slice(1),
      ]),
    (error: unknown) =>
      error instanceof IntegrationOfferSyncError &&
      error.message.includes("conflicts with another record that uses the same source identity"),
  );
});

test("failed batch rolls back completely", async (t) => {
  const adminUrl = await requirePostgres(t);
  if (!adminUrl) {
    return;
  }

  await withIsolatedIntegrationDatabase(adminUrl, async (handle) => {
    const original = await new MockEverflowOfferFixtureSource().read();
    const seventh = original[6];
    assert.ok(seventh);

    await handle.db.insert(offers).values({
      id: "offer_preexisting_conflict",
      source: MOCK_EVERFLOW_SOURCE,
      sourceOfferId: seventh.sourceOfferId,
      advertiserName: "Preexisting conflict",
      offerName: "Should remain after rollback",
      status: "active",
      trackingUrl: "https://offers-fixture.test/mock-everflow/track/preexisting",
    });

    await assert.rejects(
      () => syncMockEverflowOffersToPostgres({ db: handle.db }),
      IntegrationOfferIdentityConflictError,
    );

    const stored = await new IntegrationOfferRepository(handle.db).listOffers();
    assert.equal(stored.length, 1);
    assert.equal(stored[0]?.id, "offer_preexisting_conflict");
    assert.ok(
      !original.slice(0, 6).some((offer) => stored.some((row) => row.id === offer.id)),
    );
  });
});

test("data survives connection reopen", async (t) => {
  const adminUrl = await requirePostgres(t);
  if (!adminUrl) {
    return;
  }

  await withIsolatedIntegrationDatabase(adminUrl, async (handle, testUrl) => {
    const original = await new MockEverflowOfferFixtureSource().read();
    await syncMockEverflowOffersToPostgres({ db: handle.db });
    await handle.close();

    const reopened = openIntegrationDatabase(testUrl);
    try {
      const stored = await new IntegrationOfferRepository(reopened.db).listOffers();
      assert.deepEqual(
        stored.sort((left, right) => left.id.localeCompare(right.id)),
        [...original].sort((left, right) => left.id.localeCompare(right.id)),
      );
    } finally {
      await reopened.close();
    }
  });
});

test("existing story sync still produces 5 stories", async (t) => {
  const adminUrl = await requirePostgres(t);
  if (!adminUrl) {
    return;
  }

  await withIsolatedIntegrationDatabase(adminUrl, async (handle) => {
    const stories = await syncRssStoriesToPostgres({ db: handle.db });
    const offersResult = await syncMockEverflowOffersToPostgres({ db: handle.db });
    assert.equal(stories.processed, 5);
    assert.equal(stories.stored, 5);
    assert.equal(offersResult.stored, 10);
    assert.equal(await new IntegrationStoryRepository(handle.db).countStories(), 5);
    assert.equal(await new IntegrationOfferRepository(handle.db).countOffers(), 10);
  });
});
