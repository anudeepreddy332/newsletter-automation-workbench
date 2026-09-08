import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import test, { describe, type TestContext } from "node:test";
import { Client } from "pg";
import { eq } from "drizzle-orm";

import { classifyFeatureRow } from "@/src/click-quality/classifier/classify";
import { classifyClickQualityFeatures } from "@/src/click-quality/classifier/persist";
import { ClickQualityClassificationRepository } from "@/src/click-quality/classifier/repository";
import { FROZEN_THRESHOLD_SET } from "@/src/click-quality/classifier/thresholds";
import type { Classification } from "@/src/click-quality/classifier/types";
import { CLASSIFIER_VERSION, THRESHOLD_SET_ID, THRESHOLD_SET_STATUS } from "@/src/click-quality/classifier/versions";
import {
  ClickQualityClassificationConflictError,
  ClickQualityClassificationLineageError,
  ClickQualityClassifierVersionMismatchError,
  ClickQualityThresholdConflictError,
} from "@/src/click-quality/errors";
import { extractClickQualityFeatures } from "@/src/click-quality/features/persist";
import { ClickQualityFeatureRepository } from "@/src/click-quality/features/repository";
import { ingestClickQualityEvents } from "@/src/click-quality/ingest";
import { makeFeatureRow } from "@/tests/helpers/click-quality-features";
import {
  openClickQualityDatabase,
  type ClickQualityDatabaseHandle,
} from "@/src/click-quality/postgres/database";
import {
  clickQualityClassifications,
  clickQualityThresholdSets,
} from "@/src/click-quality/postgres/schema";
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

