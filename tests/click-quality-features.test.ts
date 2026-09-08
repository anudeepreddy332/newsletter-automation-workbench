import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import type { ClickQualityEvent } from "@/src/click-quality/contract";
import { CLICK_QUALITY_EVENTS_FIXTURE_PATH } from "@/src/click-quality/events-fixture";
import { hashFeatureVector } from "@/src/click-quality/features/canonical";
import { assertClosedFeatureSet, extractFeatureSnapshot, medianGapMs } from "@/src/click-quality/features/extract";
import { loadAsnRules, loadUaRules } from "@/src/click-quality/features/rules";
import type { ExtractedFeatures } from "@/src/click-quality/features/types";
import { classifyUserAgent } from "@/src/click-quality/features/ua";
import {
  EXTRACTOR_VERSION,
  FEATURE_KEYS,
  FEATURE_SCHEMA_VERSION,
  UA_CLASS_PRECEDENCE,
} from "@/src/click-quality/features/versions";
import {
  CLICK_QUALITY_ARTIFACTS,
  CLICK_QUALITY_MODULE_SPECS,
  resolveModuleFiles,
} from "@/tests/helpers/click-quality-access-matrix";
import { hashChallengeEvents, readChallengeLock } from "@/tests/helpers/click-quality-challenge-lock";
import {
  CHROME_UA,
  HEADLESS_UA,
  HTTPX_UA,
  MAILSEC_UA,
  SAFARI_UA,
  isoFromT0,
  makeEvent,
  minutes,
} from "@/tests/helpers/click-quality-events";

const NETWORK_TYPE_FEATURES = [
  "network_cloud_hosting",
  "network_residential",
  "network_corporate",
  "network_vpn",
  "network_privacy_relay",
  "network_unknown",
] as const;

const JS_FEATURES = ["js_executed", "js_not_executed", "js_unknown"] as const;
const COOKIE_FEATURES = ["cookie_present", "cookie_absent", "cookie_unknown"] as const;

async function extract(events: readonly ClickQualityEvent[]): Promise<ExtractedFeatures[]> {
  return extractFeatureSnapshot(events, {
    uaRules: await loadUaRules(),
    asnRules: await loadAsnRules(),
  });
}

function rowFor(rows: readonly ExtractedFeatures[], eventId: string): ExtractedFeatures {
  const row = rows.find((item) => item.event_id === eventId);
  assert.ok(row, eventId);
  return row;
}

function trueNetworkFeatures(row: ExtractedFeatures): string[] {
  return NETWORK_TYPE_FEATURES.filter((key) => row.feature_vector[key]);
}

function trueKeys(row: ExtractedFeatures, keys: readonly string[]): string[] {
  return keys.filter((key) => row.feature_vector[key as keyof ExtractedFeatures["feature_vector"]]);
}

test("closed cq-feat-v1 key set, versions, and UA precedence are frozen", () => {
  assert.equal(FEATURE_SCHEMA_VERSION, "cq-feat-v1");
  assert.equal(EXTRACTOR_VERSION, "cq-extractor-v1.0.0");
  assert.deepEqual([...UA_CLASS_PRECEDENCE], [
    "known_scanner",
    "http_library",
    "headless_browser",
    "browser_like",
  ]);
  assert.deepEqual([...FEATURE_KEYS], [
    "http_method_is_head",
    "ua_known_scanner",
    "ua_http_library",
    "ua_headless_browser",
    "ua_browser_like",
    "ua_missing",
    "missing_accept_language",
    "missing_accept_header",
    "network_cloud_hosting",
    "network_known_email_security_asn",
    "network_residential",
    "network_corporate",
    "network_vpn",
    "network_privacy_relay",
    "network_unknown",
    "burst_link_count_ge_3",
    "all_tracked_links_in_2s",
    "html_order_match_and_fast",
    "median_interclick_lt_100ms",
    "rescan_similar_burst",
    "retry_count_10min_ge_2",
    "js_not_executed",
    "js_executed",
    "cookie_absent",
    "cookie_present",
    "js_unknown",
    "cookie_unknown",
    "delay_from_send_ge_60s_single_click",
    "interclick_think_time_3s_to_30m",
    "repeat_same_link_gap_ge_1h",
    "immediate_after_send_lt_15s",
    "post_scanner_distinct_client",
    "corporate_nat_context",
    "vpn_context",
    "privacy_relay_context",
  ]);
});

