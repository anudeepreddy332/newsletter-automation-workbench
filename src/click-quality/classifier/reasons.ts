import type { ExtractedFeatures } from "@/src/click-quality/features/types";
import { featureFires } from "@/src/click-quality/classifier/score";
import type { Decision, ReasonCode } from "@/src/click-quality/classifier/versions";

const FEATURE_REASON_CODES: Array<{ key: Parameters<typeof featureFires>[1]; code: ReasonCode }> = [
  { key: "http_method_is_head", code: "AUTO_HEAD_REQUEST" },
  { key: "ua_known_scanner", code: "AUTO_SCANNER_UA" },
  { key: "ua_http_library", code: "AUTO_HTTP_LIBRARY_UA" },
  { key: "ua_headless_browser", code: "AUTO_HEADLESS_UA" },
  { key: "network_cloud_hosting", code: "AUTO_CLOUD_NETWORK" },
  { key: "network_known_email_security_asn", code: "AUTO_EMAIL_SECURITY_ASN" },
  { key: "all_tracked_links_in_2s", code: "AUTO_ALL_LINKS_FAST" },
  { key: "html_order_match_and_fast", code: "AUTO_HTML_ORDER_BURST" },
  { key: "median_interclick_lt_100ms", code: "AUTO_SUB100MS_BURST" },
  { key: "rescan_similar_burst", code: "AUTO_RESCAN_BURST" },
  { key: "js_not_executed", code: "AUTO_NO_JS" },
  { key: "cookie_absent", code: "AUTO_NO_COOKIE" },
  { key: "ua_browser_like", code: "HUM_BROWSER_UA" },
  { key: "js_executed", code: "HUM_JS_EXECUTED" },
  { key: "cookie_present", code: "HUM_COOKIE_PRESENT" },
  { key: "interclick_think_time_3s_to_30m", code: "HUM_THINK_TIME" },
  { key: "network_residential", code: "HUM_RESIDENTIAL" },
  { key: "repeat_same_link_gap_ge_1h", code: "HUM_REPEAT_GAP" },
  { key: "post_scanner_distinct_client", code: "HUM_POST_SCANNER_DISTINCT_CLIENT" },
  { key: "ua_missing", code: "QUAL_UA_MISSING" },
  { key: "network_unknown", code: "QUAL_NETWORK_UNKNOWN" },
  { key: "js_unknown", code: "QUAL_JS_UNKNOWN" },
  { key: "cookie_unknown", code: "QUAL_COOKIE_UNKNOWN" },
];

export function collectReasonCodes(options: {
  row: ExtractedFeatures;
  decision: Decision;
  conflict: boolean;
  autoFamilyCount: number;
  autoScore: number;
}): ReasonCode[] {
  const codes = new Set<ReasonCode>();
  for (const mapping of FEATURE_REASON_CODES) {
    if (featureFires(options.row, mapping.key)) {
      codes.add(mapping.code);
    }
  }
  if (options.row.evidence_quality === "SPARSE") {
    codes.add("QUAL_SPARSE_EVIDENCE");
  }
  if (options.row.evidence_quality === "PARTIAL") {
    codes.add("QUAL_PARTIAL_EVIDENCE");
  }
  if (options.decision === "AMBIGUOUS_REVIEW") {
    if (options.conflict) {
      codes.add("AMB_STRONG_CONTRADICTION");
    }
    if (options.autoFamilyCount === 1 && options.autoScore > 0) {
      codes.add("AMB_SINGLE_FAMILY_ONLY");
    }
    if (featureFires(options.row, "corporate_nat_context")) {
      codes.add("AMB_CORPORATE_NAT");
    }
    if (featureFires(options.row, "vpn_context")) {
      codes.add("AMB_VPN");
    }
    if (featureFires(options.row, "privacy_relay_context")) {
      codes.add("AMB_PRIVACY_RELAY");
    }
    if (featureFires(options.row, "js_not_executed") && featureFires(options.row, "network_residential")) {
      codes.add("AMB_NO_JS_RESIDENTIAL");
    }
    if (featureFires(options.row, "ua_browser_like") && featureFires(options.row, "median_interclick_lt_100ms")) {
      codes.add("AMB_VERY_FAST_BROWSER");
    }
  }
  const ordered = [...codes].sort((left, right) => left.localeCompare(right));
  return ordered;
}
