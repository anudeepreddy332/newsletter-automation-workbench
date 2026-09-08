import type { ClickQualityEvent } from "@/src/click-quality/contract";
import { hashFeatureVector } from "@/src/click-quality/features/canonical";
import type { AsnRule, UaRule } from "@/src/click-quality/features/rules";
import {
  emptyFeatureVector,
  observedStatusMap,
  type ExtractedFeatures,
  type FeatureStatusMap,
  type FeatureVector,
} from "@/src/click-quality/features/types";
import { classifyUserAgent, isAutomationShapedUaClass } from "@/src/click-quality/features/ua";
import {
  EXTRACTOR_VERSION,
  FEATURE_KEYS,
  FEATURE_SCHEMA_VERSION,
  type DerivedUaClass,
  type EvidenceQuality,
  type FeatureKey,
  type FeatureStatus,
} from "@/src/click-quality/features/versions";

// Burst clusters: same recipient_id+message_id, ordered by occurred_at then event_id.
// A new cluster starts when occurred_at - clusterStart > 2000ms.
// retry_count_10min_ge_2: same recipient/message/link in [t-10min, t] inclusive, including the current event.
// Median of adjacent gaps: odd count uses the middle gap; even count uses the mean of the two middle gaps.
const TWO_SECONDS_MS = 2000;
const TEN_MINUTES_MS = 10 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;
const THIRTY_MINUTES_MS = 30 * 60 * 1000;
const THREE_SECONDS_MS = 3000;
const FIFTEEN_SECONDS_MS = 15_000;
const SIXTY_SECONDS_MS = 60_000;

type EventContext = {
  event: ClickQualityEvent;
  timeMs: number;
  uaClass: DerivedUaClass | null;
};

type BurstCluster = {
  startMs: number;
  events: EventContext[];
  linkIds: Set<string>;
  scannerLike: boolean;
  representativeUaClass: DerivedUaClass | null;
  representativeNetworkType: ClickQualityEvent["network_type"];
};

export type FeatureExtractionRules = {
  uaRules: readonly UaRule[];
  asnRules: readonly AsnRule[];
};

function timeMs(iso: string): number {
  return Date.parse(iso);
}

function setFeature(
  vector: FeatureVector,
  status: FeatureStatusMap,
  key: FeatureKey,
  value: boolean,
  state: FeatureStatus,
): void {
  vector[key] = value;
  status[key] = state;
}

export function medianGapMs(sortedTimes: readonly number[]): number | null {
  if (sortedTimes.length < 2) {
    return null;
  }
  const gaps: number[] = [];
  for (let index = 1; index < sortedTimes.length; index += 1) {
    gaps.push(sortedTimes[index]! - sortedTimes[index - 1]!);
  }
  const ordered = [...gaps].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  if (ordered.length % 2 === 1) {
    return ordered[middle]!;
  }
  return (ordered[middle - 1]! + ordered[middle]!) / 2;
}

function groupKey(event: ClickQualityEvent): string {
  return `${event.recipient_id}|${event.message_id}`;
}

function buildClusters(
  events: readonly EventContext[],
): { clusterByEventId: Map<string, BurstCluster>; clusters: BurstCluster[] } {
  const sorted = [...events].sort((left, right) => {
    if (left.timeMs !== right.timeMs) {
      return left.timeMs - right.timeMs;
    }
    return left.event.event_id.localeCompare(right.event.event_id);
  });
  const clusters: BurstCluster[] = [];
  let current: EventContext[] = [];
  let startMs = 0;
  for (const item of sorted) {
    if (current.length === 0) {
      current = [item];
      startMs = item.timeMs;
      continue;
    }
    if (item.timeMs - startMs > TWO_SECONDS_MS) {
      clusters.push(finalizeCluster(current, startMs));
      current = [item];
      startMs = item.timeMs;
      continue;
    }
    current.push(item);
  }
  if (current.length > 0) {
    clusters.push(finalizeCluster(current, startMs));
  }
  const clusterByEventId = new Map<string, BurstCluster>();
  for (const cluster of clusters) {
    for (const item of cluster.events) {
      clusterByEventId.set(item.event.event_id, cluster);
    }
  }
  return { clusterByEventId, clusters };
}

function finalizeCluster(events: EventContext[], startMs: number): BurstCluster {
  const linkIds = new Set(events.map((item) => item.event.link_id));
  const first = events[0]!;
  const scannerLike =
    linkIds.size >= 2 && events.some((item) => isAutomationShapedUaClass(item.uaClass));
  return {
    startMs,
    events,
    linkIds,
    scannerLike,
    representativeUaClass: first.uaClass,
    representativeNetworkType: first.event.network_type,
  };
}

