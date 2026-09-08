import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import test, { describe, type TestContext } from "node:test";
import { Client } from "pg";

import { ClickQualityFeatureConflictError } from "@/src/click-quality/errors";
import { extractClickQualityFeatures } from "@/src/click-quality/features/persist";
import { ClickQualityFeatureRepository } from "@/src/click-quality/features/repository";
import { ingestClickQualityEvents } from "@/src/click-quality/ingest";
import {
  openClickQualityDatabase,
  type ClickQualityDatabaseHandle,
} from "@/src/click-quality/postgres/database";
import { clickQualityEventFeatures } from "@/src/click-quality/postgres/schema";
import {
  INTEGRATION_DATABASE_URL_ENV,
  IntegrationDatabaseConfigError,
  readIntegrationDatabaseUrl,
} from "@/src/integration/postgres/config";
import { openIntegrationDatabase } from "@/src/integration/postgres/database";
import { applyIntegrationMigrations } from "@/src/integration/postgres/migrate";

const DEFAULT_LOCAL_URL =
  "postgres://integration:integration@127.0.0.1:5433/newsletter_integration";

const FROZEN_EVENT_COLUMNS = [
  "accept_header_present",
  "accept_language_present",
  "asn",
  "asn_org",
  "campaign_id",
  "cookie_state",
  "destination_host",
  "event_id",
  "http_method",
  "js_execution",
  "link_id",
  "link_position",
  "message_id",
  "message_sent_at",
  "network_type",
  "occurred_at",
  "recipient_id",
  "referrer_class",
  "schema_version",
  "source",
  "tracked_link_count",
  "user_agent_raw",
];

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
  run: (handle: ClickQualityDatabaseHandle) => Promise<void>,
): Promise<void> {
  const databaseName = `cq_feat_${randomBytes(6).toString("hex")}`;
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
    await run(handle);
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

describe("click-quality postgres feature extraction", { concurrency: 1 }, () => {
  test("migration adds event_features only and leaves events columns unchanged", async (t) => {
    const adminUrl = await requirePostgres(t);
    if (!adminUrl) {
      return;
    }

    await withIsolatedDatabase(adminUrl, async (handle) => {
      const tables = await handle.pool.query<{ table_name: string }>(
        `SELECT table_name
         FROM information_schema.tables
         WHERE table_schema = 'click_quality'
         ORDER BY table_name`,
      );
      assert.deepEqual(
        tables.rows.map((row) => row.table_name),
        ["event_features", "events"],
      );

      const forbidden = await handle.pool.query<{ table_name: string }>(
        `SELECT table_name
         FROM information_schema.tables
         WHERE table_name = ANY($1)`,
        [["threshold_sets", "classifications", "evaluation_runs", "ground_truth"]],
      );
      assert.equal(forbidden.rows.length, 0);

      const eventColumns = await handle.pool.query<{ column_name: string }>(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'click_quality'
           AND table_name = 'events'
         ORDER BY column_name`,
      );
      assert.deepEqual(
        eventColumns.rows.map((row) => row.column_name),
        FROZEN_EVENT_COLUMNS,
      );

      const featureColumns = await handle.pool.query<{ column_name: string }>(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'click_quality'
           AND table_name = 'event_features'
         ORDER BY column_name`,
      );
      assert.deepEqual(
        featureColumns.rows.map((row) => row.column_name),
        [
          "event_id",
          "evidence_quality",
          "extracted_at",
          "extractor_version",
          "feature_schema_version",
          "feature_status",
          "feature_vector",
          "feature_vector_hash",
          "observed_family_count",
        ].sort(),
      );
      assert.equal(
        featureColumns.rows.some((row) => row.column_name === "classifier_version"),
        false,
      );
    });
  });

  test("extracting 90 events twice stays at 90 rows with stable hashes", async (t) => {
    const adminUrl = await requirePostgres(t);
    if (!adminUrl) {
      return;
    }

    await withIsolatedDatabase(adminUrl, async (handle) => {
      const ingested = await ingestClickQualityEvents({ db: handle.db });
      assert.equal(ingested.stored, 90);
      const first = await extractClickQualityFeatures({
        db: handle.db,
        extractedAt: "2026-09-08T09:00:00.000Z",
      });
      assert.equal(first.processed, 90);
      assert.equal(first.stored, 90);
      const repository = new ClickQualityFeatureRepository(handle.db);
      const hashes = await repository.listHashes();
      const second = await extractClickQualityFeatures({
        db: handle.db,
        extractedAt: "2026-09-08T10:00:00.000Z",
      });
      assert.equal(second.processed, 90);
      assert.equal(second.stored, 90);
      assert.deepEqual(await repository.listHashes(), hashes);

      const extractedAt = await handle.pool.query<{ extracted_at: string | Date }>(
        `SELECT extracted_at FROM click_quality.event_features LIMIT 1`,
      );
      assert.equal(new Date(extractedAt.rows[0]!.extracted_at).toISOString(), "2026-09-08T09:00:00.000Z");
    });
  });

  test("incompatible stored feature hash fails instead of overwriting", async (t) => {
    const adminUrl = await requirePostgres(t);
    if (!adminUrl) {
      return;
    }

    await withIsolatedDatabase(adminUrl, async (handle) => {
      await ingestClickQualityEvents({ db: handle.db });
      await extractClickQualityFeatures({ db: handle.db });
      await handle.db.update(clickQualityEventFeatures).set({
        featureVectorHash: "0".repeat(64),
      });
      await assert.rejects(
        () => extractClickQualityFeatures({ db: handle.db }),
        ClickQualityFeatureConflictError,
      );
      const repository = new ClickQualityFeatureRepository(handle.db);
      assert.equal(await repository.countFeatures(), 90);
      const hashes = await repository.listHashes();
      assert.ok(hashes.every((row) => row.featureVectorHash === "0".repeat(64)));
    });
  });

  test("0002 SQL creates event_features without altering events", () => {
    const sql = readFileSync("drizzle-postgres/0002_melodic_stature.sql", "utf8");
    assert.match(sql, /CREATE TABLE "click_quality"\."event_features"/);
    assert.equal(sql.includes("ALTER TABLE \"click_quality\".\"events\""), false);
    assert.equal(sql.includes("DROP TABLE"), false);
    assert.equal(sql.includes("classifier_version"), false);
  });
});
