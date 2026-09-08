import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { classifyFeatureRow } from "@/src/click-quality/classifier/classify";
import { classifyFeatureRows } from "@/src/click-quality/classifier/persist";
import { scoreFeatureRow } from "@/src/click-quality/classifier/score";
import {
  FROZEN_THRESHOLD_CONFIG,
  FROZEN_THRESHOLD_SET,
} from "@/src/click-quality/classifier/thresholds";
import {
  CLASSIFIER_VERSION,
  REASON_CODES,
  THRESHOLD_SET_ID,
  THRESHOLD_SET_STATUS,
} from "@/src/click-quality/classifier/versions";
import {
  CLICK_QUALITY_ARTIFACTS,
  CLICK_QUALITY_MODULE_SPECS,
  resolveModuleFiles,
} from "@/tests/helpers/click-quality-access-matrix";
import { hashChallengeEvents, readChallengeLock } from "@/tests/helpers/click-quality-challenge-lock";
import { CLICK_QUALITY_EVENTS_FIXTURE_PATH } from "@/src/click-quality/events-fixture";
import { makeFeatureRow } from "@/tests/helpers/click-quality-features";

function classify(fires: Parameters<typeof makeFeatureRow>[0]["fires"], extra?: Omit<Parameters<typeof makeFeatureRow>[0], "event_id" | "fires">) {
  return classifyFeatureRow(
    makeFeatureRow({ event_id: "cqe_aaaaaaaaaaaaaa01", fires, ...extra }),
    FROZEN_THRESHOLD_SET,
  );
}

test("frozen classifier version and uncalibrated threshold set", () => {
  assert.equal(CLASSIFIER_VERSION, "cq-clf-v1.0.0");
  assert.equal(THRESHOLD_SET_ID, "cq-thr-exp90-uncalibrated-v1");
  assert.equal(THRESHOLD_SET_STATUS, "UNCALIBRATED_EXPERIMENT");
  assert.equal(FROZEN_THRESHOLD_SET.classifier_version, CLASSIFIER_VERSION);
  assert.match(FROZEN_THRESHOLD_SET.notes, /not calibrated/i);
  assert.match(FROZEN_THRESHOLD_SET.notes, /not production/i);
  assert.match(FROZEN_THRESHOLD_SET.notes, /experiment/i);
  assert.deepEqual(FROZEN_THRESHOLD_CONFIG, {
    auto_score_min: 6,
    human_score_min: 4,
    auto_contradiction_min: 3,
    human_contradiction_min: 3,
    min_auto_families: 2,
    conflict_auto_floor: 4,
    conflict_human_floor: 4,
  });
});

test("classifier modules cannot read split, labels, lock, events fixture, or UA/ASN rules", () => {
  const spec = CLICK_QUALITY_MODULE_SPECS.find((item) => item.category === "classifier")!;
  const files = resolveModuleFiles(spec);
  assert.ok(files.length > 0);
  const joined = files.map((file) => readFileSync(file, "utf8")).join("\n");
  for (const marker of spec.forbiddenArtifacts) {
    assert.equal(joined.includes(marker), false, marker);
  }
  assert.ok(spec.forbiddenArtifacts.includes(CLICK_QUALITY_ARTIFACTS.events));
  assert.ok(spec.forbiddenArtifacts.includes(CLICK_QUALITY_ARTIFACTS.uaRules));
  for (const marker of ["accuracy", "precision", "recall", "confusion matrix", "FPR"]) {
    assert.equal(joined.includes(marker), false, marker);
  }
});

test("evaluation modules are not implemented", () => {
  for (const relative of [
    "src/click-quality/evaluate.ts",
    "src/click-quality/evaluation",
    "src/click-quality/eval",
  ]) {
    assert.equal(existsSync(path.join(process.cwd(), relative)), false, relative);
  }
});