test("classifier and evaluation modules are not implemented", () => {
  const cwd = process.cwd();
  for (const relative of [
    "src/click-quality/classify.ts",
    "src/click-quality/score.ts",
    "src/click-quality/classifier",
    "src/click-quality/evaluate.ts",
    "src/click-quality/evaluation",
    "src/click-quality/eval",
  ]) {
    assert.equal(existsSync(path.join(cwd, relative)), false, relative);
  }

  const featureFiles = resolveModuleFiles(
    CLICK_QUALITY_MODULE_SPECS.find((item) => item.category === "features")!,
  );
  assert.ok(featureFiles.length > 0);
  for (const file of featureFiles) {
    const source = readFileSync(file, "utf8");
    for (const marker of [
      "auto_score",
      "human_score",
      "LIKELY_AUTOMATED",
      "LIKELY_HUMAN",
      "AMBIGUOUS_REVIEW",
      "threshold_sets",
      "classifier_version",
      "precision",
      "recall",
      "confusion matrix",
    ]) {
      assert.equal(source.includes(marker), false, `${file} mentions ${marker}`);
    }
  }
});

test("extractor may read UA and ASN rules and must not mention split or labels", () => {
  const spec = CLICK_QUALITY_MODULE_SPECS.find((item) => item.category === "features")!;
  const files = resolveModuleFiles(spec);
  const joined = files.map((file) => readFileSync(file, "utf8")).join("\n");
  assert.match(joined, /ua-rules\.v1\.json/);
  assert.match(joined, /asn-rules\.v1\.json/);
  for (const marker of spec.forbiddenArtifacts) {
    assert.equal(joined.includes(marker), false, marker);
  }
  assert.equal(spec.forbiddenArtifacts.includes(CLICK_QUALITY_ARTIFACTS.uaRules), false);
  assert.equal(spec.forbiddenArtifacts.includes(CLICK_QUALITY_ARTIFACTS.asnRules), false);
});

test("HeadlessChrome wins over Chrome/Safari browser_like by frozen precedence", async () => {
  const uaRules = await loadUaRules();
  assert.equal(classifyUserAgent(HEADLESS_UA, uaRules), "headless_browser");
  assert.equal(classifyUserAgent(CHROME_UA, uaRules), "browser_like");
  assert.equal(classifyUserAgent(MAILSEC_UA, uaRules), "known_scanner");
  assert.equal(classifyUserAgent(HTTPX_UA, uaRules), "http_library");
  assert.equal(classifyUserAgent(SAFARI_UA, uaRules), "browser_like");
  assert.equal(classifyUserAgent(null, uaRules), null);

  const [row] = await extract([
    makeEvent({ event_id: "cqe_aaaaaaaaaaaaaa01", user_agent_raw: HEADLESS_UA }),
  ]);
  assert.equal(row.feature_vector.ua_headless_browser, true);
  assert.equal(row.feature_vector.ua_browser_like, false);
  assert.equal(row.feature_status.ua_headless_browser, "OBSERVED");
});

test("missing UA sets ua_missing and does not invent a UA class", async () => {
  const [row] = await extract([makeEvent({ event_id: "cqe_aaaaaaaaaaaaaa02", user_agent_raw: null })]);
  assert.equal(row.feature_vector.ua_missing, true);
  assert.equal(row.feature_vector.ua_known_scanner, false);
  assert.equal(row.feature_vector.ua_http_library, false);
  assert.equal(row.feature_vector.ua_headless_browser, false);
  assert.equal(row.feature_vector.ua_browser_like, false);
  assert.equal(row.feature_status.ua_known_scanner, "MISSING");
  assert.equal(row.feature_status.ua_http_library, "MISSING");
  assert.equal(row.feature_status.ua_headless_browser, "MISSING");
  assert.equal(row.feature_status.ua_browser_like, "MISSING");
  assert.equal(row.feature_status.ua_missing, "OBSERVED");
});

