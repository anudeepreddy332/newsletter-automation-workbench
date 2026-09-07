import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { Client } from "pg";

import { mockEverflowOfferCatalog } from "@/src/adapters/offers/mock-everflow";
import { MockWordPress } from "@/src/adapters/publishing/mock-wordpress";
import { MockIterable } from "@/src/adapters/staging/mock-iterable";
import { BenzingaShapedFixtureSource } from "@/src/adapters/rss/benzinga-shaped-rss";
import type { ContentSource } from "@/src/content/content-source";
import { openContentDatabase } from "@/src/db/database";
import { applyContentFoundationMigrations } from "@/src/db/migrate";
import {
  NEWSLETTER_INTEGRATION_MODE_ENV,
  readNewsletterIntegrationMode,
} from "@/src/integration/http/config";
import {
  createWorkbenchOfferCatalog,
  createWorkbenchOfferSource,
} from "@/src/integration/http/create-offer-catalog";
import { FastApiOfferSource, type AdvertiserOfferSource } from "@/src/integration/http/fastapi-offer-source";
import { FastApiStorySource } from "@/src/integration/http/fastapi-story-source";
import { parseOffersResponse } from "@/src/integration/http/offers-response";
import { IntegrationHttpError } from "@/src/integration/http/stories-response";
import { SqliteOfferCatalog } from "@/src/integration/offers/sqlite-offer-catalog";
import { syncMockEverflowOffersToPostgres } from "@/src/integration/offers/sync";
import { syncRssStoriesToPostgres } from "@/src/integration/story-sync";
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
import { ContentRepository } from "@/src/repositories/content-repository";
import { OfferSnapshotRepository } from "@/src/repositories/offer-snapshot-repository";
import { WorkbenchRepository } from "@/src/repositories/workbench-repository";
import { WorkbenchService, WorkbenchServiceError } from "@/src/workbench/workbench-service";

const DEFAULT_LOCAL_URL =
  "postgres://integration:integration@127.0.0.1:5433/newsletter_integration";
const firstStoryId = "story_6c43c8a1944281017858d68b";
const firstActiveOfferId = "offer_9b274df57cc91d06448f3d48";
const pausedOfferId = "offer_5e9d2d10ce75058f4b6b3d19";
const rssFixturePath = path.join(
  process.cwd(),
  "tests/fixtures/benzinga-shaped-financial-news.xml",
);
const offerFixturePayload = JSON.parse(
  readFileSync(path.join(process.cwd(), "tests/fixtures/integration-offers-response.json"), "utf8"),
) as { offers: Array<Record<string, unknown>> };

type PostgresProbe =
  | { ok: true; url: string }
  | { ok: false; reason: string };

let postgresProbe: PostgresProbe | undefined;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
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
          "INTEGRATION_DATABASE_URL is set but Postgres is unreachable. Live offer HTTP tests were skipped, not passed.",
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
      "Postgres is not available. Contract tests still run; live HTTP tests are skipped, not passed.",
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

async function withTempDrillWorkbench(
  storySource: ContentSource,
  offerSource: AdvertiserOfferSource,
  run: (service: WorkbenchService, snapshots: OfferSnapshotRepository, databasePath: string) => Promise<void>,
): Promise<void> {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "newsletter-offers-drill-"));
  const databasePath = path.join(temporaryDirectory, "drill.db");
  const { client, db } = openContentDatabase(databasePath);
  applyContentFoundationMigrations(db);
  const snapshots = new OfferSnapshotRepository(db);
  const service = new WorkbenchService(
    storySource,
    new ContentRepository(db),
    new WorkbenchRepository(db),
    new MockWordPress(),
    null,
    new SqliteOfferCatalog(snapshots),
    new MockIterable(),
    null,
    offerSource,
    snapshots,
  );
  try {
    await run(service, snapshots, databasePath);
  } finally {
    client.close();
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function listenPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate a local port."));
        return;
      }
      const port = address.port;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