test("only TRUE + OBSERVED features score; false, MISSING, and NOT_APPLICABLE are zero", () => {
  const observed = scoreFeatureRow(
    makeFeatureRow({ event_id: "cqe_1", fires: { ua_known_scanner: true } }),
  );
  const falseFeature = scoreFeatureRow(
    makeFeatureRow({ event_id: "cqe_2", fires: { ua_known_scanner: false } }),
  );
  const missing = scoreFeatureRow(
    makeFeatureRow({
      event_id: "cqe_3",
      fires: { ua_known_scanner: true },
      status: { ua_known_scanner: "MISSING" },
    }),
  );
  const notApplicable = scoreFeatureRow(
    makeFeatureRow({
      event_id: "cqe_4",
      fires: { ua_known_scanner: true },
      status: { ua_known_scanner: "NOT_APPLICABLE" },
    }),
  );
  assert.equal(observed.families.F1.auto_contribution, 3);
  assert.equal(falseFeature.auto_score, 0);
  assert.equal(missing.auto_score, 0);
  assert.equal(notApplicable.auto_score, 0);
});

test("each family uses max not sum, and totals are sums of family maxima", () => {
  const row = makeFeatureRow({
    event_id: "cqe_5",
    fires: {
      http_method_is_head: true,
      ua_known_scanner: true,
      missing_accept_header: true,
      network_cloud_hosting: true,
      network_known_email_security_asn: true,
      burst_link_count_ge_3: true,
      all_tracked_links_in_2s: true,
      html_order_match_and_fast: true,
      rescan_similar_burst: true,
      retry_count_10min_ge_2: true,
      js_not_executed: true,
      cookie_present: true,
      delay_from_send_ge_60s_single_click: true,
      interclick_think_time_3s_to_30m: true,
      post_scanner_distinct_client: true,
    },
  });
  const scores = scoreFeatureRow(row);
  assert.equal(scores.families.F1.auto_contribution, 3);
  assert.deepEqual(scores.families.F1.auto_winning_features, ["ua_known_scanner"]);
  assert.equal(scores.families.F2.auto_contribution, 3);
  assert.equal(scores.families.F3.auto_contribution, 3);
  assert.equal(scores.families.F4.auto_contribution, 2);
  assert.equal(scores.families.F5.auto_contribution, 1);
  assert.equal(scores.families.F5.human_contribution, 1);
  assert.equal(scores.families.F6.human_contribution, 2);
  assert.equal(scores.families.F7.human_contribution, 2);
  assert.equal(scores.auto_score, 3 + 3 + 3 + 2 + 1);
  assert.equal(scores.human_score, 1 + 2 + 2);
  assert.equal(scores.auto_family_count, 5);
});

test("known two-family automation case emits LIKELY_AUTOMATED", () => {
  const result = classify({
    ua_known_scanner: true,
    network_known_email_security_asn: true,
    js_executed: true,
    cookie_present: true,
  });
  assert.equal(result.auto_score, 6);
  assert.equal(result.human_score, 2);
  assert.equal(result.evidence_report.auto_family_count, 2);
  assert.equal(result.decision, "LIKELY_AUTOMATED");
  assert.equal(result.conflict, false);
});

test("one automation family cannot emit LIKELY_AUTOMATED", () => {
  const result = classify({ ua_known_scanner: true, js_executed: true, cookie_present: true });
  assert.equal(result.auto_score, 3);
  assert.equal(result.evidence_report.auto_family_count, 1);
  assert.equal(result.decision, "AMBIGUOUS_REVIEW");
  assert.ok(result.reason_codes.includes("AMB_SINGLE_FAMILY_ONLY"));
});

test("human contradiction of 3 blocks LIKELY_AUTOMATED", () => {
  const result = classify({
    ua_known_scanner: true,
    network_known_email_security_asn: true,
    js_executed: true,
    network_residential: true,
  });
  assert.equal(result.auto_score, 6);
  assert.equal(result.human_score, 3);
  assert.equal(result.decision, "AMBIGUOUS_REVIEW");
});

