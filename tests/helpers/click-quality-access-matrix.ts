import { readdirSync, statSync } from "node:fs";
import path from "node:path";

export const CLICK_QUALITY_ARTIFACTS = {
  events: "events.v1.json",
  manifest: "experiment-manifest.v1.json",
  groundTruth: "ground-truth.v1.json",
  challengeLock: "challenge.lock.v1.json",
  uaRules: "ua-rules.v1.json",
  asnRules: "asn-rules.v1.json",
} as const;

export type ClickQualityModuleCategory =
  | "ingestion"
  | "features"
  | "classifier"
  | "evaluation";

export type ClickQualityModuleSpec = {
  category: ClickQualityModuleCategory;
  roots: readonly string[];
  forbiddenArtifacts: readonly string[];
};

const SPLIT_AND_LABEL_ARTIFACTS = [
  CLICK_QUALITY_ARTIFACTS.manifest,
  CLICK_QUALITY_ARTIFACTS.groundTruth,
  CLICK_QUALITY_ARTIFACTS.challengeLock,
] as const;

const RULE_ARTIFACTS = [
  CLICK_QUALITY_ARTIFACTS.uaRules,
  CLICK_QUALITY_ARTIFACTS.asnRules,
] as const;

export const CLICK_QUALITY_MODULE_SPECS: readonly ClickQualityModuleSpec[] = [
  {
    category: "ingestion",
    roots: [
      "src/click-quality/ingest.ts",
      "src/click-quality/events-fixture.ts",
      "src/click-quality/validate.ts",
      "src/click-quality/normalize.ts",
      "src/click-quality/contract.ts",
      "src/click-quality/errors.ts",
      "src/click-quality/postgres",
      "scripts/click-quality-ingest.ts",
    ],
    forbiddenArtifacts: [...SPLIT_AND_LABEL_ARTIFACTS, ...RULE_ARTIFACTS],
  },
  {
    category: "features",
    roots: ["src/click-quality/features.ts", "src/click-quality/features"],
    forbiddenArtifacts: [...SPLIT_AND_LABEL_ARTIFACTS],
  },
  {
    category: "classifier",
    roots: [
      "src/click-quality/classify.ts",
      "src/click-quality/score.ts",
      "src/click-quality/classifier",
    ],
    forbiddenArtifacts: [...SPLIT_AND_LABEL_ARTIFACTS, ...RULE_ARTIFACTS],
  },
  {
    category: "evaluation",
    roots: [
      "src/click-quality/evaluate.ts",
      "src/click-quality/evaluation",
      "src/click-quality/eval",
    ],
    forbiddenArtifacts: [],
  },
];

export function walkSourceFiles(root: string): string[] {
  const files: string[] = [];
  let stat;
  try {
    stat = statSync(root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return files;
    }
    throw error;
  }

  if (stat.isFile()) {
    return /\.(ts|tsx|js|mjs)$/.test(root) ? [root] : [];
  }

  for (const entry of readdirSync(root)) {
    files.push(...walkSourceFiles(path.join(root, entry)));
  }
  return files;
}

export function resolveModuleFiles(
  spec: ClickQualityModuleSpec,
  cwd = process.cwd(),
): string[] {
  return spec.roots.flatMap((root) => walkSourceFiles(path.join(cwd, root)));
}

export function listClickQualityRuntimeFiles(cwd = process.cwd()): string[] {
  return walkSourceFiles(path.join(cwd, "src/click-quality"));
}

export function categoryForRuntimeFile(
  file: string,
  cwd = process.cwd(),
): ClickQualityModuleCategory | undefined {
  const relative = path.relative(cwd, file).split(path.sep).join("/");
  for (const spec of CLICK_QUALITY_MODULE_SPECS) {
    for (const root of spec.roots) {
      if (relative === root || relative.startsWith(`${root}/`)) {
        return spec.category;
      }
    }
  }
  return undefined;
}
