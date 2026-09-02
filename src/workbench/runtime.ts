import path from "node:path";

import { BenzingaShapedFixtureSource } from "@/src/adapters/rss/benzinga-shaped-rss";
import { mockEverflowOfferCatalog } from "@/src/adapters/offers/mock-everflow";
import { MockWordPress } from "@/src/adapters/publishing/mock-wordpress";
import { RealWordPress } from "@/src/adapters/publishing/real-wordpress";
import { readRealWordPressConfig } from "@/src/adapters/publishing/wordpress-config";
import { MockIterable } from "@/src/adapters/staging/mock-iterable";
import { openContentDatabase } from "@/src/db/database";
import { applyContentFoundationMigrations } from "@/src/db/migrate";
import { ContentRepository } from "@/src/repositories/content-repository";
import { WorkbenchRepository } from "@/src/repositories/workbench-repository";
import { WorkbenchService } from "@/src/workbench/workbench-service";

const databasePath =
  process.env.NEWSLETTER_WORKBENCH_DB_PATH ??
  path.join(process.cwd(), "local-development-only.db");
const fixturePath = path.join(
  process.cwd(),
  "tests/fixtures/benzinga-shaped-financial-news.xml",
);
const { db } = openContentDatabase(databasePath);

applyContentFoundationMigrations(db);

const realWordPressConfig = readRealWordPressConfig();

export const workbenchService = new WorkbenchService(
  new BenzingaShapedFixtureSource(fixturePath),
  new ContentRepository(db),
  new WorkbenchRepository(db),
  new MockWordPress(),
  realWordPressConfig ? new RealWordPress(realWordPressConfig) : null,
  mockEverflowOfferCatalog,
  new MockIterable(),
);
