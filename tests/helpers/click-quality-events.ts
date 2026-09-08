import type { ClickQualityEvent } from "@/src/click-quality/contract";

const T0 = "2026-09-01T15:00:00.000Z";

export function minutes(value: number): number {
  return value * 60_000;
}

export function isoFromT0(offsetMs: number): string {
  return new Date(Date.parse(T0) + offsetMs).toISOString();
}

export function makeEvent(
  overrides: Partial<ClickQualityEvent> & Pick<ClickQualityEvent, "event_id">,
): ClickQualityEvent {
  return {
    schema_version: "cq-event-v1",
    occurred_at: isoFromT0(0),
    http_method: "GET",
    recipient_id: "cqr_aaaaaaaaaaaaaaaa",
    message_id: "cqm_bbbbbbbbbbbbbbbb",
    campaign_id: "cqc_cccccccccccccccc",
    link_id: "cql_dddddddddddddddd",
    link_position: 1,
    tracked_link_count: 1,
    destination_host: "offers-fixture.test",
    message_sent_at: T0,
    user_agent_raw:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.6613.84 Safari/537.36",
    accept_language_present: true,
    accept_header_present: true,
    network_type: "residential",
    asn: 64514,
    asn_org: "Synthetic Residential Access",
    js_execution: "executed",
    cookie_state: "present",
    referrer_class: "email_client",
    source: "synthetic_fixture_v1",
    ...overrides,
  };
}

export const HEADLESS_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/128.0.6613.84 Safari/537.36";
export const CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.6613.84 Safari/537.36";
export const MAILSEC_UA = "SyntheticMailSec/2.4";
export const HTTPX_UA = "python-httpx/0.27.2";
export const SAFARI_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1";
