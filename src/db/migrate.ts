import path from "node:path";

import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import type { ContentDatabase } from "@/src/db/database";

export function applyContentFoundationMigrations(db: ContentDatabase): void {
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
}