test("email-security ASN fires only from the frozen synthetic rule", async () => {
  const security = (
    await extract([
      makeEvent({
        event_id: "cqe_aaaaaaaaaaaaaa03",
        asn: 64512,
        asn_org: "Synthetic Email Security Cloud",
        network_type: "cloud_hosting",
      }),
    ])
  )[0];
  const cloudNotSecurity = (
    await extract([
      makeEvent({
        event_id: "cqe_aaaaaaaaaaaaaa04",
        asn: 64513,
        asn_org: "Synthetic Cloud Host",
        network_type: "cloud_hosting",
      }),
    ])
  )[0];
  const unknownAsn = (
    await extract([
      makeEvent({
        event_id: "cqe_aaaaaaaaaaaaaa05",
        asn: 64999,
        asn_org: null,
        network_type: "unknown",
      }),
    ])
  )[0];
  const missingAsn = (
    await extract([
      makeEvent({
        event_id: "cqe_aaaaaaaaaaaaaa06",
        asn: null,
        asn_org: null,
        network_type: "unknown",
      }),
    ])
  )[0];

  assert.equal(security.feature_vector.network_known_email_security_asn, true);
  assert.equal(security.feature_status.network_known_email_security_asn, "OBSERVED");
  assert.equal(cloudNotSecurity.feature_vector.network_known_email_security_asn, false);
  assert.equal(unknownAsn.feature_vector.network_known_email_security_asn, false);
  assert.equal(unknownAsn.feature_status.network_known_email_security_asn, "OBSERVED");
  assert.equal(missingAsn.feature_vector.network_known_email_security_asn, false);
  assert.equal(missingAsn.feature_status.network_known_email_security_asn, "MISSING");
});

test("exactly one network_type feature fires", async () => {
  for (const networkType of [
    "cloud_hosting",
    "residential",
    "corporate",
    "vpn",
    "privacy_relay",
    "unknown",
  ] as const) {
    const [row] = await extract([
      makeEvent({ event_id: "cqe_aaaaaaaaaaaaaa07", network_type: networkType }),
    ]);
    assert.deepEqual(trueNetworkFeatures(row), [`network_${networkType}`]);
  }
});

test("HEAD method and missing accept-header semantics", async () => {
  const head = (await extract([makeEvent({ event_id: "cqe_aaaaaaaaaaaaaa08", http_method: "HEAD" })]))[0];
  const missingHeader = (
    await extract([
      makeEvent({
        event_id: "cqe_aaaaaaaaaaaaaa09",
        accept_header_present: false,
        accept_language_present: false,
      }),
    ])
  )[0];
  const unknownHeader = (
    await extract([
      makeEvent({
        event_id: "cqe_aaaaaaaaaaaaaa0a",
        accept_header_present: null,
        accept_language_present: null,
      }),
    ])
  )[0];

  assert.equal(head.feature_vector.http_method_is_head, true);
  assert.equal(missingHeader.feature_vector.missing_accept_header, true);
  assert.equal(missingHeader.feature_vector.missing_accept_language, true);
  assert.equal(missingHeader.feature_status.missing_accept_header, "OBSERVED");
  assert.equal(unknownHeader.feature_vector.missing_accept_header, false);
  assert.equal(unknownHeader.feature_vector.missing_accept_language, false);
  assert.equal(unknownHeader.feature_status.missing_accept_header, "MISSING");
  assert.equal(unknownHeader.feature_status.missing_accept_language, "MISSING");
});

