import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { CLICK_QUALITY_EVENTS_FIXTURE_PATH } from "@/src/click-quality/events-fixture";
import {
  CLICK_QUALITY_GROUND_TRUTH_PATH,
  hashChallengeEvents,
  readChallengeLock,
  readClickQualityManifest,
} from "@/tests/helpers/click-quality-challenge-lock";

const FORBIDDEN_RUNTIME_MARKERS = [
  "ground-truth.v1.json",
  "experiment-manifest.v1.json",
  "challenge.lock.v1.json",
  "ua-rules.v1.json",
  "asn-rules.v1.json",
];

function walkFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...walkFiles(full));
    } else if (/\.(ts|tsx|js|mjs)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

test("manifest contains exactly 60 exploratory and 30 challenge rows covering every event once", () => {
  const events = JSON.parse(readFileSync(CLICK_QUALITY_EVENTS_FIXTURE_PATH, "utf8")) as Array<{
    event_id: string;
  }>;
  const manifest = readClickQualityManifest();
  assert.equal(events.length, 90);
  assert.equal(Object.keys(manifest.membership).length, 90);
  const counts = { exploratory: 0, challenge: 0 };
  for (const event of events) {
    const split = manifest.membership[event.event_id];
    assert.ok(split === "exploratory" || split === "challenge", event.event_id);
    counts[split] += 1;
  }
  assert.equal(counts.exploratory, 60);
  assert.equal(counts.challenge, 30);
});

test("ground truth covers all 90 events with AUTOMATED, HUMAN, or UNKNOWN only", () => {
  const events = JSON.parse(readFileSync(CLICK_QUALITY_EVENTS_FIXTURE_PATH, "utf8")) as Array<{
    event_id: string;
  }>;
  const groundTruth = JSON.parse(readFileSync(CLICK_QUALITY_GROUND_TRUTH_PATH, "utf8")) as {
    labels: Record<string, { label: string; provenance: string }>;
  };
  assert.equal(Object.keys(groundTruth.labels).length, 90);
  for (const event of events) {
    const row = groundTruth.labels[event.event_id];
    assert.ok(row, event.event_id);
    assert.ok(["AUTOMATED", "HUMAN", "UNKNOWN"].includes(row.label));
    assert.equal(row.provenance, "SYNTHETIC_DESIGN");
  }
});

test("runtime click-quality modules cannot access ground truth, manifest, or phase-2 rule files", () => {
  const roots = [
    path.join(process.cwd(), "src/click-quality"),
    path.join(process.cwd(), "scripts/click-quality-ingest.ts"),
  ];
  const files = roots.flatMap((root) => {
    const stat = statSync(root);
    return stat.isDirectory() ? walkFiles(root) : [root];
  });
  assert.ok(files.length > 0);
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const marker of FORBIDDEN_RUNTIME_MARKERS) {
      assert.equal(source.includes(marker), false, `${file} mentions ${marker}`);
    }
  }
  assert.ok(CLICK_QUALITY_EVENTS_FIXTURE_PATH.endsWith("events.v1.json"));
});

test("future feature and classifier modules, if present, also cannot import eval artifacts", () => {
  const futureRoots = [
    path.join(process.cwd(), "src/click-quality/features"),
    path.join(process.cwd(), "src/click-quality/classify.ts"),
    path.join(process.cwd(), "src/click-quality/features.ts"),
    path.join(process.cwd(), "src/click-quality/score.ts"),
    path.join(process.cwd(), "src/click-quality/evaluate.ts"),
  ];
  for (const root of futureRoots) {
    try {
      const stat = statSync(root);
      const files = stat.isDirectory() ? walkFiles(root) : [root];
      for (const file of files) {
        const source = readFileSync(file, "utf8");
        for (const marker of ["ground-truth.v1.json", "experiment-manifest.v1.json"]) {
          assert.equal(source.includes(marker), false, `${file} mentions ${marker}`);
        }
      }
    } catch (error) {
      assert.ok((error as NodeJS.ErrnoException).code === "ENOENT");
    }
  }
});

test("challenge IDs cannot be recovered from prefix, suffix, file order, or numeric range", () => {
  const events = JSON.parse(readFileSync(CLICK_QUALITY_EVENTS_FIXTURE_PATH, "utf8")) as Array<{
    event_id: string;
  }>;
  const manifest = readClickQualityManifest();
  const challenge = new Set(
    Object.entries(manifest.membership)
      .filter(([, split]) => split === "challenge")
      .map(([eventId]) => eventId),
  );
  const ids = events.map((event) => event.event_id);
  const sorted = [...ids].sort();
  const sameSet = (candidate: string[]) =>
    candidate.length === 30 && candidate.every((id) => challenge.has(id));

  assert.equal(sameSet(ids.slice(0, 30)), false);
  assert.equal(sameSet(ids.slice(-30)), false);
  assert.equal(sameSet(sorted.slice(0, 30)), false);
  assert.equal(sameSet(sorted.slice(-30)), false);

  const prefixes = [...challenge].map((id) => id.slice(0, 8));
  const uniquePrefix = prefixes.every((prefix) => prefix === prefixes[0]);
  assert.equal(uniquePrefix, false);

  const suffixes = [...challenge].map((id) => id.slice(-4));
  const uniqueSuffix = suffixes.every((suffix) => suffix === suffixes[0]);
  assert.equal(uniqueSuffix, false);

  const lastNibbleEven = sorted.filter((id) => Number.parseInt(id.slice(-1), 16) % 2 === 0);
  assert.equal(sameSet(lastNibbleEven), false);
});

test("challenge hash uses the manifest-selected 30 records and is deterministic", () => {
  const events = JSON.parse(readFileSync(CLICK_QUALITY_EVENTS_FIXTURE_PATH, "utf8")) as Array<
    Record<string, unknown>
  >;
  const first = hashChallengeEvents(events);
  const shuffled = [...events].reverse();
  const second = hashChallengeEvents(shuffled);
  const lock = readChallengeLock();
  assert.equal(first.ids.length, 30);
  assert.equal(first.hash, second.hash);
  assert.equal(first.hash, lock.hash);
  assert.equal(lock.algorithm, "sha256");
  assert.equal(lock.event_count, 30);
  assert.match(lock.canonicalization, /experiment-manifest/);
});
