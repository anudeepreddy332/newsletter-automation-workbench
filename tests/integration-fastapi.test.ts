import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { Client } from "pg";

import { MockWordPress } from "@/src/adapters/publishing/mock-wordpress";
import type { ContentSource } from "@/src/content/content-source";
import { openContentDatabase } from "@/src/db/database";
import { applyContentFoundationMigrations } from "@/src/db/migrate";
import { createWorkbenchContentSource } from "@/src/integration/http/create-content-source";
import {
  NEWSLETTER_INTEGRATION_MODE_ENV,
  readNewsletterIntegrationMode,
} from "@/src/integration/http/config";
import { FastApiStorySource } from "@/src/integration/http/fastapi-story-source";
import { IntegrationHttpError } from "@/src/integration/http/stories-response";
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
import { WorkbenchRepository } from "@/src/repositories/workbench-repository";
import { WorkbenchService } from "@/src/workbench/workbench-service";
import { BenzingaShapedFixtureSource } from "@/src/adapters/rss/benzinga-shaped-rss";
import { syncRssStoriesToPostgres } from "@/src/integration/story-sync";

const DEFAULT_LOCAL_URL =
  "postgres://integration:integration@127.0.0.1:5433/newsletter_integration";
const firstStoryId = "story_6c43c8a1944281017858d68b";
const fixturePayload = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "tests/fixtures/integration-stories-response.json"),
    "utf8",
  ),
) as unknown;

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
          "INTEGRATION_DATABASE_URL is set but Postgres is unreachable. " +
            "Live FastAPI HTTP tests were skipped, not passed.",
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
      "Postgres is not available. Start it with: docker compose -f compose.integration.yml up -d. " +
        "Contract tests still run; live HTTP tests are skipped, not passed.",
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

