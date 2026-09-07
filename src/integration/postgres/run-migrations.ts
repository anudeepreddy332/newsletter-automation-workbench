import { openIntegrationDatabase } from "@/src/integration/postgres/database";
import { applyIntegrationMigrations } from "@/src/integration/postgres/migrate";

async function main(): Promise<void> {
  const { close, db } = openIntegrationDatabase();

  try {
    await applyIntegrationMigrations(db);
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
