import type { FeatureKey } from "@/src/click-quality/features/versions";
import type { FamilyId } from "@/src/click-quality/classifier/versions";

export type FeatureWeight = {
  auto: number;
  human: number;
};

export const FAMILY_FEATURES: Record<FamilyId, readonly FeatureKey[]> = {
  F1: [
    "http_method_is_head",
    "ua_known_scanner",
    "ua_http_library",
    "ua_headless_browser",
    "ua_browser_like",
    "ua_missing",
    "missing_accept_language",
    "missing_accept_header",
  ],
  F2: [
    "network_cloud_hosting",
    "network_known_email_security_asn",
    "network_residential",
    "network_corporate",
    "network_vpn",
    "network_privacy_relay",
    "network_unknown",
  ],
  F3: [
    "burst_link_count_ge_3",
    "all_tracked_links_in_2s",
    "html_order_match_and_fast",
    "median_interclick_lt_100ms",
  ],
  F4: ["rescan_similar_burst", "retry_count_10min_ge_2"],
  F5: [
    "js_not_executed",
    "js_executed",
    "cookie_absent",
    "cookie_present",
    "js_unknown",
    "cookie_unknown",
  ],
  F6: [
    "delay_from_send_ge_60s_single_click",
    "interclick_think_time_3s_to_30m",
    "repeat_same_link_gap_ge_1h",
    "immediate_after_send_lt_15s",
  ],
  F7: [
    "post_scanner_distinct_client",
    "corporate_nat_context",
    "vpn_context",
    "privacy_relay_context",
  ],
};

export const FEATURE_WEIGHTS: Record<FeatureKey, FeatureWeight> = {
  http_method_is_head: { auto: 2, human: 0 },
  ua_known_scanner: { auto: 3, human: 0 },
  ua_http_library: { auto: 2, human: 0 },
  ua_headless_browser: { auto: 2, human: 0 },
  ua_browser_like: { auto: 0, human: 1 },
  ua_missing: { auto: 0, human: 0 },
  missing_accept_language: { auto: 1, human: 0 },
  missing_accept_header: { auto: 1, human: 0 },
  network_cloud_hosting: { auto: 1, human: 0 },
  network_known_email_security_asn: { auto: 3, human: 0 },
  network_residential: { auto: 0, human: 1 },
  network_corporate: { auto: 0, human: 0 },
  network_vpn: { auto: 0, human: 0 },
  network_privacy_relay: { auto: 0, human: 0 },
  network_unknown: { auto: 0, human: 0 },
  burst_link_count_ge_3: { auto: 2, human: 0 },
  all_tracked_links_in_2s: { auto: 3, human: 0 },
  html_order_match_and_fast: { auto: 2, human: 0 },
  median_interclick_lt_100ms: { auto: 2, human: 0 },
  rescan_similar_burst: { auto: 2, human: 0 },
  retry_count_10min_ge_2: { auto: 1, human: 0 },
  js_not_executed: { auto: 1, human: 0 },
  js_executed: { auto: 0, human: 2 },
  cookie_absent: { auto: 1, human: 0 },
  cookie_present: { auto: 0, human: 1 },
  js_unknown: { auto: 0, human: 0 },
  cookie_unknown: { auto: 0, human: 0 },
  delay_from_send_ge_60s_single_click: { auto: 0, human: 1 },
  interclick_think_time_3s_to_30m: { auto: 0, human: 2 },
  repeat_same_link_gap_ge_1h: { auto: 0, human: 2 },
  immediate_after_send_lt_15s: { auto: 0, human: 0 },
  post_scanner_distinct_client: { auto: 0, human: 2 },
  corporate_nat_context: { auto: 0, human: 0 },
  vpn_context: { auto: 0, human: 0 },
  privacy_relay_context: { auto: 0, human: 0 },
};
