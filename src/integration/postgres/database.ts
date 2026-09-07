import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { readIntegrationDatabaseUrl } from "@/src/integration/postgres/config";
import * as schema from "@/src/integration/postgres/schema";

export type IntegrationDatabase = ReturnType<typeof drizzle<typeof schema>>;

export type IntegrationDatabaseHandle = {
  pool: Pool;
  db: IntegrationDatabase;
  close: () => Promise<void>;
};

export function openIntegrationDatabase(
  connectionString?: string,
): IntegrationDatabaseHandle {
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