function allTrackedLinksInTwoSeconds(
  cluster: BurstCluster,
  trackedLinkCount: number | null,
): { value: boolean; status: FeatureStatus } {
  // Coverage is every required HTML position 1..N AND at least N distinct link_id
  // values among those in-range observations. Extra/out-of-range events do not count.
  if (trackedLinkCount === null) {
    return { value: false, status: "MISSING" };
  }
  const requiredPositions = Array.from({ length: trackedLinkCount }, (_, index) => index + 1);
  const required = new Set(requiredPositions);
  const inRange = cluster.events.filter((item) => {
    const position = item.event.link_position;
    return position !== null && required.has(position);
  });
  const knownRequiredPositions = new Set(
    inRange.map((item) => item.event.link_position).filter((position): position is number => position !== null),
  );
  const distinctRequiredLinks = new Set(inRange.map((item) => item.event.link_id));
  const positionsComplete = requiredPositions.every((position) => knownRequiredPositions.has(position));
  const linksComplete = distinctRequiredLinks.size >= trackedLinkCount;
  if (positionsComplete && linksComplete) {
    return { value: true, status: "OBSERVED" };
  }
  const relevantPositionMissing = !positionsComplete &&
    cluster.events.some((item) => item.event.link_position === null);
  if (relevantPositionMissing) {
    return { value: false, status: "MISSING" };
  }
  return { value: false, status: "OBSERVED" };
}

function emailSecurityAsn(asn: number | null, rules: readonly AsnRule[]): boolean | null {
  if (asn === null) {
    return null;
  }
  const match = rules.find((rule) => rule.asn === asn);
  if (!match) {
    return false;
  }
  return match.email_security;
}

function expectedFamilies(event: ClickQualityEvent): Array<"F1" | "F2" | "F3" | "F5" | "F6"> {
  const families: Array<"F1" | "F2" | "F3" | "F5" | "F6"> = ["F1", "F2", "F5"];
  if (event.tracked_link_count !== null && event.tracked_link_count >= 2) {
    families.push("F3");
  }
  if (event.message_sent_at !== null) {
    families.push("F6");
  }
  return families;
}

function observedFamilies(event: ClickQualityEvent): Set<"F1" | "F2" | "F3" | "F5" | "F6"> {
  const observed = new Set<"F1" | "F2" | "F3" | "F5" | "F6">();
  if (event.user_agent_raw !== null) {
    observed.add("F1");
  }
  if (event.network_type !== "unknown") {
    observed.add("F2");
  }
  if (event.js_execution !== "unknown" && event.cookie_state !== "unknown") {
    observed.add("F5");
  }
  if (event.tracked_link_count !== null && event.tracked_link_count >= 2) {
    observed.add("F3");
  }
  if (event.message_sent_at !== null) {
    observed.add("F6");
  }
  return observed;
}

function evidenceQuality(event: ClickQualityEvent, observedCount: number): EvidenceQuality {
  const complete =
    event.user_agent_raw !== null &&
    event.network_type !== "unknown" &&
    event.js_execution !== "unknown" &&
    event.cookie_state !== "unknown";
  if (complete) {
    return "COMPLETE";
  }
  const sparse =
    (event.user_agent_raw === null && event.network_type === "unknown") || observedCount <= 1;
  return sparse ? "SPARSE" : "PARTIAL";
}