test("burst of three distinct links in two seconds fires burst_link_count_ge_3", async () => {
  const events = [1, 2, 3].map((position) =>
    makeEvent({
      event_id: `cqe_bbbbbbbbbbbbbb0${position}`,
      link_id: `cql_bbbbbbbbbbbbbb0${position}`,
      link_position: position,
      tracked_link_count: 4,
      occurred_at: isoFromT0((position - 1) * 40),
    }),
  );
  const rows = await extract(events);
  assert.equal(rows.every((row) => row.feature_vector.burst_link_count_ge_3), true);
  const two = await extract(events.slice(0, 2));
  assert.equal(two.every((row) => row.feature_vector.burst_link_count_ge_3), false);
});

test("all tracked links in 2s is true only when coverage is known and complete", async () => {
  const complete = [1, 2, 3].map((position) =>
    makeEvent({
      event_id: `cqe_cccccccccccccc0${position}`,
      link_id: `cql_cccccccccccccc0${position}`,
      link_position: position,
      tracked_link_count: 3,
      occurred_at: isoFromT0((position - 1) * 30),
    }),
  );
  const missingCount = complete.map((event, index) =>
    makeEvent({
      ...event,
      event_id: `cqe_cccccccccccccc1${index + 1}`,
      tracked_link_count: null,
    }),
  );
  const duplicates = [
    makeEvent({
      event_id: "cqe_cccccccccccccc21",
      link_id: "cql_cccccccccccccc01",
      link_position: 1,
      tracked_link_count: 2,
      occurred_at: isoFromT0(0),
    }),
    makeEvent({
      event_id: "cqe_cccccccccccccc22",
      link_id: "cql_cccccccccccccc01",
      link_position: 1,
      tracked_link_count: 2,
      occurred_at: isoFromT0(20),
    }),
  ];

  const completeRows = await extract(complete);
  const missingRows = await extract(missingCount);
  const duplicateRows = await extract(duplicates);

  assert.equal(completeRows[0]!.feature_vector.all_tracked_links_in_2s, true);
  assert.equal(completeRows[0]!.feature_status.all_tracked_links_in_2s, "OBSERVED");
  assert.equal(missingRows[0]!.feature_vector.all_tracked_links_in_2s, false);
  assert.equal(missingRows[0]!.feature_status.all_tracked_links_in_2s, "MISSING");
  assert.equal(duplicateRows[0]!.feature_vector.all_tracked_links_in_2s, false);
});

test("HTML-order burst requires increasing positions and known positions", async () => {
  const ordered = [1, 2, 3].map((position) =>
    makeEvent({
      event_id: `cqe_dddddddddddddd0${position}`,
      link_id: `cql_dddddddddddddd0${position}`,
      link_position: position,
      tracked_link_count: 3,
      occurred_at: isoFromT0((position - 1) * 40),
    }),
  );
  const reversed = ordered.map((event, index) =>
    makeEvent({
      ...event,
      event_id: `cqe_dddddddddddddd1${index + 1}`,
      link_position: 3 - index,
    }),
  );
  const missingPosition = ordered.map((event, index) =>
    makeEvent({
      ...event,
      event_id: `cqe_dddddddddddddd2${index + 1}`,
      link_position: index === 1 ? null : event.link_position,
    }),
  );
  const singleton = [makeEvent({ event_id: "cqe_dddddddddddddd31" })];

  assert.equal((await extract(ordered))[0]!.feature_vector.html_order_match_and_fast, true);
  assert.equal((await extract(reversed))[0]!.feature_vector.html_order_match_and_fast, false);
  const missing = (await extract(missingPosition))[0]!;
  assert.equal(missing.feature_vector.html_order_match_and_fast, false);
  assert.equal(missing.feature_status.html_order_match_and_fast, "MISSING");
  const single = (await extract(singleton))[0]!;
  assert.equal(single.feature_vector.html_order_match_and_fast, false);
  assert.equal(single.feature_status.html_order_match_and_fast, "NOT_APPLICABLE");
});

