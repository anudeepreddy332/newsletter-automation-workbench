import { openContentDatabase } from "@/src/db/database";
import { applyContentFoundationMigrations } from "@/src/db/migrate";

const databasePath = process.argv[2];

if (!databasePath) {
  throw new Error("Provide a SQLite database path as the first argument.");
}

const { client, db } = openContentDatabase(databasePath);
applyContentFoundationMigrations(db);
client.close();
