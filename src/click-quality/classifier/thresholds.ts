import {
  CLASSIFIER_VERSION,
  THRESHOLD_SET_ID,
  THRESHOLD_SET_NOTES,
  THRESHOLD_SET_STATUS,
} from "@/src/click-quality/classifier/versions";

export type ThresholdConfig = {
  auto_score_min: number;
  human_score_min: number;
  auto_contradiction_min: number;
  human_contradiction_min: number;
  min_auto_families: number;
  conflict_auto_floor: number;
  conflict_human_floor: number;
};

export type ThresholdSet = {
  threshold_set_id: string;
  status: string;
  classifier_version: string;
  config: ThresholdConfig;
  notes: string;
};

export const FROZEN_THRESHOLD_CONFIG: ThresholdConfig = {
  auto_score_min: 6,
  human_score_min: 4,
  auto_contradiction_min: 3,
  human_contradiction_min: 3,
  min_auto_families: 2,
  conflict_auto_floor: 4,
  conflict_human_floor: 4,
};

export const FROZEN_THRESHOLD_SET: ThresholdSet = {
  threshold_set_id: THRESHOLD_SET_ID,
  status: THRESHOLD_SET_STATUS,
  classifier_version: CLASSIFIER_VERSION,
  config: FROZEN_THRESHOLD_CONFIG,
  notes: THRESHOLD_SET_NOTES,
};

const CONFIG_KEYS: Array<keyof ThresholdConfig> = [
  "auto_contradiction_min",
  "auto_score_min",
  "conflict_auto_floor",
  "conflict_human_floor",
  "human_contradiction_min",
  "human_score_min",
  "min_auto_families",
];

export function canonicalThresholdConfigJson(config: ThresholdConfig): string {
  return `{${CONFIG_KEYS.map((key) => `${JSON.stringify(key)}:${JSON.stringify(config[key])}`).join(",")}}`;
}

export function sameThresholdSet(left: ThresholdSet, right: ThresholdSet): boolean {
  return (
    left.threshold_set_id === right.threshold_set_id &&
    left.status === right.status &&
    left.classifier_version === right.classifier_version &&
    left.notes === right.notes &&
    canonicalThresholdConfigJson(left.config) === canonicalThresholdConfigJson(right.config)
  );
}
