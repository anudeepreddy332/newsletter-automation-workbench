import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { readRealWordPressConfig } from "@/src/adapters/publishing/wordpress-config";
import { openContentDatabase } from "@/src/db/database";
import { applyContentFoundationMigrations } from "@/src/db/migrate";
import {
  INTEGRATION_DATABASE_URL_ENV,
  IntegrationDatabaseConfigError,
  readIntegrationDatabaseConfig,
} from "@/src/integration/postgres/config";

const validUrl = "postgres://integration:integration@127.0.0.1:5433/newsletter_integration";

test("missing integration database configuration fails clearly", () => {
  assert.throws(
    () => readIntegrationDatabaseConfig({}),
    (error: unknown) => {
      assert.ok(error instanceof IntegrationDatabaseConfigError);
      assert.match(error.message, /INTEGRATION_DATABASE_URL is required/);
      assert.match(error.message, /does not need this variable/);
      return true;
    },
  );

  assert.throws(
    () => readIntegrationDatabaseConfig({ [INTEGRATION_DATABASE_URL_ENV]: "   " }),
    IntegrationDatabaseConfigError,
  );

  const env = { ...process.env };
  delete env[INTEGRATION_DATABASE_URL_ENV];
  const result = spawnSync(path.join(process.cwd(), "node_modules/.bin/tsx"), [
    "src/integration/postgres/run-migrations.ts",
  ], {
    cwd: process.cwd(),
    encoding: "utf8",
    env,
  });

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /INTEGRATION_DATABASE_URL is required/);
});

test("valid integration database configuration is accepted", () => {
  assert.deepEqual(
    readIntegrationDatabaseConfig({ [INTEGRATION_DATABASE_URL_ENV]: `  ${validUrl}  ` }),
    { url: validUrl },
  );
  assert.match(
    readIntegrationDatabaseConfig({
      [INTEGRATION_DATABASE_URL_ENV]:
        "postgresql://integration:integration@127.0.0.1:5433/newsletter_integration?sslmode=disable",
    }).url,
    /^postgresql:\/\//,
  );

  assert.throws(
    () => readIntegrationDatabaseConfig({ [INTEGRATION_DATABASE_URL_ENV]: "not-a-url" }),
    (error: unknown) => {
      assert.ok(error instanceof IntegrationDatabaseConfigError);
      assert.match(error.message, /malformed/);
      return true;
    },
  );
  assert.throws(
    () => readIntegrationDatabaseConfig({ [INTEGRATION_DATABASE_URL_ENV]: "mysql://127.0.0.1:3306/db" }),
    (error: unknown) => {
      assert.ok(error instanceof IntegrationDatabaseConfigError);
      assert.match(error.message, /postgres:\/\/ or postgresql:\/\//);
      return true;
    },
  );
  assert.throws(
    () => readIntegrationDatabaseConfig({ [INTEGRATION_DATABASE_URL_ENV]: "postgres://127.0.0.1:5433" }),
    (error: unknown) => {
      assert.ok(error instanceof IntegrationDatabaseConfigError);
      assert.match(error.message, /database name/);
      return true;
    },
  );
});

test("normal application configuration does not require Postgres", () => {
  const env = {
    WORDPRESS_SITE_ID: "123456",
    WORDPRESS_ACCESS_TOKEN: "token",
  };
  assert.deepEqual(readRealWordPressConfig(env), {
    siteId: "123456",
    accessToken: "token",
  });
  assert.equal(readRealWordPressConfig({}), null);

  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "newsletter-workbench-"));
  const databasePath = path.join(temporaryDirectory, "workbench.db");
  const { client, db } = openContentDatabase(databasePath);
  try {
    applyContentFoundationMigrations(db);
    const tables = client
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
      .all() as Array<{ name: string }>;
    assert.ok(tables.some((table) => table.name === "drafts"));
    assert.ok(tables.some((table) => table.name === "approved_newsletters"));
  } finally {
    client.close();
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }

  const runtimeSource = readFileSync(path.join(process.cwd(), "src/workbench/runtime.ts"), "utf8");
  const serviceSource = readFileSync(
    path.join(process.cwd(), "src/workbench/workbench-service.ts"),
    "utf8",
  );
  const configSource = readFileSync(
    path.join(process.cwd(), "src/integration/postgres/config.ts"),
    "utf8",
  );

  assert.doesNotMatch(runtimeSource, /INTEGRATION_DATABASE_URL|integration\/postgres/);
  assert.doesNotMatch(serviceSource, /INTEGRATION_DATABASE_URL|integration\/postgres/);
  assert.doesNotMatch(configSource, /NEXT_PUBLIC_/);
});