test("median interclick uses odd middle gap and even mean of two middle gaps", () => {
  assert.equal(medianGapMs([0]), null);
  assert.equal(medianGapMs([0, 40, 90]), 45);
  assert.equal(medianGapMs([0, 40, 50, 140]), 40);
  assert.equal(medianGapMs([0, 100]), 100);
  assert.equal(medianGapMs([0, 99]), 99);
});

test("median_interclick_lt_100ms uses a strict less-than 100ms boundary", async () => {
  const under = [0, 40, 90].map((offset, index) =>
    makeEvent({
      event_id: `cqe_eeeeeeeeeeeeee0${index + 1}`,
      link_id: `cql_eeeeeeeeeeeeee0${index + 1}`,
      link_position: index + 1,
      tracked_link_count: 3,
      occurred_at: isoFromT0(offset),
    }),
  );
  const atBoundary = [0, 100, 200].map((offset, index) =>
    makeEvent({
      event_id: `cqe_eeeeeeeeeeeeee1${index + 1}`,
      link_id: `cql_eeeeeeeeeeeeee1${index + 1}`,
      link_position: index + 1,
      tracked_link_count: 3,
      occurred_at: isoFromT0(offset),
    }),
  );
  assert.equal((await extract(under))[0]!.feature_vector.median_interclick_lt_100ms, true);
  assert.equal((await extract(atBoundary))[0]!.feature_vector.median_interclick_lt_100ms, false);
});

test("rescan_similar_burst applies only to the later matching burst", async () => {
  const first = [1, 2, 3].map((position) =>
    makeEvent({
      event_id: `cqe_ffffffffffffff0${position}`,
      recipient_id: "cqr_ffffffffffffffff",
      message_id: "cqm_ffffffffffffffff",
      link_id: `cql_ffffffffffffff0${position}`,
      link_position: position,
      tracked_link_count: 3,
      user_agent_raw: MAILSEC_UA,
      network_type: "cloud_hosting",
      asn: 64512,
      occurred_at: isoFromT0((position - 1) * 40),
      js_execution: "not_executed",
      cookie_state: "absent",
    }),
  );
  const later = first.map((event, index) =>
    makeEvent({
      ...event,
      event_id: `cqe_ffffffffffffff1${index + 1}`,
      occurred_at: isoFromT0(minutes(11) + index * 40),
    }),
  );
  const tooSoon = first.map((event, index) =>
    makeEvent({
      ...event,
      event_id: `cqe_ffffffffffffff2${index + 1}`,
      occurred_at: isoFromT0(minutes(5) + index * 40),
    }),
  );

  const rows = await extract([...first, ...later]);
  assert.equal(rowFor(rows, "cqe_ffffffffffffff01").feature_vector.rescan_similar_burst, false);
  assert.equal(rowFor(rows, "cqe_ffffffffffffff11").feature_vector.rescan_similar_burst, true);
  const earlyRepeat = await extract([...first, ...tooSoon]);
  assert.equal(rowFor(earlyRepeat, "cqe_ffffffffffffff21").feature_vector.rescan_similar_burst, false);
});

test("retry_count_10min_ge_2 counts inclusive same-link requests in a 10-minute lookback", async () => {
  const first = makeEvent({
    event_id: "cqe_1111111111111111",
    link_id: "cql_1111111111111111",
    occurred_at: isoFromT0(0),
  });
  const inside = makeEvent({
    event_id: "cqe_1111111111111112",
    link_id: "cql_1111111111111111",
    occurred_at: isoFromT0(minutes(10)),
  });
  const outside = makeEvent({
    event_id: "cqe_1111111111111113",
    link_id: "cql_1111111111111111",
    occurred_at: isoFromT0(minutes(10) + 1),
  });

  const boundary = await extract([first, inside]);
  assert.equal(rowFor(boundary, "cqe_1111111111111111").feature_vector.retry_count_10min_ge_2, false);
  assert.equal(rowFor(boundary, "cqe_1111111111111112").feature_vector.retry_count_10min_ge_2, true);

  const afterWindow = await extract([first, outside]);
  assert.equal(rowFor(afterWindow, "cqe_1111111111111113").feature_vector.retry_count_10min_ge_2, false);
});

