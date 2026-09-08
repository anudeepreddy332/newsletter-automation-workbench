import { classifyFeatureRow } from "@/src/click-quality/classifier/classify";
import { ClickQualityClassificationRepository } from "@/src/click-quality/classifier/repository";
import {
  assertThresholdSetCompatible,
  FROZEN_THRESHOLD_SET,
  type ThresholdSet,
} from "@/src/click-quality/classifier/thresholds";
import type { Classification } from "@/src/click-quality/classifier/types";
import { ClickQualityValidationError } from "@/src/click-quality/errors";
import { ClickQualityFeatureRepository } from "@/src/click-quality/features/repository";
import type { ExtractedFeatures } from "@/src/click-quality/features/types";
import type { ClickQualityDatabase } from "@/src/click-quality/postgres/database";

export type ClickQualityClassifyResult = {
  processed: number;
  stored: number;
};

export function classifyFeatureRows(
  rows: readonly ExtractedFeatures[],
  thresholdSet: ThresholdSet = FROZEN_THRESHOLD_SET,
): Classification[] {
  assertThresholdSetCompatible(thresholdSet);
  if (rows.length === 0) {
    throw new ClickQualityValidationError("No click-quality feature rows are available for classification.");
  }
  return rows.map((row) => classifyFeatureRow(row, thresholdSet));
}

export async function classifyClickQualityFeatures(options: {
  db: ClickQualityDatabase;
  features?: readonly ExtractedFeatures[];
  thresholdSet?: ThresholdSet;
  classifiedAt?: string;
}): Promise<ClickQualityClassifyResult> {
  const thresholdSet = options.thresholdSet ?? FROZEN_THRESHOLD_SET;
  assertThresholdSetCompatible(thresholdSet);
  const featureRepository = new ClickQualityFeatureRepository(options.db);
  const features = options.features ?? (await featureRepository.listFeatures());
  const classifications = classifyFeatureRows(features, thresholdSet);
  const repository = new ClickQualityClassificationRepository(options.db);
  await repository.saveClassifiedBatch(
    thresholdSet,
    classifications,
    options.classifiedAt ?? new Date().toISOString(),
  );
  return {
    processed: classifications.length,
    stored: await repository.countClassifications(),
  };
}
