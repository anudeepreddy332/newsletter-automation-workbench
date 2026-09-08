import type { ExtractedFeatures, FeatureStatusMap, FeatureVector } from "@/src/click-quality/features/types";
import { emptyFeatureVector, observedStatusMap } from "@/src/click-quality/features/types";
import { hashFeatureVector } from "@/src/click-quality/features/canonical";
import { EXTRACTOR_VERSION, FEATURE_SCHEMA_VERSION, type FeatureKey } from "@/src/click-quality/features/versions";
import type { EvidenceQuality, FeatureStatus } from "@/src/click-quality/features/versions";

export function makeFeatureRow(options: {
  event_id: string;
  fires?: Partial<Record<FeatureKey, boolean>>;
  status?: Partial<Record<FeatureKey, FeatureStatus>>;
  evidence_quality?: EvidenceQuality;
}): ExtractedFeatures {
  const feature_vector = emptyFeatureVector();
  const feature_status = observedStatusMap();
  for (const [key, value] of Object.entries(options.fires ?? {}) as Array<[FeatureKey, boolean]>) {
    feature_vector[key] = value;
  }
  for (const [key, value] of Object.entries(options.status ?? {}) as Array<[FeatureKey, FeatureStatus]>) {
    feature_status[key] = value;
  }
  return {
    event_id: options.event_id,
    feature_schema_version: FEATURE_SCHEMA_VERSION,
    extractor_version: EXTRACTOR_VERSION,
    evidence_quality: options.evidence_quality ?? "COMPLETE",
    observed_family_count: 3,
    feature_vector,
    feature_status,
    feature_vector_hash: hashFeatureVector(feature_vector),
  };
}

export function copyVector(vector: FeatureVector): FeatureVector {
  return { ...vector };
}

export function copyStatus(status: FeatureStatusMap): FeatureStatusMap {
  return { ...status };
}