test("JS and cookie states are exclusive observed enums", async () => {
  const executed = (await extract([makeEvent({ event_id: "cqe_2222222222222221" })]))[0]!;
  const notExecuted = (
    await extract([
      makeEvent({
        event_id: "cqe_2222222222222222",
        js_execution: "not_executed",
        cookie_state: "absent",
      }),
    ])
  )[0]!;
  const unknown = (
    await extract([
      makeEvent({
        event_id: "cqe_2222222222222223",
        js_execution: "unknown",
        cookie_state: "unknown",
      }),
    ])
  )[0]!;

  assert.deepEqual(trueKeys(executed, JS_FEATURES), ["js_executed"]);
  assert.deepEqual(trueKeys(executed, COOKIE_FEATURES), ["cookie_present"]);
  assert.deepEqual(trueKeys(notExecuted, JS_FEATURES), ["js_not_executed"]);
  assert.deepEqual(trueKeys(notExecuted, COOKIE_FEATURES), ["cookie_absent"]);
  assert.deepEqual(trueKeys(unknown, JS_FEATURES), ["js_unknown"]);
  assert.deepEqual(trueKeys(unknown, COOKIE_FEATURES), ["cookie_unknown"]);
  assert.equal(unknown.feature_vector.js_not_executed, false);
  assert.equal(unknown.feature_vector.cookie_absent, false);
});

test("send-delay features require message_sent_at and the frozen single-click rule", async () => {
  const delayedSingle = (
    await extract([
      makeEvent({
        event_id: "cqe_3333333333333331",
        occurred_at: isoFromT0(60_000),
        message_sent_at: isoFromT0(0),
      }),
    ])
  )[0]!;
  const delayedBurst = (
    await extract([
      makeEvent({
        event_id: "cqe_3333333333333332",
        link_id: "cql_3333333333333332",
        link_position: 1,
        tracked_link_count: 2,
        occurred_at: isoFromT0(60_000),
        message_sent_at: isoFromT0(0),
      }),
      makeEvent({
        event_id: "cqe_3333333333333333",
        link_id: "cql_3333333333333333",
        link_position: 2,
        tracked_link_count: 2,
        occurred_at: isoFromT0(60_040),
        message_sent_at: isoFromT0(0),
      }),
    ])
  )[0]!;
  const missingSend = (
    await extract([
      makeEvent({
        event_id: "cqe_3333333333333334",
        occurred_at: isoFromT0(60_000),
        message_sent_at: null,
      }),
    ])
  )[0]!;
  const immediate = (
    await extract([
      makeEvent({
        event_id: "cqe_3333333333333335",
        occurred_at: isoFromT0(14_999),
        message_sent_at: isoFromT0(0),
      }),
    ])
  )[0]!;
  const atFifteen = (
    await extract([
      makeEvent({
        event_id: "cqe_3333333333333336",
        occurred_at: isoFromT0(15_000),
        message_sent_at: isoFromT0(0),
      }),
    ])
  )[0]!;

  assert.equal(delayedSingle.feature_vector.delay_from_send_ge_60s_single_click, true);
  assert.equal(delayedBurst.feature_vector.delay_from_send_ge_60s_single_click, false);
  assert.equal(missingSend.feature_vector.delay_from_send_ge_60s_single_click, false);
  assert.equal(missingSend.feature_status.delay_from_send_ge_60s_single_click, "MISSING");
  assert.equal(missingSend.feature_vector.immediate_after_send_lt_15s, false);
  assert.equal(missingSend.feature_status.immediate_after_send_lt_15s, "MISSING");
  assert.equal(immediate.feature_vector.immediate_after_send_lt_15s, true);
  assert.equal(atFifteen.feature_vector.immediate_after_send_lt_15s, false);
});

