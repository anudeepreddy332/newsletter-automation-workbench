import { ClickQualityValidationError } from "@/src/click-quality/errors";
import type { ExtractedFeatures } from "@/src/click-quality/features/types";
import { EXTRACTOR_VERSION, FEATURE_SCHEMA_VERSION } from "@/src/click-quality/features/versions";
import { collectReasonCodes } from "@/src/click-quality/classifier/reasons";
import { decideClassification } from "@/src/click-quality/classifier/decide";
import { scoreFeatureRow } from "@/src/click-quality/classifier/score";
import { assertThresholdSetCompatible, type ThresholdSet } from "@/src/click-quality/classifier/thresholds";
import type { Classification } from "@/src/click-quality/classifier/types";
import { CLASSIFIER_VERSION, REASON_CODES } from "@/src/click-quality/classifier/versions";

export function assertClassifiableFeatureRow(row: ExtractedFeatures): void {
  if (row.feature_schema_version !== FEATURE_SCHEMA_VERSION || row.extractor_version !== EXTRACTOR_VERSION) {
    throw new ClickQualityValidationError(
      `Classifier requires ${FEATURE_SCHEMA_VERSION}/${EXTRACTOR_VERSION}, received ${row.feature_schema_version}/${row.extractor_version} for ${row.event_id}.`,
    );
  }
}

export function classifyFeatureRow(row: ExtractedFeatures, thresholdSet: ThresholdSet): Classification {
  assertThresholdSetCompatible(thresholdSet);
  assertClassifiableFeatureRow(row);
  const scores = scoreFeatureRow(row);
  const { decision, conflict } = decideClassification(row, scores, thresholdSet.config);
  const reason_codes = collectReasonCodes({
    row,
    decision,
    conflict,
    autoFamilyCount: scores.auto_family_count,
    autoScore: scores.auto_score,
  });
  if (reason_codes.length === 0) {
    throw new ClickQualityValidationError(`Classification for ${row.event_id} produced no reason codes.`);
  }
  for (const code of reason_codes) {
    if (!REASON_CODES.includes(code)) {
      throw new ClickQualityValidationError(`Classification for ${row.event_id} used unknown reason code ${code}.`);
    }
  }
  return {
    event_id: row.event_id,
    classifier_version: CLASSIFIER_VERSION,
    threshold_set_id: thresholdSet.threshold_set_id,
    decision,
    auto_score: scores.auto_score,
    human_score: scores.human_score,
    conflict,
    reason_codes,
    evidence_report: {
      feature_schema_version: row.feature_schema_version,
      extractor_version: row.extractor_version,
      feature_vector_hash: row.feature_vector_hash,
      classifier_version: CLASSIFIER_VERSION,
      threshold_set_id: thresholdSet.threshold_set_id,
      auto_family_count: scores.auto_family_count,
      families: scores.families,
    },
  };
}
