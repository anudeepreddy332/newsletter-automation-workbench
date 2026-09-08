import type { ExtractedFeatures } from "@/src/click-quality/features/types";
import { featureFires } from "@/src/click-quality/classifier/score";
import type { ThresholdConfig } from "@/src/click-quality/classifier/thresholds";
import type { ScoreBreakdown } from "@/src/click-quality/classifier/types";
import { POSITIVE_HUMAN_FEATURES, type Decision } from "@/src/click-quality/classifier/versions";

export function hasPositiveHumanSupport(row: ExtractedFeatures): boolean {
  return POSITIVE_HUMAN_FEATURES.some((key) => featureFires(row, key));
}

export function decideClassification(
  row: ExtractedFeatures,
  scores: ScoreBreakdown,
  config: ThresholdConfig,
): { decision: Decision; conflict: boolean } {
  const conflict =
    scores.auto_score >= config.conflict_auto_floor && scores.human_score >= config.conflict_human_floor;

  const likelyAutomated =
    row.evidence_quality !== "SPARSE" &&
    scores.auto_family_count >= config.min_auto_families &&
    scores.auto_score >= config.auto_score_min &&
    scores.human_score < config.human_contradiction_min &&
    !conflict;

  const likelyHuman =
    row.evidence_quality !== "SPARSE" &&
    hasPositiveHumanSupport(row) &&
    scores.human_score >= config.human_score_min &&
    scores.auto_score < config.auto_contradiction_min &&
    !conflict;

  if (likelyAutomated) {
    return { decision: "LIKELY_AUTOMATED", conflict };
  }
  if (likelyHuman) {
    return { decision: "LIKELY_HUMAN", conflict };
  }
  return { decision: "AMBIGUOUS_REVIEW", conflict };
}
