import type { ExtractedFeatures } from "@/src/click-quality/features/types";
import type { FeatureKey } from "@/src/click-quality/features/versions";
import { FEATURE_KEYS } from "@/src/click-quality/features/versions";
import { FAMILY_FEATURES, FEATURE_WEIGHTS } from "@/src/click-quality/classifier/weights";
import { FAMILY_IDS, type FamilyId } from "@/src/click-quality/classifier/versions";
import type { FamilyScore, ScoreBreakdown } from "@/src/click-quality/classifier/types";

export function featureFires(row: ExtractedFeatures, key: FeatureKey): boolean {
  return row.feature_vector[key] === true && row.feature_status[key] === "OBSERVED";
}

function winningFeatures(
  row: ExtractedFeatures,
  keys: readonly FeatureKey[],
  side: "auto" | "human",
  contribution: number,
): FeatureKey[] {
  if (contribution <= 0) {
    return [];
  }
  return FEATURE_KEYS.filter(
    (key) =>
      keys.includes(key) &&
      featureFires(row, key) &&
      FEATURE_WEIGHTS[key][side] === contribution,
  );
}

function scoreFamily(row: ExtractedFeatures, familyId: FamilyId): FamilyScore {
  const keys = FAMILY_FEATURES[familyId];
  let autoContribution = 0;
  let humanContribution = 0;
  for (const key of keys) {
    if (!featureFires(row, key)) {
      continue;
    }
    autoContribution = Math.max(autoContribution, FEATURE_WEIGHTS[key].auto);
    humanContribution = Math.max(humanContribution, FEATURE_WEIGHTS[key].human);
  }
  return {
    auto_contribution: autoContribution,
    human_contribution: humanContribution,
    auto_winning_features: winningFeatures(row, keys, "auto", autoContribution),
    human_winning_features: winningFeatures(row, keys, "human", humanContribution),
  };
}

export function scoreFeatureRow(row: ExtractedFeatures): ScoreBreakdown {
  const families = Object.fromEntries(FAMILY_IDS.map((familyId) => [familyId, scoreFamily(row, familyId)])) as Record<
    FamilyId,
    FamilyScore
  >;
  const auto_score = FAMILY_IDS.reduce((sum, familyId) => sum + families[familyId].auto_contribution, 0);
  const human_score = FAMILY_IDS.reduce((sum, familyId) => sum + families[familyId].human_contribution, 0);
  const auto_family_count = FAMILY_IDS.filter((familyId) => families[familyId].auto_contribution > 0).length;
  return { auto_score, human_score, auto_family_count, families };
}
