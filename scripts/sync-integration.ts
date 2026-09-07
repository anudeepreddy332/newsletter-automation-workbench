import { openIntegrationDatabase } from "@/src/integration/postgres/database";
import { syncRssStoriesToPostgres } from "@/src/integration/story-sync";

function printError(error: unknown): void {
  console.error(error instanceof Error ? error.message : error);
}

async function main(): Promise<void> {
  const target = process.argv[2];
  if (target !== "stories") {
    console.error("Usage: npm run integration:sync -- stories");
    process.exitCode = 1;
    return;
  }

  let close: (() => Promise<void>) | undefined;
  try {
    const handle = openIntegrationDatabase();
    close = handle.close;
    const result = await syncRssStoriesToPostgres({ db: handle.db });
    console.log(`processed=${result.processed}`);
    console.log(`stored=${result.stored}`);
  } catch (error) {
    printError(error);
    process.exitCode = 1;
  } finally {
    await close?.();
  }
}

main().catch((error: unknown) => {
  printError(error);
  process.exitCode = 1;
});
