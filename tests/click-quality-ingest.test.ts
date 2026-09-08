import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import test, { describe, type TestContext } from "node:test";
import { Client } from "pg";

import { CLICK_QUALITY_EVENTS_FIXTURE_PATH } from "@/src/click-quality/events-fixture";
import {
  ClickQualityIdentityConflictError,
  ClickQualityValidationError,
} from "@/src/click-quality/errors";
import { ingestClickQualityEvents } from "@/src/click-quality/ingest";
import {
  INTEGRATION_DATABASE_URL_ENV,
  IntegrationDatabaseConfigError,
  readIntegrationDatabaseUrl,
} from "@/src/integration/postgres/config";
import {
  openClickQualityDatabase,
  type ClickQualityDatabaseHandle,
} from "@/src/click-quality/postgres/database";
import { ClickQualityEventRepository } from "@/src/click-quality/postgres/repository";
import { applyIntegrationMigrations } from "@/src/integration/postgres/migrate";
import { openIntegrationDatabase } from "@/src/integration/postgres/database";
import type { ClickQualityEvent } from "@/src/click-quality/contract";

const DEFAULT_LOCAL_URL =
  "postgres://integration:integration@127.0.0.1:5433/newsletter_integration";

type PostgresProbe = { ok: true; url: string } | { ok: false; reason: string };

let postgresProbe: PostgresProbe | undefined;

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
          "INTEGRATION_DATABASE_URL is set but Postgres is unreachable. Click-quality Postgres tests were skipped, not passed.",
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
      "Postgres is not available. Start it with: docker compose -f compose.integration.yml up -d.",
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

function urlWithDatabase(url: string, databaseName: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${databaseName}`;
  return parsed.toString();
}

async function withIsolatedDatabase(
  adminUrl: string,
  run: (handle: ClickQualityDatabaseHandle, connectionString: string) => Promise<void>,
): Promise<void> {
  const databaseName = `cq_test_${randomBytes(6).toString("hex")}`;
  const admin = new Client({ connectionString: adminUrl, connectionTimeoutMillis: 5000 });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${databaseName}"`);
  } catch (error) {
    await admin.end().catch(() => undefined);
    throw error;
  }

  const connectionString = urlWithDatabase(adminUrl, databaseName);
  const integration = openIntegrationDatabase(connectionString);
  const handle = openClickQualityDatabase(connectionString);
  try {
    await applyIntegrationMigrations(integration.db);
    await run(handle, connectionString);
  } finally {
    await handle.close();
    await integration.close();
    try {
      await new Promise((resolve) => setTimeout(resolve, 25));
      await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    } finally {
      await admin.end();
    }
  }
}

function loadFixtureEvents(): ClickQualityEvent[] {
  return JSON.parse(readFileSync(CLICK_QUALITY_EVENTS_FIXTURE_PATH, "utf8")) as ClickQualityEvent[];
}

describe("click-quality postgres ingest", { concurrency: 1 }, () => {
test("migration creates click_quality.events and no later-phase tables", async (t) => {
  const adminUrl = await requirePostgres(t);
  if (!adminUrl) {
    return;
  }

  await withIsolatedDatabase(adminUrl, async (handle) => {
    const created = await handle.pool.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'click_quality'
       ORDER BY table_name`,
    );
    assert.deepEqual(
      created.rows.map((row) => row.table_name),
      ["event_features", "events"],
    );

    const forbidden = await handle.pool.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_name = ANY($1)`,
      [["threshold_sets", "classifications", "evaluation_runs", "ground_truth"]],
    );
    assert.equal(forbidden.rows.length, 0);
  });
});

test("events table has no split, label, IP, or email columns", async (t) => {
  const adminUrl = await requirePostgres(t);
  if (!adminUrl) {
    return;
  }

  await withIsolatedDatabase(adminUrl, async (handle) => {
    const columns = await handle.pool.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'click_quality'
         AND table_name = 'events'
       ORDER BY column_name`,
    );
    const names = columns.rows.map((row) => row.column_name);
    assert.ok(names.includes("event_id"));
    for (const banned of [
      "experiment_split",
      "ground_truth",
      "label",
      "ip",
      "ip_address",
      "email",
      "user_email",
      "forward_candidate",
    ]) {
      assert.equal(names.includes(banned), false, banned);
    }
  });
});

test("exactly 90 valid events load and a second ingest remains 90", async (t) => {
  const adminUrl = await requirePostgres(t);
  if (!adminUrl) {
    return;
  }

  await withIsolatedDatabase(adminUrl, async (handle) => {
    const first = await ingestClickQualityEvents({ db: handle.db });
    assert.equal(first.processed, 90);
    assert.equal(first.stored, 90);
    const second = await ingestClickQualityEvents({ db: handle.db });
    assert.equal(second.processed, 90);
    assert.equal(second.stored, 90);
    const repository = new ClickQualityEventRepository(handle.db);
    assert.equal(await repository.countEvents(), 90);
  });
});

test("one invalid batch item prevents any writes", async (t) => {
  const adminUrl = await requirePostgres(t);
  if (!adminUrl) {
    return;
  }

  await withIsolatedDatabase(adminUrl, async (handle) => {
    const batch = loadFixtureEvents();
    (batch[10] as { schema_version: string }).schema_version = "nope";
    await assert.rejects(
      () => ingestClickQualityEvents({ db: handle.db, events: batch }),
      ClickQualityValidationError,
    );
    const repository = new ClickQualityEventRepository(handle.db);
    assert.equal(await repository.countEvents(), 0);
  });
});

test("identity conflict fails clearly instead of overwriting", async (t) => {
  const adminUrl = await requirePostgres(t);
  if (!adminUrl) {
    return;
  }

  await withIsolatedDatabase(adminUrl, async (handle) => {
    await ingestClickQualityEvents({ db: handle.db });
    const [existing] = loadFixtureEvents();
    const mutated = { ...existing!, destination_host: "other-fixture.test" };
    await assert.rejects(
      () => ingestClickQualityEvents({ db: handle.db, events: [mutated] }),
      ClickQualityIdentityConflictError,
    );
    const repository = new ClickQualityEventRepository(handle.db);
    assert.equal(await repository.countEvents(), 90);
    const stored = (await repository.listEvents()).find((event) => event.event_id === existing!.event_id);
    assert.equal(stored?.destination_host, existing!.destination_host);
  });
});

test("existing story and offer tables remain in public schema", async (t) => {
  const adminUrl = await requirePostgres(t);
  if (!adminUrl) {
    return;
  }

  await withIsolatedDatabase(adminUrl, async (handle) => {
    const result = await handle.pool.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = ANY($1)
       ORDER BY table_name`,
      [["content_feeds", "offers", "stories"]],
    );
    assert.deepEqual(
      result.rows.map((row) => row.table_name),
      ["content_feeds", "offers", "stories"],
    );
  });
});
});
