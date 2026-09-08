import type { ClickQualityEvent } from "@/src/click-quality/contract";
import { ClickQualityValidationError } from "@/src/click-quality/errors";
import { assertClosedFeatureSet, extractFeatureSnapshot } from "@/src/click-quality/features/extract";
import { ClickQualityFeatureRepository } from "@/src/click-quality/features/repository";
import { loadAsnRules, loadUaRules, type AsnRule, type UaRule } from "@/src/click-quality/features/rules";
import type { ExtractedFeatures } from "@/src/click-quality/features/types";
import type { ClickQualityDatabase } from "@/src/click-quality/postgres/database";
import { ClickQualityEventRepository } from "@/src/click-quality/postgres/repository";

export type ClickQualityExtractResult = {
  processed: number;
  stored: number;
};

export async function extractClickQualityFeatures(options: {
  db: ClickQualityDatabase;
  events?: readonly ClickQualityEvent[];
  uaRules?: readonly UaRule[];
  asnRules?: readonly AsnRule[];
  extractedAt?: string;
}): Promise<ClickQualityExtractResult> {
  const eventRepository = new ClickQualityEventRepository(options.db);
  const events = options.events ?? (await eventRepository.listEvents());
  if (events.length === 0) {
    throw new ClickQualityValidationError("No click-quality events are stored for feature extraction.");
  }
  const uaRules = options.uaRules ?? (await loadUaRules());
  const asnRules = options.asnRules ?? (await loadAsnRules());
  const rows: ExtractedFeatures[] = extractFeatureSnapshot(events, { uaRules, asnRules });
  for (const row of rows) {
    assertClosedFeatureSet(row);
  }
  const repository = new ClickQualityFeatureRepository(options.db);
  await repository.saveExtractedBatch(rows, options.extractedAt ?? new Date().toISOString());
  return {
    processed: rows.length,
    stored: await repository.countFeatures(),
  };
}
