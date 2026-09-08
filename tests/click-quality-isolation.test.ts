import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { CLICK_QUALITY_EVENTS_FIXTURE_PATH } from "@/src/click-quality/events-fixture";
import {
  CLICK_QUALITY_ARTIFACTS,
  CLICK_QUALITY_MODULE_SPECS,
  categoryForRuntimeFile,
  listClickQualityRuntimeFiles,
  resolveModuleFiles,
} from "@/tests/helpers/click-quality-access-matrix";
import {
  CLICK_QUALITY_GROUND_TRUTH_PATH,
  hashChallengeEvents,
  readChallengeLock,
  readClickQualityManifest,
} from "@/tests/helpers/click-quality-challenge-lock";

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

test("every src/click-quality file belongs to a declared module category", () => {
  const files = listClickQualityRuntimeFiles();
  assert.ok(files.length > 0);
  for (const file of files) {
    assert.ok(
      categoryForRuntimeFile(file),
      `${file} is not assigned to ingestion, features, classifier, or evaluation`,
    );
  }
});

test("ingestion modules cannot read split, labels, challenge lock, or UA/ASN rules", () => {
  const spec = CLICK_QUALITY_MODULE_SPECS.find((item) => item.category === "ingestion");
  assert.ok(spec);
  const files = resolveModuleFiles(spec);
  assert.ok(files.length > 0);
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const marker of spec.forbiddenArtifacts) {
      assert.equal(source.includes(marker), false, `${file} mentions ${marker}`);
    }
  }
  assert.ok(CLICK_QUALITY_EVENTS_FIXTURE_PATH.endsWith(CLICK_QUALITY_ARTIFACTS.events));
});

test("feature extractor modules, if present, cannot read split or labels", () => {
  const spec = CLICK_QUALITY_MODULE_SPECS.find((item) => item.category === "features");
  assert.ok(spec);
  const files = resolveModuleFiles(spec);
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const marker of spec.forbiddenArtifacts) {
      assert.equal(source.includes(marker), false, `${file} mentions ${marker}`);
    }
  }
  assert.equal(spec.forbiddenArtifacts.includes(CLICK_QUALITY_ARTIFACTS.uaRules), false);
  assert.equal(spec.forbiddenArtifacts.includes(CLICK_QUALITY_ARTIFACTS.asnRules), false);
});

test("classifier modules, if present, cannot read split, labels, or UA/ASN rule files", () => {
  const spec = CLICK_QUALITY_MODULE_SPECS.find((item) => item.category === "classifier");
  assert.ok(spec);
  const files = resolveModuleFiles(spec);
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const marker of spec.forbiddenArtifacts) {
      assert.equal(source.includes(marker), false, `${file} mentions ${marker}`);
    }
  }
});

test("evaluation harness modules, if present, are allowed to read manifest, ground truth, and challenge lock", () => {
  const spec = CLICK_QUALITY_MODULE_SPECS.find((item) => item.category === "evaluation");
  assert.ok(spec);
  assert.deepEqual([...spec.forbiddenArtifacts], []);
  for (const artifact of [
    CLICK_QUALITY_ARTIFACTS.manifest,
    CLICK_QUALITY_ARTIFACTS.groundTruth,
    CLICK_QUALITY_ARTIFACTS.challengeLock,
  ]) {
    assert.equal(spec.forbiddenArtifacts.includes(artifact), false);
  }
  assert.ok(Array.isArray(resolveModuleFiles(spec)));
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
