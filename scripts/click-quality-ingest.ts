import { ingestClickQualityEvents } from "@/src/click-quality/ingest";
import { openClickQualityDatabase } from "@/src/click-quality/postgres/database";

function printError(error: unknown): void {
  console.error(error instanceof Error ? error.message : error);
}

async function main(): Promise<void> {
  let close: (() => Promise<void>) | undefined;
  try {
    const handle = openClickQualityDatabase();
    close = handle.close;
    const result = await ingestClickQualityEvents({ db: handle.db });
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