async function withTempWorkbench(
  source: ContentSource,
  run: (service: WorkbenchService) => Promise<void>,
): Promise<void> {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "newsletter-drill-"));
  const databasePath = path.join(temporaryDirectory, "drill.db");
  const { client, db } = openContentDatabase(databasePath);
  applyContentFoundationMigrations(db);
  const service = new WorkbenchService(
    source,
    new ContentRepository(db),
    new WorkbenchRepository(db),
    new MockWordPress(),
  );
  try {
    await run(service);
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

test("TypeScript HTTP source accepts a valid FastAPI story response", async () => {
  let calls = 0;
  const source = new FastApiStorySource("http://127.0.0.1:8000", async () => {
    calls += 1;
    return jsonResponse(fixturePayload);
  });
  const batch = await source.read();
  assert.equal(calls, 1);
  assert.equal(batch.stories.length, 5);
  assert.equal(batch.stories[0]?.id, firstStoryId);
  assert.equal(batch.stories[1]?.imageUrl, undefined);
  assert.equal(batch.stories[1]?.sourceAuthor, undefined);
  assert.equal(batch.stories[0]?.publishedAt, "2026-09-02T03:30:00.000Z");
});

test("malformed JSON from FastAPI is rejected", async () => {
  const source = new FastApiStorySource("http://127.0.0.1:8000", async () => {
    return new Response("{", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  await assert.rejects(
    () => source.read(),
    (error: unknown) =>
      error instanceof IntegrationHttpError && error.code === "MALFORMED_STORIES_JSON",
  );
});

test("invalid story contract is rejected", async () => {
  const source = new FastApiStorySource("http://127.0.0.1:8000", async () => {
    return jsonResponse({ contentFeed: { id: "feed" }, stories: [{ id: "story_1" }] });
  });
  await assert.rejects(
    () => source.read(),
    (error: unknown) =>
      error instanceof IntegrationHttpError && error.code === "INVALID_STORIES_RESPONSE",
  );
});

test("FastAPI failure preserves the previous SQLite snapshot and selection", async () => {
  let fail = false;
  const source = new FastApiStorySource("http://127.0.0.1:8000", async () => {
    if (fail) {
      throw new Error("connect ECONNREFUSED");
    }
    return jsonResponse(fixturePayload);
  }, { sleep: async () => undefined });

  await withTempWorkbench(source, async (service) => {
    await service.fetchLatestStories();
    await service.addStory(firstStoryId);
    const before = await service.load();
    assert.equal(before.availableStories.length, 5);
    assert.equal(before.draft.selectedStories[0]?.id, firstStoryId);

    fail = true;
    await assert.rejects(() => service.fetchLatestStories(), IntegrationHttpError);
    const after = await service.load();
    assert.equal(after.availableStories.length, 5);
    assert.equal(after.draft.selectedStories[0]?.id, firstStoryId);
  });
});

test("repeated successful Fetch Stories through FastAPI stays idempotent", async () => {
  let calls = 0;
  const source = new FastApiStorySource("http://127.0.0.1:8000", async () => {
    calls += 1;
    return jsonResponse(fixturePayload);
  });

  await withTempWorkbench(source, async (service) => {
    const first = await service.fetchLatestStories();
    const second = await service.fetchLatestStories();
    const state = await service.load();
    assert.equal(first.fetchedCount, 5);
    assert.equal(second.fetchedCount, 5);
    assert.equal(second.availableCount, 5);
    assert.equal(state.availableStories.length, 5);
    assert.equal(calls, 2);
  });
});

test("normal page reload does not call FastAPI", async () => {
  let calls = 0;
  const source = new FastApiStorySource("http://127.0.0.1:8000", async () => {
    calls += 1;
    return jsonResponse(fixturePayload);
  });

  await withTempWorkbench(source, async (service) => {
    await service.load();
    await service.load();
    assert.equal(calls, 0);
    await service.fetchLatestStories();
    assert.equal(calls, 1);
    await service.load();
    assert.equal(calls, 1);
  });

  const pageSource = readFileSync(path.join(process.cwd(), "app/page.tsx"), "utf8");
  assert.match(pageSource, /workbenchService\.load/);
  assert.doesNotMatch(pageSource, /fetchLatestStories/);
  assert.doesNotMatch(pageSource, /fetchAdvertiserLinks/);
});

test("existing story selection still works after a FastAPI fetch", async () => {
  const source = new FastApiStorySource("http://127.0.0.1:8000", async () => jsonResponse(fixturePayload));
  await withTempWorkbench(source, async (service) => {
    await service.fetchLatestStories();
    await service.addStory(firstStoryId);
    const state = await service.load();
    assert.equal(state.draft.selectedStories[0]?.id, firstStoryId);
    assert.equal(state.availableStories.length, 5);
  });
});

test("default demo mode still works without FastAPI or Postgres", () => {
  assert.equal(readNewsletterIntegrationMode({}), "demo");
  assert.equal(readNewsletterIntegrationMode({ [NEWSLETTER_INTEGRATION_MODE_ENV]: "demo" }), "demo");
  const source = createWorkbenchContentSource({});
  assert.ok(source instanceof BenzingaShapedFixtureSource);
  assert.throws(() =>
    createWorkbenchContentSource({ [NEWSLETTER_INTEGRATION_MODE_ENV]: "drill" }),
  );

  const runtimeSource = readFileSync(path.join(process.cwd(), "src/workbench/runtime.ts"), "utf8");
  const actionsSource = readFileSync(path.join(process.cwd(), "app/actions.ts"), "utf8");
  const workbenchSource = readFileSync(path.join(process.cwd(), "app/workbench.tsx"), "utf8");
  assert.doesNotMatch(runtimeSource, /NEXT_PUBLIC_/);
  assert.doesNotMatch(actionsSource, /NEXT_PUBLIC_/);
  assert.doesNotMatch(workbenchSource, /INTEGRATION_API_BASE_URL|NEXT_PUBLIC_/);
  assert.match(workbenchSource, /Fetch latest stories/);
  assert.match(workbenchSource, /Fetch advertiser links/);
  assert.match(workbenchSource, /Sample advertiser offers are used in this prototype/);
});

test("real local HTTP GET /stories returns five synchronized Postgres stories", async (t) => {
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
      const health = await fetch(`${baseUrl}/health`, { cache: "no-store" });
      assert.equal(health.status, 200);
      assert.deepEqual(await health.json(), { status: "ok" });

      const stories = await fetch(`${baseUrl}/stories`, { cache: "no-store" });
      assert.equal(stories.status, 200);
      const payload = (await stories.json()) as { stories: Array<{ id: string }> };
      assert.equal(payload.stories.length, 5);

      const source = new FastApiStorySource(baseUrl);
      await withTempWorkbench(source, async (service) => {
        const result = await service.fetchLatestStories();
        assert.equal(result.fetchedCount, 5);
        assert.equal(result.availableCount, 5);
      });
    } finally {
      child.kill("SIGTERM");
    }
  });
});