const FROZEN_FEATURE_COLUMNS = [
  "event_id",
  "evidence_quality",
  "extracted_at",
  "extractor_version",
  "feature_schema_version",
  "feature_status",
  "feature_vector",
  "feature_vector_hash",
  "observed_family_count",
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
  const databaseName = `cq_clf_${randomBytes(6).toString("hex")}`;
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

describe("click-quality postgres classification", { concurrency: 1 }, () => {
  test("migration creates threshold_sets and classifications only as Phase 3 tables", async (t) => {
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
        ["classifications", "event_features", "events", "threshold_sets"],
      );
      const forbidden = await handle.pool.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables WHERE table_name = ANY($1)`,
        [["evaluation_runs", "ground_truth"]],
      );
      assert.equal(forbidden.rows.length, 0);

      const eventColumns = await handle.pool.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'click_quality' AND table_name = 'events'
         ORDER BY column_name`,
      );
      assert.deepEqual(
        eventColumns.rows.map((row) => row.column_name),
        FROZEN_EVENT_COLUMNS,
      );
      const featureColumns = await handle.pool.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'click_quality' AND table_name = 'event_features'
         ORDER BY column_name`,
      );
      assert.deepEqual(
        featureColumns.rows.map((row) => row.column_name),
        [...FROZEN_FEATURE_COLUMNS].sort(),
      );
    });
  });

  test("classifying 90 feature rows twice stays at 90 with a frozen threshold set", async (t) => {
    const adminUrl = await requirePostgres(t);
    if (!adminUrl) {
      return;
    }

    await withIsolatedDatabase(adminUrl, async (handle) => {
      await ingestClickQualityEvents({ db: handle.db });
      await extractClickQualityFeatures({ db: handle.db });
      const first = await classifyClickQualityFeatures({
        db: handle.db,
        classifiedAt: "2026-09-08T12:00:00.000Z",
      });
      assert.equal(first.processed, 90);
      assert.equal(first.stored, 90);
      const repository = new ClickQualityClassificationRepository(handle.db);
      const firstRows = await repository.listClassifications();
      const second = await classifyClickQualityFeatures({
        db: handle.db,
        classifiedAt: "2026-09-08T13:00:00.000Z",
      });
      assert.equal(second.processed, 90);
      assert.equal(second.stored, 90);
      const secondRows = await repository.listClassifications();
      assert.deepEqual(
        firstRows.map((row) => ({
          event_id: row.event_id,
          decision: row.decision,
          auto_score: row.auto_score,
          human_score: row.human_score,
          conflict: row.conflict,
          reason_codes: row.reason_codes,
        })),
        secondRows.map((row) => ({
          event_id: row.event_id,
          decision: row.decision,
          auto_score: row.auto_score,
          human_score: row.human_score,
          conflict: row.conflict,
          reason_codes: row.reason_codes,
        })),
      );

      const thresholds = await handle.pool.query<{
        threshold_set_id: string;
        status: string;
        classifier_version: string;
        config: typeof FROZEN_THRESHOLD_SET.config;
        notes: string;
      }>(`SELECT threshold_set_id, status, classifier_version, config, notes FROM click_quality.threshold_sets`);
      assert.equal(thresholds.rows.length, 1);
      assert.equal(thresholds.rows[0]!.threshold_set_id, THRESHOLD_SET_ID);
      assert.equal(thresholds.rows[0]!.status, THRESHOLD_SET_STATUS);
      assert.equal(thresholds.rows[0]!.classifier_version, CLASSIFIER_VERSION);
      assert.equal(thresholds.rows[0]!.config.auto_score_min, 6);
      assert.match(thresholds.rows[0]!.notes, /not production/i);
    });
  });

  test("threshold config conflict fails closed", async (t) => {
    const adminUrl = await requirePostgres(t);
    if (!adminUrl) {
      return;
    }

    await withIsolatedDatabase(adminUrl, async (handle) => {
      await ingestClickQualityEvents({ db: handle.db });
      await extractClickQualityFeatures({ db: handle.db });
      await classifyClickQualityFeatures({ db: handle.db });
      await handle.db
        .update(clickQualityThresholdSets)
        .set({ notes: "tampered notes" })
        .where(eq(clickQualityThresholdSets.thresholdSetId, THRESHOLD_SET_ID));
      await assert.rejects(
        () => classifyClickQualityFeatures({ db: handle.db }),
        ClickQualityThresholdConflictError,
      );
    });
  });

  test("changed classification under the same identity fails closed", async (t) => {
    const adminUrl = await requirePostgres(t);
    if (!adminUrl) {
      return;
    }

    await withIsolatedDatabase(adminUrl, async (handle) => {
      await ingestClickQualityEvents({ db: handle.db });
      await extractClickQualityFeatures({ db: handle.db });
      await classifyClickQualityFeatures({ db: handle.db });
      await handle.db.update(clickQualityClassifications).set({
        decision: "LIKELY_HUMAN",
        autoScore: 0,
      });
      await assert.rejects(
        () => classifyClickQualityFeatures({ db: handle.db }),
        ClickQualityClassificationConflictError,
      );
      const repository = new ClickQualityClassificationRepository(handle.db);
      assert.equal(await repository.countClassifications(), 90);
    });
  });

  test("valid normal classification persists", async (t) => {
    const adminUrl = await requirePostgres(t);
    if (!adminUrl) {
      return;
    }

    await withIsolatedDatabase(adminUrl, async (handle) => {
      await ingestClickQualityEvents({ db: handle.db });
      await extractClickQualityFeatures({ db: handle.db });
      const features = await new ClickQualityFeatureRepository(handle.db).listFeatures();
      const row = classifyFeatureRow(features[0]!, FROZEN_THRESHOLD_SET);
      const repository = new ClickQualityClassificationRepository(handle.db);
      await repository.saveClassifiedBatch(FROZEN_THRESHOLD_SET, [row], "2026-09-08T12:00:00.000Z");
      assert.equal(await repository.countClassifications(), 1);
      const stored = (await repository.listClassifications())[0]!;
      assert.equal(stored.classifier_version, CLASSIFIER_VERSION);
      assert.equal(stored.threshold_set_id, THRESHOLD_SET_ID);
      assert.equal(stored.evidence_report.classifier_version, stored.classifier_version);
      assert.equal(stored.evidence_report.threshold_set_id, stored.threshold_set_id);
      const thresholds = await handle.pool.query<{ threshold_set_id: string }>(
        `SELECT threshold_set_id FROM click_quality.threshold_sets`,
      );
      assert.equal(thresholds.rows.length, 1);
      assert.equal(thresholds.rows[0]!.threshold_set_id, THRESHOLD_SET_ID);
    });
  });

  test("same-classifier custom threshold-set ID still persists", async (t) => {
    const adminUrl = await requirePostgres(t);
    if (!adminUrl) {
      return;
    }

    await withIsolatedDatabase(adminUrl, async (handle) => {
      await ingestClickQualityEvents({ db: handle.db });
      await extractClickQualityFeatures({ db: handle.db });
      const custom = {
        ...FROZEN_THRESHOLD_SET,
        threshold_set_id: "cq-thr-same-classifier-custom-id",
      };
      const features = await new ClickQualityFeatureRepository(handle.db).listFeatures();
      const row = classifyFeatureRow(features[0]!, custom);
      const repository = new ClickQualityClassificationRepository(handle.db);
      await repository.saveClassifiedBatch(custom, [row], "2026-09-08T12:00:00.000Z");
      assert.equal(await repository.countClassifications(), 1);
      const stored = (await repository.listClassifications())[0]!;
      assert.equal(stored.classifier_version, CLASSIFIER_VERSION);
      assert.equal(stored.threshold_set_id, custom.threshold_set_id);
      assert.equal(stored.evidence_report.threshold_set_id, custom.threshold_set_id);
      const thresholds = await handle.pool.query<{ threshold_set_id: string; classifier_version: string }>(
        `SELECT threshold_set_id, classifier_version FROM click_quality.threshold_sets`,
      );
      assert.equal(thresholds.rows.length, 1);
      assert.equal(thresholds.rows[0]!.threshold_set_id, custom.threshold_set_id);
      assert.equal(thresholds.rows[0]!.classifier_version, CLASSIFIER_VERSION);
    });
  });

  for (const [name, mutate] of [
    [
      "row.classifier_version different from CLASSIFIER_VERSION",
      (row: Classification) => {
        row.classifier_version = "cq-clf-v9.9.9";
        row.evidence_report.classifier_version = "cq-clf-v9.9.9";
      },
    ],
    [
      "row.classifier_version different from thresholdSet.classifier_version",
      (row: Classification) => {
        row.classifier_version = "cq-clf-v8.0.0";
        row.evidence_report.classifier_version = "cq-clf-v8.0.0";
      },
    ],
    [
      "row.threshold_set_id different from supplied thresholdSet.threshold_set_id",
      (row: Classification) => {
        row.threshold_set_id = "cq-thr-other-id";
        row.evidence_report.threshold_set_id = "cq-thr-other-id";
      },
    ],
    [
      "evidence_report.classifier_version mismatch",
      (row: Classification) => {
        row.evidence_report.classifier_version = "cq-clf-v9.9.9";
      },
    ],
    [
      "evidence_report.threshold_set_id mismatch",
      (row: Classification) => {
        row.evidence_report.threshold_set_id = "cq-thr-other-id";
      },
    ],
  ] as const) {
    test(`${name} is rejected and persists nothing`, async (t) => {
      const adminUrl = await requirePostgres(t);
      if (!adminUrl) {
        return;
      }

      await withIsolatedDatabase(adminUrl, async (handle) => {
        const row = classifyFeatureRow(
          makeFeatureRow({
            event_id: "cqe_lineage_reject",
            fires: {
              ua_known_scanner: true,
              network_known_email_security_asn: true,
              js_executed: true,
              cookie_present: true,
            },
          }),
          FROZEN_THRESHOLD_SET,
        );
        mutate(row);
        const repository = new ClickQualityClassificationRepository(handle.db);
        await assert.rejects(
          () => repository.saveClassifiedBatch(FROZEN_THRESHOLD_SET, [row], "2026-09-08T12:00:00.000Z"),
          ClickQualityClassificationLineageError,
        );
        assert.equal(await repository.countClassifications(), 0);
        const thresholds = await handle.pool.query<{ threshold_set_id: string }>(
          `SELECT threshold_set_id FROM click_quality.threshold_sets`,
        );
        assert.equal(thresholds.rows.length, 0);
      });
    });
  }

  test("wrong-version threshold set is rejected and persists nothing", async (t) => {
    const adminUrl = await requirePostgres(t);
    if (!adminUrl) {
      return;
    }

    await withIsolatedDatabase(adminUrl, async (handle) => {
      await ingestClickQualityEvents({ db: handle.db });
      await extractClickQualityFeatures({ db: handle.db });
      const incompatible = {
        ...FROZEN_THRESHOLD_SET,
        threshold_set_id: "cq-thr-wrong-classifier-persist",
        classifier_version: "cq-clf-v9.9.9",
      };
      await assert.rejects(
        () =>
          classifyClickQualityFeatures({
            db: handle.db,
            thresholdSet: incompatible,
          }),
        ClickQualityClassifierVersionMismatchError,
      );

      const repository = new ClickQualityClassificationRepository(handle.db);
      assert.equal(await repository.countClassifications(), 0);
      const thresholds = await handle.pool.query<{ threshold_set_id: string }>(
        `SELECT threshold_set_id FROM click_quality.threshold_sets`,
      );
      assert.equal(thresholds.rows.length, 0);
    });
  });

  test("0003 SQL creates Phase 3 tables without altering events or event_features", () => {
    const sql = readFileSync("drizzle-postgres/0003_lazy_iron_man.sql", "utf8");
    assert.match(sql, /CREATE TABLE "click_quality"\."classifications"/);
    assert.match(sql, /CREATE TABLE "click_quality"\."threshold_sets"/);
    assert.equal(sql.includes("ALTER TABLE \"click_quality\".\"events\""), false);
    assert.equal(sql.includes("ALTER TABLE \"click_quality\".\"event_features\""), false);
    assert.equal(sql.includes("evaluation_runs"), false);
    assert.equal(sql.includes("ground_truth"), false);
  });
});
