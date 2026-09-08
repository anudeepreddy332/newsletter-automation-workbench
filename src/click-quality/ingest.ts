import { readFile } from "node:fs/promises";

import type { ClickQualityEvent } from "@/src/click-quality/contract";
import { CLICK_QUALITY_EVENTS_FIXTURE_PATH } from "@/src/click-quality/events-fixture";
import { normalizeClickQualityEventBatch } from "@/src/click-quality/normalize";
import type { ClickQualityDatabase } from "@/src/click-quality/postgres/database";
import { ClickQualityEventRepository } from "@/src/click-quality/postgres/repository";

export type ClickQualityIngestResult = {
  processed: number;
  stored: number;
};

async function readEventsFixture(fixturePath: string): Promise<unknown> {
  const raw = await readFile(fixturePath, "utf8");
  return JSON.parse(raw) as unknown;
}

export async function ingestClickQualityEvents(options: {
  db: ClickQualityDatabase;
  events?: unknown;
  fixturePath?: string;
}): Promise<ClickQualityIngestResult> {
  const payload =
    options.events ??
    (await readEventsFixture(options.fixturePath ?? CLICK_QUALITY_EVENTS_FIXTURE_PATH));
  const batch: ClickQualityEvent[] = normalizeClickQualityEventBatch(payload);
  const repository = new ClickQualityEventRepository(options.db);
  await repository.saveNormalizedBatch(batch);
  return {
    processed: batch.length,
    stored: await repository.countEvents(),
  };
}