test("think-time, same-link 1h gap, and network context features", async () => {
  const think = await extract([
    makeEvent({ event_id: "cqe_4444444444444441", occurred_at: isoFromT0(0) }),
    makeEvent({
      event_id: "cqe_4444444444444442",
      link_id: "cql_4444444444444442",
      occurred_at: isoFromT0(3_000),
    }),
  ]);
  assert.equal(rowFor(think, "cqe_4444444444444441").feature_status.interclick_think_time_3s_to_30m, "NOT_APPLICABLE");
  assert.equal(rowFor(think, "cqe_4444444444444442").feature_vector.interclick_think_time_3s_to_30m, true);

  const hourGap = await extract([
    makeEvent({ event_id: "cqe_4444444444444443", occurred_at: isoFromT0(0) }),
    makeEvent({
      event_id: "cqe_4444444444444444",
      occurred_at: isoFromT0(minutes(60)),
    }),
  ]);
  assert.equal(rowFor(hourGap, "cqe_4444444444444443").feature_vector.repeat_same_link_gap_ge_1h, false);
  assert.equal(rowFor(hourGap, "cqe_4444444444444444").feature_vector.repeat_same_link_gap_ge_1h, true);

  const corporate = (
    await extract([makeEvent({ event_id: "cqe_4444444444444445", network_type: "corporate", asn: 64515 })])
  )[0]!;
  const vpn = (await extract([makeEvent({ event_id: "cqe_4444444444444446", network_type: "vpn", asn: 64516 })]))[0]!;
  const relay = (
    await extract([makeEvent({ event_id: "cqe_4444444444444447", network_type: "privacy_relay", asn: 64517 })])
  )[0]!;
  assert.equal(corporate.feature_vector.corporate_nat_context, true);
  assert.equal(vpn.feature_vector.vpn_context, true);
  assert.equal(relay.feature_vector.privacy_relay_context, true);
  assert.equal(corporate.feature_vector.vpn_context, false);
});

test("post_scanner_distinct_client applies only to a later non-scanner event", async () => {
  const scanner = [1, 2].map((position) =>
    makeEvent({
      event_id: `cqe_555555555555550${position}`,
      recipient_id: "cqr_5555555555555555",
      message_id: "cqm_5555555555555555",
      link_id: `cql_555555555555550${position}`,
      link_position: position,
      tracked_link_count: 2,
      user_agent_raw: MAILSEC_UA,
      network_type: "cloud_hosting",
      asn: 64512,
      occurred_at: isoFromT0((position - 1) * 40),
      js_execution: "not_executed",
      cookie_state: "absent",
    }),
  );
  const laterHuman = makeEvent({
    event_id: "cqe_5555555555555511",
    recipient_id: "cqr_5555555555555555",
    message_id: "cqm_5555555555555555",
    link_id: "cql_5555555555555511",
    link_position: 1,
    tracked_link_count: 2,
    user_agent_raw: SAFARI_UA,
    network_type: "residential",
    asn: 64514,
    occurred_at: isoFromT0(minutes(20)),
    js_execution: "executed",
    cookie_state: "present",
  });
  const rows = await extract([...scanner, laterHuman]);
  assert.equal(rowFor(rows, "cqe_5555555555555501").feature_vector.post_scanner_distinct_client, false);
  assert.equal(rowFor(rows, "cqe_5555555555555511").feature_vector.post_scanner_distinct_client, true);
});

test("evidence quality COMPLETE, PARTIAL, and SPARSE", async () => {
  const complete = (await extract([makeEvent({ event_id: "cqe_6666666666666661" })]))[0]!;
  const partial = (
    await extract([
      makeEvent({
        event_id: "cqe_6666666666666662",
        js_execution: "unknown",
        cookie_state: "unknown",
      }),
    ])
  )[0]!;
  const sparse = (
    await extract([
      makeEvent({
        event_id: "cqe_6666666666666663",
        user_agent_raw: null,
        network_type: "unknown",
        asn: null,
        asn_org: null,
        js_execution: "unknown",
        cookie_state: "unknown",
        tracked_link_count: null,
        message_sent_at: null,
        accept_header_present: null,
        accept_language_present: null,
      }),
    ])
  )[0]!;

  assert.equal(complete.evidence_quality, "COMPLETE");
  assert.ok(complete.observed_family_count >= 3);
  assert.equal(partial.evidence_quality, "PARTIAL");
  assert.equal(sparse.evidence_quality, "SPARSE");
  assert.equal(sparse.observed_family_count, 0);
});