function extractOne(
  ctx: EventContext,
  group: EventContext[],
  cluster: BurstCluster,
  clusters: BurstCluster[],
  asnRules: readonly AsnRule[],
): ExtractedFeatures {
  const event = ctx.event;
  const vector = emptyFeatureVector();
  const status = observedStatusMap();
  const uaClass = ctx.uaClass;

  setFeature(vector, status, "http_method_is_head", event.http_method === "HEAD", "OBSERVED");
  setFeature(vector, status, "ua_missing", event.user_agent_raw === null, "OBSERVED");
  setFeature(
    vector,
    status,
    "ua_known_scanner",
    uaClass === "known_scanner",
    uaClass === null ? "MISSING" : "OBSERVED",
  );
  setFeature(
    vector,
    status,
    "ua_http_library",
    uaClass === "http_library",
    uaClass === null ? "MISSING" : "OBSERVED",
  );
  setFeature(
    vector,
    status,
    "ua_headless_browser",
    uaClass === "headless_browser",
    uaClass === null ? "MISSING" : "OBSERVED",
  );
  setFeature(
    vector,
    status,
    "ua_browser_like",
    uaClass === "browser_like",
    uaClass === null ? "MISSING" : "OBSERVED",
  );

  if (event.accept_language_present === null) {
    setFeature(vector, status, "missing_accept_language", false, "MISSING");
  } else {
    setFeature(vector, status, "missing_accept_language", event.accept_language_present === false, "OBSERVED");
  }
  if (event.accept_header_present === null) {
    setFeature(vector, status, "missing_accept_header", false, "MISSING");
  } else {
    setFeature(vector, status, "missing_accept_header", event.accept_header_present === false, "OBSERVED");
  }

  setFeature(vector, status, "network_cloud_hosting", event.network_type === "cloud_hosting", "OBSERVED");
  setFeature(vector, status, "network_residential", event.network_type === "residential", "OBSERVED");
  setFeature(vector, status, "network_corporate", event.network_type === "corporate", "OBSERVED");
  setFeature(vector, status, "network_vpn", event.network_type === "vpn", "OBSERVED");
  setFeature(vector, status, "network_privacy_relay", event.network_type === "privacy_relay", "OBSERVED");
  setFeature(vector, status, "network_unknown", event.network_type === "unknown", "OBSERVED");

  const emailSec = emailSecurityAsn(event.asn, asnRules);
  if (event.asn === null) {
    setFeature(vector, status, "network_known_email_security_asn", false, "MISSING");
  } else {
    setFeature(vector, status, "network_known_email_security_asn", emailSec === true, "OBSERVED");
  }

  const distinctLinks = cluster.linkIds.size;
  setFeature(vector, status, "burst_link_count_ge_3", distinctLinks >= 3, "OBSERVED");

  const allTracked = allTrackedLinksInTwoSeconds(cluster, event.tracked_link_count);
  setFeature(vector, status, "all_tracked_links_in_2s", allTracked.value, allTracked.status);

  const positions = cluster.events.map((item) => item.event.link_position);
  if (cluster.events.length < 2) {
    setFeature(vector, status, "html_order_match_and_fast", false, "NOT_APPLICABLE");
    setFeature(vector, status, "median_interclick_lt_100ms", false, "NOT_APPLICABLE");
  } else if (positions.some((position) => position === null)) {
    setFeature(vector, status, "html_order_match_and_fast", false, "MISSING");
    const median = medianGapMs(cluster.events.map((item) => item.timeMs));
    setFeature(vector, status, "median_interclick_lt_100ms", median !== null && median < 100, "OBSERVED");
  } else {
    const orderedByTime = cluster.events;
    let increasing = true;
    for (let index = 1; index < orderedByTime.length; index += 1) {
      if (orderedByTime[index]!.event.link_position! <= orderedByTime[index - 1]!.event.link_position!) {
        increasing = false;
        break;
      }
    }
    setFeature(vector, status, "html_order_match_and_fast", increasing, "OBSERVED");
    const median = medianGapMs(cluster.events.map((item) => item.timeMs));
    setFeature(vector, status, "median_interclick_lt_100ms", median !== null && median < 100, "OBSERVED");
  }

  const earlierScannerLike = clusters.filter(
    (candidate) => candidate.startMs < cluster.startMs && candidate.scannerLike,
  );
  const rescan = clusters.some((candidate) => {
    if (candidate.startMs > cluster.startMs - TEN_MINUTES_MS) {
      return false;
    }
    if (candidate.startMs >= cluster.startMs) {
      return false;
    }
    let overlap = 0;
    for (const linkId of cluster.linkIds) {
      if (candidate.linkIds.has(linkId)) {
        overlap += 1;
      }
    }
    return (
      overlap >= 2 &&
      ctx.uaClass !== null &&
      candidate.representativeUaClass !== null &&
      ctx.uaClass === candidate.representativeUaClass
    );
  });
  setFeature(vector, status, "rescan_similar_burst", rescan, "OBSERVED");

  const sameLinkLookback = group.filter(
    (item) =>
      item.event.link_id === event.link_id &&
      item.timeMs <= ctx.timeMs &&
      item.timeMs >= ctx.timeMs - TEN_MINUTES_MS,
  ).length;
  setFeature(vector, status, "retry_count_10min_ge_2", sameLinkLookback >= 2, "OBSERVED");

  setFeature(vector, status, "js_executed", event.js_execution === "executed", "OBSERVED");
  setFeature(vector, status, "js_not_executed", event.js_execution === "not_executed", "OBSERVED");
  setFeature(vector, status, "js_unknown", event.js_execution === "unknown", "OBSERVED");
  setFeature(vector, status, "cookie_present", event.cookie_state === "present", "OBSERVED");
  setFeature(vector, status, "cookie_absent", event.cookie_state === "absent", "OBSERVED");
  setFeature(vector, status, "cookie_unknown", event.cookie_state === "unknown", "OBSERVED");

  if (event.message_sent_at === null) {
    setFeature(vector, status, "delay_from_send_ge_60s_single_click", false, "MISSING");
    setFeature(vector, status, "immediate_after_send_lt_15s", false, "MISSING");
  } else {
    const delay = ctx.timeMs - timeMs(event.message_sent_at);
    const singleClick = cluster.events.length === 1;
    setFeature(
      vector,
      status,
      "delay_from_send_ge_60s_single_click",
      singleClick && delay >= SIXTY_SECONDS_MS,
      "OBSERVED",
    );
    setFeature(
      vector,
      status,
      "immediate_after_send_lt_15s",
      delay >= 0 && delay < FIFTEEN_SECONDS_MS,
      "OBSERVED",
    );
  }

  const previousInGroup = group
    .filter((item) => item.timeMs < ctx.timeMs || (item.timeMs === ctx.timeMs && item.event.event_id < event.event_id))
    .sort((left, right) => {
      if (left.timeMs !== right.timeMs) {
        return right.timeMs - left.timeMs;
      }
      return right.event.event_id.localeCompare(left.event.event_id);
    })[0];
  if (!previousInGroup) {
    setFeature(vector, status, "interclick_think_time_3s_to_30m", false, "NOT_APPLICABLE");
  } else {
    const gap = ctx.timeMs - previousInGroup.timeMs;
    setFeature(
      vector,
      status,
      "interclick_think_time_3s_to_30m",
      gap >= THREE_SECONDS_MS && gap <= THIRTY_MINUTES_MS,
      "OBSERVED",
    );
  }

  const priorSameLink = group.some(
    (item) =>
      item.event.link_id === event.link_id &&
      item.event.event_id !== event.event_id &&
      ctx.timeMs - item.timeMs >= ONE_HOUR_MS &&
      item.timeMs < ctx.timeMs,
  );
  setFeature(vector, status, "repeat_same_link_gap_ge_1h", priorSameLink, "OBSERVED");

  const postScanner =
    !cluster.scannerLike &&
    earlierScannerLike.some(
      (candidate) =>
        ctx.uaClass !== null &&
        candidate.representativeUaClass !== null &&
        ctx.uaClass !== candidate.representativeUaClass &&
        event.network_type !== candidate.representativeNetworkType,
    );
  setFeature(vector, status, "post_scanner_distinct_client", postScanner, "OBSERVED");
  setFeature(vector, status, "corporate_nat_context", event.network_type === "corporate", "OBSERVED");
  setFeature(vector, status, "vpn_context", event.network_type === "vpn", "OBSERVED");
  setFeature(vector, status, "privacy_relay_context", event.network_type === "privacy_relay", "OBSERVED");

  const expected = expectedFamilies(event);
  const observed = observedFamilies(event);
  const observedFamilyCount = expected.filter((family) => observed.has(family)).length;

  return {
    event_id: event.event_id,
    feature_schema_version: FEATURE_SCHEMA_VERSION,
    extractor_version: EXTRACTOR_VERSION,
    evidence_quality: evidenceQuality(event, observedFamilyCount),
    observed_family_count: observedFamilyCount,
    feature_vector: vector,
    feature_status: status,
    feature_vector_hash: hashFeatureVector(vector),
  };
}