async function waitForHealth(baseUrl: string): Promise<void> {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`, { cache: "no-store" });
      if (response.ok) {
        return;
      }
    } catch {
      // The API process is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("FastAPI did not become healthy.");
}

test("TypeScript accepts a valid FastAPI offer response", async () => {
  let calls = 0;
  const source = new FastApiOfferSource("http://127.0.0.1:8000", async () => {
    calls += 1;
    return jsonResponse(offerFixturePayload);
  });
  const offers = await source.read();
  assert.equal(calls, 1);
  assert.equal(offers.length, 10);
  assert.equal(offers[0]?.id, firstActiveOfferId);
  assert.equal(offers[0]?.source, "mock-everflow");
  assert.equal(offers.find((offer) => offer.id === pausedOfferId)?.status, "paused");
});

test("malformed JSON from the offers catalog is rejected", async () => {
  const source = new FastApiOfferSource("http://127.0.0.1:8000", async () => {
    return new Response("{", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  await assert.rejects(
    () => source.read(),
    (error: unknown) =>
      error instanceof IntegrationHttpError && error.code === "MALFORMED_OFFERS_JSON",
  );
});

test("invalid offer contract is rejected", async () => {
  const source = new FastApiOfferSource("http://127.0.0.1:8000", async () => {
    return jsonResponse({ offers: [{ id: "offer_1" }] });
  });
  await assert.rejects(
    () => source.read(),
    (error: unknown) =>
      error instanceof IntegrationHttpError && error.code === "INVALID_OFFERS_RESPONSE",
  );
});

test("Fetch advertiser links imports persisted records", async () => {
  const source = new FastApiOfferSource("http://127.0.0.1:8000", async () => jsonResponse(offerFixturePayload));
  await withTempDrillWorkbench(new BenzingaShapedFixtureSource(rssFixturePath), source, async (service, snapshots) => {
    const result = await service.fetchAdvertiserLinks();
    const state = await service.load();
    assert.equal(result.fetchedCount, 10);
    assert.equal(result.availableCount, 9);
    assert.equal(state.availableOffers.length, 9);
    assert.equal(snapshots.count(), 10);
    assert.equal(state.availableOffers.some((offer) => offer.id === pausedOfferId), false);
    assert.equal(state.availableOffers[0]?.id, firstActiveOfferId);
  });
});

test("repeated advertiser fetch remains idempotent", async () => {
  let calls = 0;
  const source = new FastApiOfferSource("http://127.0.0.1:8000", async () => {
    calls += 1;
    return jsonResponse(offerFixturePayload);
  });
  await withTempDrillWorkbench(new BenzingaShapedFixtureSource(rssFixturePath), source, async (service, snapshots) => {
    const first = await service.fetchAdvertiserLinks();
    const second = await service.fetchAdvertiserLinks();
    assert.equal(first.fetchedCount, 10);
    assert.equal(second.fetchedCount, 10);
    assert.equal(second.availableCount, 9);
    assert.equal(snapshots.count(), 10);
    assert.equal(calls, 2);
  });
});

test("failed advertiser fetch preserves the previous snapshot", async () => {
  let fail = false;
  const source = new FastApiOfferSource("http://127.0.0.1:8000", async () => {
    if (fail) {
      throw new Error("connect ECONNREFUSED");
    }
    return jsonResponse(offerFixturePayload);
  });

  await withTempDrillWorkbench(
    new BenzingaShapedFixtureSource(rssFixturePath),
    source,
    async (service, snapshots) => {
      await service.fetchLatestStories();
      await service.fetchAdvertiserLinks();
      await service.addStory(firstStoryId);
      await service.addOffer(firstActiveOfferId);
      await service.generateNewsletter();
      const before = await service.load();

      fail = true;
      await assert.rejects(() => service.fetchAdvertiserLinks(), IntegrationHttpError);
      const after = await service.load();
      assert.equal(snapshots.count(), 10);
      assert.equal(after.availableOffers.length, 9);
      assert.equal(after.draft.selectedOffers[0]?.id, firstActiveOfferId);
      assert.equal(after.draft.selectedStories[0]?.id, firstStoryId);
      assert.equal(after.generatedNewsletter?.subject, before.generatedNewsletter?.subject);
    },
  );
});

test("offer snapshot survives service restart", async () => {
  const source = new FastApiOfferSource("http://127.0.0.1:8000", async () => jsonResponse(offerFixturePayload));
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "newsletter-offers-restart-"));
  const databasePath = path.join(temporaryDirectory, "drill.db");
  const first = openContentDatabase(databasePath);
  applyContentFoundationMigrations(first.db);
  const firstSnapshots = new OfferSnapshotRepository(first.db);
  const firstService = new WorkbenchService(
    new BenzingaShapedFixtureSource(rssFixturePath),
    new ContentRepository(first.db),
    new WorkbenchRepository(first.db),
    new MockWordPress(),
    null,
    new SqliteOfferCatalog(firstSnapshots),
    new MockIterable(),
    null,
    source,
    firstSnapshots,
  );

  try {
    await firstService.fetchAdvertiserLinks();
    await firstService.addOffer(firstActiveOfferId);
    first.client.close();

    const second = openContentDatabase(databasePath);
    try {
      const snapshots = new OfferSnapshotRepository(second.db);
      const service = new WorkbenchService(
        new BenzingaShapedFixtureSource(rssFixturePath),
        new ContentRepository(second.db),
        new WorkbenchRepository(second.db),
        new MockWordPress(),
        null,
        new SqliteOfferCatalog(snapshots),
      );
      const state = await service.load();
      assert.equal(snapshots.count(), 10);
      assert.equal(state.availableOffers.length, 9);
      assert.equal(state.draft.selectedOffers[0]?.id, firstActiveOfferId);
    } finally {
      second.client.close();
    }
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test("active offers are selectable and paused offers are not", async () => {
  const source = new FastApiOfferSource("http://127.0.0.1:8000", async () => jsonResponse(offerFixturePayload));
  await withTempDrillWorkbench(new BenzingaShapedFixtureSource(rssFixturePath), source, async (service) => {
    await service.fetchAdvertiserLinks();
    await service.addOffer(firstActiveOfferId);
    const state = await service.load();
    assert.equal(state.draft.selectedOffers[0]?.id, firstActiveOfferId);
    await assert.rejects(
      () => service.addOffer(pausedOfferId),
      (error: unknown) =>
        error instanceof WorkbenchServiceError && error.code === "INELIGIBLE_OFFER",
    );
    assert.equal((await service.load()).draft.selectedOffers.length, 1);
  });
});

test("selected offer becoming paused is blocked before generation", async () => {
  let payload: unknown = offerFixturePayload;
  const source = new FastApiOfferSource("http://127.0.0.1:8000", async () => jsonResponse(payload));
  await withTempDrillWorkbench(new BenzingaShapedFixtureSource(rssFixturePath), source, async (service) => {
    await service.fetchLatestStories();
    await service.fetchAdvertiserLinks();
    await service.addStory(firstStoryId);
    await service.addOffer(firstActiveOfferId);
    await service.generateNewsletter();

    payload = {
      offers: offerFixturePayload.offers.map((offer) =>
        offer.id === firstActiveOfferId ? { ...offer, status: "paused" } : offer,
      ),
    };
    await service.fetchAdvertiserLinks();
    const state = await service.load();
    assert.equal(state.draft.selectedOffers[0]?.id, firstActiveOfferId);
    assert.equal(state.availableOffers.some((offer) => offer.id === firstActiveOfferId), false);
    await assert.rejects(
      () => service.generateNewsletter(),
      (error: unknown) =>
        error instanceof WorkbenchServiceError && error.code === "INELIGIBLE_OFFER",
    );
  });
});

test("normal page reload does not call the offers catalog", async () => {
  let calls = 0;
  const source = new FastApiOfferSource("http://127.0.0.1:8000", async () => {
    calls += 1;
    return jsonResponse(offerFixturePayload);
  });
  await withTempDrillWorkbench(new BenzingaShapedFixtureSource(rssFixturePath), source, async (service) => {
    await service.load();
    await service.load();
    assert.equal(calls, 0);
    await service.fetchAdvertiserLinks();
    assert.equal(calls, 1);
    await service.load();
    assert.equal(calls, 1);
  });

  const pageSource = readFileSync(path.join(process.cwd(), "app/page.tsx"), "utf8");
  assert.match(pageSource, /workbenchService\.load/);
  assert.doesNotMatch(pageSource, /fetchAdvertiserLinks/);
});

test("existing story FastAPI flow still works alongside advertiser fetch", async () => {
  const storyPayload = JSON.parse(
    readFileSync(path.join(process.cwd(), "tests/fixtures/integration-stories-response.json"), "utf8"),
  ) as unknown;
  const storySource = new FastApiStorySource("http://127.0.0.1:8000", async () => jsonResponse(storyPayload));
  const offerSource = new FastApiOfferSource("http://127.0.0.1:8000", async () => jsonResponse(offerFixturePayload));
  await withTempDrillWorkbench(storySource, offerSource, async (service) => {
    const stories = await service.fetchLatestStories();
    const offers = await service.fetchAdvertiserLinks();
    await service.addStory(firstStoryId);
    await service.addOffer(firstActiveOfferId);
    const state = await service.load();
    assert.equal(stories.availableCount, 5);
    assert.equal(stories.fetchedCount, 5);
    assert.equal(offers.availableCount, 9);
    assert.equal(state.availableStories.length, 5);
    assert.equal(state.draft.selectedStories[0]?.id, firstStoryId);
    assert.equal(state.draft.selectedOffers[0]?.id, firstActiveOfferId);
  });
});

test("demo mode still uses the static mock catalog without FastAPI or Postgres", () => {
  assert.equal(readNewsletterIntegrationMode({}), "demo");
  assert.equal(createWorkbenchOfferSource({}), null);
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "newsletter-offers-demo-"));
  const { client, db } = openContentDatabase(path.join(temporaryDirectory, "demo.db"));
  applyContentFoundationMigrations(db);
  try {
    const catalog = createWorkbenchOfferCatalog(db, {});
    assert.equal(catalog, mockEverflowOfferCatalog);
    assert.equal(catalog.list().length, 5);
    assert.throws(() =>
      createWorkbenchOfferSource({ [NEWSLETTER_INTEGRATION_MODE_ENV]: "drill" }),
    );
  } finally {
    client.close();
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test("empty offers array is a valid catalog response", () => {
  assert.deepEqual(parseOffersResponse({ offers: [] }), []);
});

test("real local HTTP GET /offers returns ten synchronized Postgres records", async (t) => {
  const adminUrl = await requirePostgres(t);
  if (!adminUrl) {
    return;
  }

  const python = path.join(process.cwd(), "api/.venv/bin/python");
  if (!existsSync(python)) {
    t.skip("Python virtualenv is not available. Create api/.venv to run live HTTP tests.");
    return;
  }

  await withIsolatedIntegrationDatabase(adminUrl, async (handle, testUrl) => {
    await syncRssStoriesToPostgres({ db: handle.db });
    await syncMockEverflowOffersToPostgres({ db: handle.db });
    const port = await listenPort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const child: ChildProcess = spawn(
      python,
      ["-m", "uvicorn", "newsletter_integration_api.main:app", "--host", "127.0.0.1", "--port", String(port)],
      {
        cwd: path.join(process.cwd(), "api"),
        env: { ...process.env, INTEGRATION_DATABASE_URL: testUrl },
        stdio: "pipe",
      },
    );

    try {
      await waitForHealth(baseUrl);
      const offers = await fetch(`${baseUrl}/offers`, { cache: "no-store" });
      assert.equal(offers.status, 200);
      const payload = (await offers.json()) as { offers: Array<{ id: string; status: string }> };
      assert.equal(payload.offers.length, 10);
      assert.equal(payload.offers.filter((offer) => offer.status === "paused").length, 1);

      const stories = await fetch(`${baseUrl}/stories`, { cache: "no-store" });
      assert.equal(stories.status, 200);
      const storyPayload = (await stories.json()) as { stories: Array<{ id: string }> };
      assert.equal(storyPayload.stories.length, 5);

      const source = new FastApiOfferSource(baseUrl);
      await withTempDrillWorkbench(new BenzingaShapedFixtureSource(rssFixturePath), source, async (service) => {
        const result = await service.fetchAdvertiserLinks();
        assert.equal(result.fetchedCount, 10);
        assert.equal(result.availableCount, 9);
      });
    } finally {
      child.kill("SIGTERM");
    }
  });
});
