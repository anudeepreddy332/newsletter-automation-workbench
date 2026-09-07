import path from "node:path";

import { mockEverflowOfferCatalog } from "@/src/adapters/offers/mock-everflow";
import { MockWordPress } from "@/src/adapters/publishing/mock-wordpress";
import { WordPressComNewsletterPublisher } from "@/src/adapters/publishing/wordpress-com-newsletter";
import { readRealWordPressConfig } from "@/src/adapters/publishing/wordpress-config";
import { MockIterable } from "@/src/adapters/staging/mock-iterable";
import { openContentDatabase } from "@/src/db/database";
import { applyContentFoundationMigrations } from "@/src/db/migrate";
import { createWorkbenchContentSource } from "@/src/integration/http/create-content-source";
import { readNewsletterIntegrationMode } from "@/src/integration/http/config";
import { ContentRepository } from "@/src/repositories/content-repository";
import { WorkbenchRepository } from "@/src/repositories/workbench-repository";
import { WorkbenchService } from "@/src/workbench/workbench-service";

const databasePath =
  process.env.NEWSLETTER_WORKBENCH_DB_PATH ??
  path.join(process.cwd(), "local-development-only.db");
const { db } = openContentDatabase(databasePath);

applyContentFoundationMigrations(db);

const realWordPressConfig = readRealWordPressConfig();

export const newsletterIntegrationMode = readNewsletterIntegrationMode();

export const workbenchService = new WorkbenchService(
  createWorkbenchContentSource(),
  new ContentRepository(db),
  new WorkbenchRepository(db),
  new MockWordPress(),
  null,
  mockEverflowOfferCatalog,
  new MockIterable(),
  realWordPressConfig ? new WordPressComNewsletterPublisher(realWordPressConfig) : null,
);
