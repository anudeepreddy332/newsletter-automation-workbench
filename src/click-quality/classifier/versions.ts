export const CLASSIFIER_VERSION = "cq-clf-v1.0.0";
export const THRESHOLD_SET_ID = "cq-thr-exp90-uncalibrated-v1";
export const THRESHOLD_SET_STATUS = "UNCALIBRATED_EXPERIMENT";
export const THRESHOLD_SET_NOTES =
  "Experiment-only uncalibrated thresholds for the synthetic 90-event prototype. Not calibrated. Not production thresholds.";

export const DECISIONS = ["LIKELY_AUTOMATED", "LIKELY_HUMAN", "AMBIGUOUS_REVIEW"] as const;
export type Decision = (typeof DECISIONS)[number];

export const FAMILY_IDS = ["F1", "F2", "F3", "F4", "F5", "F6", "F7"] as const;
export type FamilyId = (typeof FAMILY_IDS)[number];

export const REASON_CODES = [
  "AUTO_HEAD_REQUEST",
  "AUTO_SCANNER_UA",
  "AUTO_HTTP_LIBRARY_UA",
  "AUTO_HEADLESS_UA",
  "AUTO_CLOUD_NETWORK",
  "AUTO_EMAIL_SECURITY_ASN",
  "AUTO_ALL_LINKS_FAST",
  "AUTO_HTML_ORDER_BURST",
  "AUTO_SUB100MS_BURST",
  "AUTO_RESCAN_BURST",
  "AUTO_NO_JS",
  "AUTO_NO_COOKIE",
  "HUM_BROWSER_UA",
  "HUM_JS_EXECUTED",
  "HUM_COOKIE_PRESENT",
  "HUM_THINK_TIME",
  "HUM_RESIDENTIAL",
  "HUM_REPEAT_GAP",
  "HUM_POST_SCANNER_DISTINCT_CLIENT",
  "AMB_STRONG_CONTRADICTION",
  "AMB_SINGLE_FAMILY_ONLY",
  "AMB_CORPORATE_NAT",
  "AMB_VPN",
  "AMB_PRIVACY_RELAY",
  "AMB_NO_JS_RESIDENTIAL",
  "AMB_VERY_FAST_BROWSER",
  "QUAL_SPARSE_EVIDENCE",
  "QUAL_PARTIAL_EVIDENCE",
  "QUAL_UA_MISSING",
  "QUAL_NETWORK_UNKNOWN",
  "QUAL_JS_UNKNOWN",
  "QUAL_COOKIE_UNKNOWN",
] as const;

export type ReasonCode = (typeof REASON_CODES)[number];

export const POSITIVE_HUMAN_FEATURES = [
  "js_executed",
  "interclick_think_time_3s_to_30m",
  "repeat_same_link_gap_ge_1h",
  "post_scanner_distinct_client",
] as const;
