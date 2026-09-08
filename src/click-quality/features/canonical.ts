import { createHash } from "node:crypto";

import type { FeatureVector } from "@/src/click-quality/features/types";
import { FEATURE_KEYS } from "@/src/click-quality/features/versions";

export function canonicalFeatureVectorJson(vector: FeatureVector): string {
  return `{${FEATURE_KEYS.map((key) => `${JSON.stringify(key)}:${JSON.stringify(vector[key])}`).join(",")}}`;
}

export function hashFeatureVector(vector: FeatureVector): string {
  return createHash("sha256").update(canonicalFeatureVectorJson(vector), "utf8").digest("hex");
}
