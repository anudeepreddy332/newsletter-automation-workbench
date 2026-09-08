export const FEATURE_SCHEMA_VERSION = "cq-feat-v1";
export const EXTRACTOR_VERSION = "cq-extractor-v1.0.0";

export const UA_CLASS_PRECEDENCE = [
  "known_scanner",
  "http_library",
  "headless_browser",
  "browser_like",
] as const;

export const FEATURE_KEYS = [
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
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];
export type UaRuleClass = (typeof UA_CLASS_PRECEDENCE)[number];
export type DerivedUaClass = UaRuleClass | "unmatched";
export type EvidenceQuality = "COMPLETE" | "PARTIAL" | "SPARSE";
export type FeatureStatus = "OBSERVED" | "MISSING" | "NOT_APPLICABLE";
