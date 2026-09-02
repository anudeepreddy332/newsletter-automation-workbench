import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import * as schema from "@/src/db/schema";

export type ContentDatabase = ReturnType<typeof drizzle<typeof schema>>;

export function openContentDatabase(filename: string) {
  const client = new Database(filename);
  client.pragma("foreign_keys = ON");

  return {
    client,
    db: drizzle(client, { schema }),
  };
}
