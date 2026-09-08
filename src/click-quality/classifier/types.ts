import type { FeatureKey } from "@/src/click-quality/features/versions";
import type { Decision, FamilyId, ReasonCode } from "@/src/click-quality/classifier/versions";

export type FamilyScore = {
  auto_contribution: number;
  human_contribution: number;
  auto_winning_features: FeatureKey[];
  human_winning_features: FeatureKey[];
};

export type EvidenceReport = {
  feature_schema_version: string;
  extractor_version: string;
  feature_vector_hash: string;
  classifier_version: string;
  threshold_set_id: string;
  auto_family_count: number;
  families: Record<FamilyId, FamilyScore>;
};

export type Classification = {
  event_id: string;
  classifier_version: string;
  threshold_set_id: string;
  decision: Decision;
  auto_score: number;
  human_score: number;
  conflict: boolean;
  reason_codes: ReasonCode[];
  evidence_report: EvidenceReport;
};

export type ScoreBreakdown = {
  auto_score: number;
  human_score: number;
  auto_family_count: number;
  families: Record<FamilyId, FamilyScore>;
};
