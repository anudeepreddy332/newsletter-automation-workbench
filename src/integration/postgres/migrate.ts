import path from "node:path";

import { migrate } from "drizzle-orm/node-postgres/migrator";

import type { IntegrationDatabase } from "@/src/integration/postgres/database";

export const INTEGRATION_MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle-postgres");

export async function applyIntegrationMigrations(db: IntegrationDatabase): Promise<void> {
  await migrate(db, { migrationsFolder: INTEGRATION_MIGRATIONS_FOLDER });
}
