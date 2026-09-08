import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

export const CLICK_QUALITY_FIXTURE_DIR = path.join(
  process.cwd(),
  "tests/fixtures/click-quality",
);

export const CLICK_QUALITY_MANIFEST_PATH = path.join(
  CLICK_QUALITY_FIXTURE_DIR,
  "experiment-manifest.v1.json",
);

export const CLICK_QUALITY_GROUND_TRUTH_PATH = path.join(
  CLICK_QUALITY_FIXTURE_DIR,
  "ground-truth.v1.json",
);

export const CLICK_QUALITY_CHALLENGE_LOCK_PATH = path.join(
  CLICK_QUALITY_FIXTURE_DIR,
  "challenge.lock.v1.json",
);

type Manifest = {
  schema_version: string;
  membership: Record<string, "exploratory" | "challenge">;
};

type ChallengeLock = {
  schema_version: string;
  algorithm: string;
  encoding: string;
  event_count: number;
  canonicalization: string;
  hash: string;
};

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

export function readClickQualityManifest(): Manifest {
  return JSON.parse(readFileSync(CLICK_QUALITY_MANIFEST_PATH, "utf8")) as Manifest;
}

export function hashChallengeEvents(events: readonly Record<string, unknown>[]): {
  ids: string[];
  hash: string;
} {
  const manifest = readClickQualityManifest();
  const ids = Object.entries(manifest.membership)
    .filter(([, split]) => split === "challenge")
    .map(([eventId]) => eventId)
    .sort();
  if (ids.length !== 30) {
    throw new Error(`Challenge manifest must contain 30 IDs, found ${ids.length}.`);
  }
  const byId = new Map(events.map((event) => [String(event.event_id), event]));
  const selected = ids.map((eventId) => {
    const event = byId.get(eventId);
    if (!event) {
      throw new Error(`Challenge event ${eventId} is missing from events.v1.json.`);
    }
    return event;
  });
  return {
    ids,
    hash: createHash("sha256").update(canonicalJson(selected), "utf8").digest("hex"),
  };
}

export function readChallengeLock(): ChallengeLock {
  return JSON.parse(readFileSync(CLICK_QUALITY_CHALLENGE_LOCK_PATH, "utf8")) as ChallengeLock;
}