test("missing evidence is stored as MISSING or NOT_APPLICABLE, never silently false-as-observed", async () => {
  const [row] = await extract([
    makeEvent({
      event_id: "cqe_7777777777777771",
      user_agent_raw: null,
      accept_header_present: null,
      tracked_link_count: null,
      message_sent_at: null,
      asn: null,
    }),
  ]);
  assert.equal(row.feature_status.ua_browser_like, "MISSING");
  assert.equal(row.feature_vector.ua_browser_like, false);
  assert.equal(row.feature_status.missing_accept_header, "MISSING");
  assert.equal(row.feature_vector.missing_accept_header, false);
  assert.equal(row.feature_status.all_tracked_links_in_2s, "MISSING");
  assert.equal(row.feature_vector.all_tracked_links_in_2s, false);
  assert.equal(row.feature_status.delay_from_send_ge_60s_single_click, "MISSING");
  assert.equal(row.feature_vector.delay_from_send_ge_60s_single_click, false);
  assert.equal(row.feature_status.html_order_match_and_fast, "NOT_APPLICABLE");
});

test("fixture extraction is 90 closed rows, order-invariant, and hash-stable", async () => {
  const events = JSON.parse(readFileSync(CLICK_QUALITY_EVENTS_FIXTURE_PATH, "utf8")) as ClickQualityEvent[];
  assert.equal(events.length, 90);
  const first = await extract(events);
  const shuffled = await extract([...events].reverse());
  assert.equal(first.length, 90);
  for (const row of first) {
    assertClosedFeatureSet(row);
    assert.equal(row.feature_schema_version, FEATURE_SCHEMA_VERSION);
    assert.equal(row.extractor_version, EXTRACTOR_VERSION);
    assert.equal(Object.keys(row.feature_vector).length, FEATURE_KEYS.length);
    assert.equal(hashFeatureVector(row.feature_vector), row.feature_vector_hash);
  }
  const byId = (rows: ExtractedFeatures[]) =>
    Object.fromEntries(rows.map((row) => [row.event_id, row.feature_vector_hash]));
  assert.deepEqual(byId(first), byId(shuffled));
  const second = await extract(events);
  assert.deepEqual(
    first.map((row) => row.feature_vector_hash),
    second.map((row) => row.feature_vector_hash),
  );
});

test("ground-truth labels and split membership are not inputs to extraction", async () => {
  const events = JSON.parse(readFileSync(CLICK_QUALITY_EVENTS_FIXTURE_PATH, "utf8")) as ClickQualityEvent[];
  const baseline = await extract(events);
  const poisoned = events.map((event) => ({
    ...event,
    ground_truth: "HUMAN",
    experiment_split: "challenge",
  })) as ClickQualityEvent[];
  const poisonedRows = await extract(poisoned);
  assert.deepEqual(
    baseline.map((row) => row.feature_vector_hash),
    poisonedRows.map((row) => row.feature_vector_hash),
  );
});

test("challenge lock hash remains unchanged", () => {
  const events = JSON.parse(readFileSync(CLICK_QUALITY_EVENTS_FIXTURE_PATH, "utf8")) as Array<
    Record<string, unknown>
  >;
  const lock = readChallengeLock();
  assert.equal(hashChallengeEvents(events).hash, lock.hash);
  assert.equal(lock.hash, "26f9f4c7f9b16e9041f02c1d91f4cc3bb518cf5fc69653acbe694d5ee234f212");
});