export function extractFeatureSnapshot(
  events: readonly ClickQualityEvent[],
  rules: FeatureExtractionRules,
): ExtractedFeatures[] {
  const contexts: EventContext[] = events.map((event) => ({
    event,
    timeMs: timeMs(event.occurred_at),
    uaClass: classifyUserAgent(event.user_agent_raw, rules.uaRules),
  }));
  const groups = new Map<string, EventContext[]>();
  for (const ctx of contexts) {
    const key = groupKey(ctx.event);
    const list = groups.get(key) ?? [];
    list.push(ctx);
    groups.set(key, list);
  }

  const clusterState = new Map<string, { clusterByEventId: Map<string, BurstCluster>; clusters: BurstCluster[] }>();
  for (const [key, group] of groups) {
    clusterState.set(key, buildClusters(group));
  }

  return contexts.map((ctx) => {
    const key = groupKey(ctx.event);
    const group = groups.get(key)!;
    const { clusterByEventId, clusters } = clusterState.get(key)!;
    const cluster = clusterByEventId.get(ctx.event.event_id)!;
    return extractOne(ctx, group, cluster, clusters, rules.asnRules);
  });
}

export function assertClosedFeatureSet(row: ExtractedFeatures): void {
  const vectorKeys = Object.keys(row.feature_vector).sort();
  const statusKeys = Object.keys(row.feature_status).sort();
  const expected = [...FEATURE_KEYS].sort();
  if (JSON.stringify(vectorKeys) !== JSON.stringify(expected)) {
    throw new Error(`Feature vector keys are not the closed cq-feat-v1 set for ${row.event_id}.`);
  }
  if (JSON.stringify(statusKeys) !== JSON.stringify(expected)) {
    throw new Error(`Feature status keys are not the closed cq-feat-v1 set for ${row.event_id}.`);
  }
}
