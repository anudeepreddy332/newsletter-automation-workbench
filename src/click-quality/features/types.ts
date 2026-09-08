import type { FeatureKey, FeatureStatus, EvidenceQuality } from "@/src/click-quality/features/versions";
import { FEATURE_KEYS } from "@/src/click-quality/features/versions";

export type FeatureVector = Record<FeatureKey, boolean>;
export type FeatureStatusMap = Record<FeatureKey, FeatureStatus>;

export type ExtractedFeatures = {
  event_id: string;
  feature_schema_version: string;
  extractor_version: string;
  evidence_quality: EvidenceQuality;
  observed_family_count: number;
  feature_vector: FeatureVector;
  feature_status: FeatureStatusMap;
  feature_vector_hash: string;
};

export function emptyFeatureVector(): FeatureVector {
  return Object.fromEntries(FEATURE_KEYS.map((key) => [key, false])) as FeatureVector;
}

export function observedStatusMap(): FeatureStatusMap {
  return Object.fromEntries(FEATURE_KEYS.map((key) => [key, "OBSERVED"])) as FeatureStatusMap;
}
