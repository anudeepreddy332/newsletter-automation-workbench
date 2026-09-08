import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { readIntegrationDatabaseUrl } from "@/src/integration/postgres/config";
import * as schema from "@/src/click-quality/postgres/schema";

export type ClickQualityDatabase = ReturnType<typeof drizzle<typeof schema>>;

export type ClickQualityDatabaseHandle = {
  pool: Pool;
  db: ClickQualityDatabase;
  close: () => Promise<void>;
};

export function openClickQualityDatabase(
  connectionString?: string,
): ClickQualityDatabaseHandle {
  const pool = new Pool({
    connectionString: connectionString ?? readIntegrationDatabaseUrl(),
  });
  let closed = false;

  return {
    pool,
    db: drizzle(pool, { schema }),
    close: async () => {
      if (closed) {
        return;
      }
      closed = true;
      await pool.end();
    },
  };
}
