export const CLICK_QUALITY_EVENT_SCHEMA_VERSION = "cq-event-v1";
export const CLICK_QUALITY_EVENT_SOURCE = "synthetic_fixture_v1";

export const HTTP_METHODS = ["GET", "HEAD", "POST", "OTHER"] as const;
export const NETWORK_TYPES = [
  "cloud_hosting",
  "residential",
  "corporate",
  "vpn",
  "privacy_relay",
  "unknown",
] as const;
export const JS_EXECUTION_STATES = ["executed", "not_executed", "unknown"] as const;
export const COOKIE_STATES = ["present", "absent", "unknown"] as const;
export const REFERRER_CLASSES = ["email_client", "webmail", "empty", "other", "unknown"] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];
export type NetworkType = (typeof NETWORK_TYPES)[number];
export type JsExecution = (typeof JS_EXECUTION_STATES)[number];
export type CookieState = (typeof COOKIE_STATES)[number];
export type ReferrerClass = (typeof REFERRER_CLASSES)[number];

export type ClickQualityEvent = {
  schema_version: typeof CLICK_QUALITY_EVENT_SCHEMA_VERSION;
  event_id: string;
  occurred_at: string;
  http_method: HttpMethod;
  recipient_id: string;
  message_id: string;
  campaign_id: string | null;
  link_id: string;
  link_position: number | null;
  tracked_link_count: number | null;
  destination_host: string | null;
  message_sent_at: string | null;
  user_agent_raw: string | null;
  accept_language_present: boolean | null;
  accept_header_present: boolean | null;
  network_type: NetworkType;
  asn: number | null;
  asn_org: string | null;
  js_execution: JsExecution;
  cookie_state: CookieState;
  referrer_class: ReferrerClass;
  source: typeof CLICK_QUALITY_EVENT_SOURCE;
};

export const CLICK_QUALITY_EVENT_KEYS = [
  "schema_version",
  "event_id",
  "occurred_at",
  "http_method",
  "recipient_id",
  "message_id",
  "campaign_id",
  "link_id",
  "link_position",
  "tracked_link_count",
  "destination_host",
  "message_sent_at",
  "user_agent_raw",
  "accept_language_present",
  "accept_header_present",
  "network_type",
  "asn",
  "asn_org",
  "js_execution",
  "cookie_state",
  "referrer_class",
  "source",
] as const;

export const REQUIRED_CLICK_QUALITY_EVENT_KEYS = [
  "schema_version",
  "event_id",
  "occurred_at",
  "http_method",
  "recipient_id",
  "message_id",
  "campaign_id",
  "link_id",
  "network_type",
  "js_execution",
  "cookie_state",
  "referrer_class",
  "source",
] as const;

export const OPAQUE_ID_PATTERNS = {
  event_id: /^cqe_[0-9a-f]{16}$/,
  recipient_id: /^cqr_[0-9a-f]{16}$/,
  message_id: /^cqm_[0-9a-f]{16}$/,
  link_id: /^cql_[0-9a-f]{16}$/,
  campaign_id: /^cqc_[0-9a-f]{16}$/,
} as const;

export const RESERVED_IDENTIFIER_TOKENS = [
  "exploratory",
  "explor",
  "challenge",
  "chall",
  "automated",
  "human",
  "unknown",
  "bot",
  "scanner",
  "scan",
  "gateway",
  "headless",
  "forward",
  "fwd",
  "nojs",
  "vpn",
  "relay",
  "corp",
  "nat",
  "mix",
  "burst",
  "rescan",
  "likely",
  "ambiguous",
  "split",
  "holdout",
  "testset",
] as const;

export const FORBIDDEN_PAYLOAD_KEYS = [
  "ip",
  "ip_address",
  "email",
  "user_email",
  "experiment_split",
  "ground_truth",
  "label",
  "forward_candidate",
  "forward",
] as const;

export const LEGACY_SPLIT_ID_PATTERN = /(?:^|[^a-z0-9])[ec]\d{2,}(?:[^a-z0-9]|$)/i;
