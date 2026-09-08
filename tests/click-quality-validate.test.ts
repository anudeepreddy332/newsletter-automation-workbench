import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { CLICK_QUALITY_EVENTS_FIXTURE_PATH } from "@/src/click-quality/events-fixture";
import { ClickQualityValidationError } from "@/src/click-quality/errors";
import { normalizeClickQualityEvent, normalizeClickQualityEventBatch } from "@/src/click-quality/normalize";
import type { ClickQualityEvent } from "@/src/click-quality/contract";

function loadFixtureEvents(): ClickQualityEvent[] {
  return JSON.parse(readFileSync(CLICK_QUALITY_EVENTS_FIXTURE_PATH, "utf8")) as ClickQualityEvent[];
}

function sampleEvent(): ClickQualityEvent {
  return structuredClone(loadFixtureEvents()[0]!);
}

test("fixture events satisfy cq-event-v1 and opaque identifier rules", () => {
  const events = normalizeClickQualityEventBatch(loadFixtureEvents());
  assert.equal(events.length, 90);
  for (const event of events) {
    assert.equal(event.schema_version, "cq-event-v1");
    assert.equal(event.source, "synthetic_fixture_v1");
    assert.equal("experiment_split" in event, false);
    assert.equal("ground_truth" in event, false);
    assert.equal("label" in event, false);
    assert.equal("ip" in event, false);
    assert.equal("email" in event, false);
  }
});

test("malformed schema version is rejected", () => {
  const event = sampleEvent();
  event.schema_version = "cq-event-v0" as ClickQualityEvent["schema_version"];
  assert.throws(() => normalizeClickQualityEvent(event), ClickQualityValidationError);
});

test("missing required field is rejected", () => {
  const event = sampleEvent() as unknown as Record<string, unknown>;
  delete event.network_type;
  assert.throws(() => normalizeClickQualityEvent(event), /network_type/);
});

test("email-shaped recipient is rejected", () => {
  const event = sampleEvent();
  event.recipient_id = "person@example.test";
  assert.throws(() => normalizeClickQualityEvent(event), /email address/);
});

test("raw ip field is rejected", () => {
  const event = { ...sampleEvent(), ip: "203.0.113.10" };
  assert.throws(() => normalizeClickQualityEvent(event), /forbidden field "ip"/);
});

test("raw email fields are rejected", () => {
  assert.throws(
    () => normalizeClickQualityEvent({ ...sampleEvent(), email: "a@b.c" }),
    /forbidden field "email"/,
  );
  assert.throws(
    () => normalizeClickQualityEvent({ ...sampleEvent(), user_email: "a@b.c" }),
    /forbidden field "user_email"/,
  );
});

test("bad enum is rejected", () => {
  const event = sampleEvent();
  (event as { network_type: string }).network_type = "datacenter";
  assert.throws(() => normalizeClickQualityEvent(event), /invalid enum value/);
});

test("invalid timestamp is rejected", () => {
  const event = sampleEvent();
  event.occurred_at = "2026-09-01T15:00:08";
  assert.throws(() => normalizeClickQualityEvent(event), /UTC timestamp/);
  event.occurred_at = "not-a-dateZ";
  assert.throws(() => normalizeClickQualityEvent(event), ClickQualityValidationError);
});

test("invalid link_position is rejected", () => {
  const event = sampleEvent();
  event.link_position = 0;
  assert.throws(() => normalizeClickQualityEvent(event), /link_position/);
});

test("invalid tracked_link_count is rejected", () => {
  const event = sampleEvent();
  event.tracked_link_count = 0;
  assert.throws(() => normalizeClickQualityEvent(event), /tracked_link_count/);
});

test("optional missing evidence remains null or unknown", () => {
  const event = sampleEvent();
  event.user_agent_raw = null;
  event.accept_language_present = null;
  event.accept_header_present = null;
  event.asn = null;
  event.asn_org = null;
  event.campaign_id = null;
  event.js_execution = "unknown";
  event.cookie_state = "unknown";
  event.network_type = "unknown";
  const normalized = normalizeClickQualityEvent(event);
  assert.equal(normalized.user_agent_raw, null);
  assert.equal(normalized.accept_language_present, null);
  assert.equal(normalized.accept_header_present, null);
  assert.equal(normalized.asn, null);
  assert.equal(normalized.js_execution, "unknown");
  assert.notEqual(normalized.accept_language_present, false);
});

test("opaque identifier pattern is enforced", () => {
  const event = sampleEvent();
  event.event_id = "evt_001";
  assert.throws(() => normalizeClickQualityEvent(event), /must match/);
});

test("reserved identifier tokens are rejected", () => {
  const event = sampleEvent();
  event.event_id = "cqe_scanner00000000";
  assert.throws(() => normalizeClickQualityEvent(event), /reserved token/);
});

test("legacy E01 and C01 identifiers are rejected", () => {
  const event = sampleEvent();
  event.event_id = "E01";
  assert.throws(() => normalizeClickQualityEvent(event), ClickQualityValidationError);
});

test("split and ground-truth fields are rejected from the runtime contract", () => {
  assert.throws(
    () => normalizeClickQualityEvent({ ...sampleEvent(), experiment_split: "challenge" }),
    /experiment_split/,
  );
  assert.throws(
    () => normalizeClickQualityEvent({ ...sampleEvent(), ground_truth: "HUMAN" }),
    /ground_truth/,
  );
  assert.throws(
    () => normalizeClickQualityEvent({ ...sampleEvent(), label: "HUMAN" }),
    /label/,
  );
});