test("positive human support with adequate score emits LIKELY_HUMAN", () => {
  const result = classify({
    ua_browser_like: true,
    js_executed: true,
    cookie_present: true,
    interclick_think_time_3s_to_30m: true,
    network_residential: true,
  });
  assert.equal(result.human_score, 6);
  assert.equal(result.auto_score, 0);
  assert.equal(result.decision, "LIKELY_HUMAN");
});

test("low auto score alone cannot emit LIKELY_HUMAN", () => {
  const result = classify({
    ua_browser_like: true,
    cookie_present: true,
    network_residential: true,
  });
  assert.equal(result.auto_score, 0);
  assert.equal(result.human_score, 3);
  assert.equal(result.decision, "AMBIGUOUS_REVIEW");
});

test("human score >=4 without qualifying positive-human support remains ambiguous", () => {
  const result = classify({
    ua_browser_like: true,
    cookie_present: true,
    network_residential: true,
    delay_from_send_ge_60s_single_click: true,
  });
  assert.equal(result.human_score, 4);
  assert.equal(result.decision, "AMBIGUOUS_REVIEW");
  assert.equal(result.reason_codes.includes("HUM_JS_EXECUTED"), false);
});

test("auto score >=3 blocks LIKELY_HUMAN", () => {
  const result = classify({
    ua_known_scanner: true,
    ua_browser_like: true,
    js_executed: true,
    cookie_present: true,
    interclick_think_time_3s_to_30m: true,
  });
  assert.equal(result.auto_score, 3);
  assert.ok(result.human_score >= 4);
  assert.equal(result.decision, "AMBIGUOUS_REVIEW");
});

test("SPARSE evidence is always AMBIGUOUS_REVIEW", () => {
  const result = classify(
    {
      ua_known_scanner: true,
      network_known_email_security_asn: true,
    },
    { evidence_quality: "SPARSE" },
  );
  assert.equal(result.auto_score, 6);
  assert.equal(result.decision, "AMBIGUOUS_REVIEW");
  assert.ok(result.reason_codes.includes("QUAL_SPARSE_EVIDENCE"));
});

test("auto>=4 and human>=4 sets conflict and AMBIGUOUS_REVIEW", () => {
  const result = classify({
    ua_known_scanner: true,
    network_known_email_security_asn: true,
    js_executed: true,
    interclick_think_time_3s_to_30m: true,
  });
  assert.ok(result.auto_score >= 4);
  assert.ok(result.human_score >= 4);
  assert.equal(result.conflict, true);
  assert.equal(result.decision, "AMBIGUOUS_REVIEW");
  assert.ok(result.reason_codes.includes("AMB_STRONG_CONTRADICTION"));
});

test("below-threshold mixed evidence is request-specific and ambiguous", () => {
  const first = classify({ ua_http_library: true, cookie_absent: true });
  const second = classify({ ua_browser_like: true, js_executed: true });
  assert.equal(first.decision, "AMBIGUOUS_REVIEW");
  assert.equal(second.decision, "AMBIGUOUS_REVIEW");
  assert.notEqual(first.auto_score, second.auto_score);
});

test("reason codes are closed, unique, sorted, and non-empty", () => {
  const result = classify({
    ua_known_scanner: true,
    network_known_email_security_asn: true,
    js_executed: true,
    cookie_present: true,
  });
  assert.ok(result.reason_codes.length > 0);
  assert.deepEqual(result.reason_codes, [...result.reason_codes].sort());
  assert.equal(new Set(result.reason_codes).size, result.reason_codes.length);
  for (const code of result.reason_codes) {
    assert.ok(REASON_CODES.includes(code), code);
  }
  assert.equal(result.reason_codes.some((code) => /anura|iterable|forward/i.test(code)), false);
});

test("quality and ambiguity reason codes fire from frozen mappings", () => {
  const quality = classify(
    {
      ua_missing: true,
      network_unknown: true,
      js_unknown: true,
      cookie_unknown: true,
    },
    { evidence_quality: "PARTIAL" },
  );
  assert.ok(quality.reason_codes.includes("QUAL_PARTIAL_EVIDENCE"));
  assert.ok(quality.reason_codes.includes("QUAL_UA_MISSING"));
  assert.ok(quality.reason_codes.includes("QUAL_NETWORK_UNKNOWN"));
  assert.ok(quality.reason_codes.includes("QUAL_JS_UNKNOWN"));
  assert.ok(quality.reason_codes.includes("QUAL_COOKIE_UNKNOWN"));

  const amb = classify({
    corporate_nat_context: true,
    vpn_context: true,
    privacy_relay_context: true,
    js_not_executed: true,
    network_residential: true,
    ua_browser_like: true,
    median_interclick_lt_100ms: true,
  });
  assert.equal(amb.decision, "AMBIGUOUS_REVIEW");
  for (const code of [
    "AMB_CORPORATE_NAT",
    "AMB_VPN",
    "AMB_PRIVACY_RELAY",
    "AMB_NO_JS_RESIDENTIAL",
    "AMB_VERY_FAST_BROWSER",
  ] as const) {
    assert.ok(amb.reason_codes.includes(code), code);
  }
});

test("evidence_report includes lineage, family max winners, and weighted features without reason codes", () => {
  const row = makeFeatureRow({
    event_id: "cqe_report",
    fires: {
      burst_link_count_ge_3: true,
      retry_count_10min_ge_2: true,
      delay_from_send_ge_60s_single_click: true,
      ua_known_scanner: true,
    },
  });
  const result = classifyFeatureRow(row, FROZEN_THRESHOLD_SET);
  assert.equal(result.evidence_report.feature_schema_version, "cq-feat-v1");
  assert.equal(result.evidence_report.extractor_version, "cq-extractor-v1.0.0");
  assert.equal(result.evidence_report.feature_vector_hash, row.feature_vector_hash);
  assert.equal(result.evidence_report.classifier_version, CLASSIFIER_VERSION);
  assert.equal(result.evidence_report.threshold_set_id, THRESHOLD_SET_ID);
  assert.deepEqual(result.evidence_report.families.F3.auto_winning_features, ["burst_link_count_ge_3"]);
  assert.equal(result.evidence_report.families.F3.auto_contribution, 2);
  assert.deepEqual(result.evidence_report.families.F4.auto_winning_features, ["retry_count_10min_ge_2"]);
  assert.deepEqual(result.evidence_report.families.F6.human_winning_features, [
    "delay_from_send_ge_60s_single_click",
  ]);
  assert.equal(result.reason_codes.includes("AUTO_HEAD_REQUEST"), false);
});

test("repeated classification is deterministic", () => {
  const row = makeFeatureRow({
    event_id: "cqe_det",
    fires: { ua_known_scanner: true, network_known_email_security_asn: true, js_executed: true },
  });
  const first = classifyFeatureRow(row, FROZEN_THRESHOLD_SET);
  const second = classifyFeatureRow(row, FROZEN_THRESHOLD_SET);
  const shuffled = classifyFeatureRows([row, row]);
  assert.deepEqual(first, second);
  assert.deepEqual(shuffled[0], shuffled[1]);
});

test("challenge lock hash remains unchanged", () => {
  const events = JSON.parse(readFileSync(CLICK_QUALITY_EVENTS_FIXTURE_PATH, "utf8")) as Array<
    Record<string, unknown>
  >;
  const lock = readChallengeLock();
  assert.equal(hashChallengeEvents(events).hash, lock.hash);
  assert.equal(lock.hash, "26f9f4c7f9b16e9041f02c1d91f4cc3bb518cf5fc69653acbe694d5ee234f212");
});
