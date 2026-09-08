import {
  CLICK_QUALITY_EVENT_KEYS,
  CLICK_QUALITY_EVENT_SCHEMA_VERSION,
  CLICK_QUALITY_EVENT_SOURCE,
  COOKIE_STATES,
  FORBIDDEN_PAYLOAD_KEYS,
  HTTP_METHODS,
  JS_EXECUTION_STATES,
  LEGACY_SPLIT_ID_PATTERN,
  NETWORK_TYPES,
  OPAQUE_ID_PATTERNS,
  REFERRER_CLASSES,
  REQUIRED_CLICK_QUALITY_EVENT_KEYS,
  RESERVED_IDENTIFIER_TOKENS,
  type ClickQualityEvent,
  type CookieState,
  type HttpMethod,
  type JsExecution,
  type NetworkType,
  type ReferrerClass,
} from "@/src/click-quality/contract";
import { ClickQualityValidationError } from "@/src/click-quality/errors";

const ALLOWED_KEYS = new Set<string>(CLICK_QUALITY_EVENT_KEYS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function quote(value: string): string {
  return `"${value}"`;
}

function fieldLabel(index: number, field: string): string {
  return `Event ${index + 1} field ${quote(field)}`;
}

function hasReservedToken(value: string): string | undefined {
  const lower = value.toLowerCase();
  return RESERVED_IDENTIFIER_TOKENS.find((token) => lower.includes(token));
}

function assertOpaqueId(
  index: number,
  field: "event_id" | "recipient_id" | "message_id" | "link_id" | "campaign_id",
  value: string,
): void {
  const token = hasReservedToken(value);
  if (token) {
    throw new ClickQualityValidationError(
      `${fieldLabel(index, field)} contains reserved token ${quote(token)}.`,
    );
  }
  if (LEGACY_SPLIT_ID_PATTERN.test(value)) {
    throw new ClickQualityValidationError(
      `${fieldLabel(index, field)} uses a split-revealing identifier.`,
    );
  }
  const pattern = OPAQUE_ID_PATTERNS[field];
  if (!pattern.test(value)) {
    throw new ClickQualityValidationError(
      `${fieldLabel(index, field)} must match ${pattern}.`,
    );
  }
}

function readRequiredString(index: number, payload: Record<string, unknown>, field: string): string {
  if (!(field in payload)) {
    throw new ClickQualityValidationError(`${fieldLabel(index, field)} is required.`);
  }
  const value = payload[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new ClickQualityValidationError(`${fieldLabel(index, field)} must be a non-empty string.`);
  }
  return value;
}

function readNullableString(index: number, payload: Record<string, unknown>, field: string): string | null {
  if (!(field in payload) || payload[field] === null) {
    return null;
  }
  const value = payload[field];
  if (typeof value !== "string") {
    throw new ClickQualityValidationError(`${fieldLabel(index, field)} must be a string or null.`);
  }
  return value;
}

function readNullableBoolean(
  index: number,
  payload: Record<string, unknown>,
  field: string,
): boolean | null {
  if (!(field in payload) || payload[field] === null) {
    return null;
  }
  const value = payload[field];
  if (typeof value !== "boolean") {
    throw new ClickQualityValidationError(`${fieldLabel(index, field)} must be a boolean or null.`);
  }
  return value;
}

function readNullableInteger(
  index: number,
  payload: Record<string, unknown>,
  field: string,
): number | null {
  if (!(field in payload) || payload[field] === null) {
    return null;
  }
  const value = payload[field];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ClickQualityValidationError(`${fieldLabel(index, field)} must be an integer or null.`);
  }
  return value;
}

function parseUtcTimestamp(index: number, field: string, value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]00:00)$/.test(value)) {
    throw new ClickQualityValidationError(
      `${fieldLabel(index, field)} must be an RFC 3339 UTC timestamp.`,
    );
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new ClickQualityValidationError(`${fieldLabel(index, field)} is not a valid timestamp.`);
  }
  return new Date(parsed).toISOString();
}

function readEnum<T extends string>(
  index: number,
  payload: Record<string, unknown>,
  field: string,
  allowed: readonly T[],
): T {
  const value = readRequiredString(index, payload, field);
  if (!allowed.includes(value as T)) {
    throw new ClickQualityValidationError(`${fieldLabel(index, field)} has an invalid enum value.`);
  }
  return value as T;
}

export function validateClickQualityEvent(payload: unknown, index = 0): ClickQualityEvent {
  if (!isRecord(payload)) {
    throw new ClickQualityValidationError(`Event ${index + 1} must be an object.`);
  }

  for (const key of Object.keys(payload)) {
    if (FORBIDDEN_PAYLOAD_KEYS.includes(key as (typeof FORBIDDEN_PAYLOAD_KEYS)[number])) {
      throw new ClickQualityValidationError(
        `Event ${index + 1} contains forbidden field ${quote(key)}.`,
      );
    }
    if (!ALLOWED_KEYS.has(key)) {
      throw new ClickQualityValidationError(
        `Event ${index + 1} contains unsupported field ${quote(key)}.`,
      );
    }
  }

  for (const key of REQUIRED_CLICK_QUALITY_EVENT_KEYS) {
    if (!(key in payload)) {
      throw new ClickQualityValidationError(`${fieldLabel(index, key)} is required.`);
    }
  }

  const schemaVersion = readRequiredString(index, payload, "schema_version");
  if (schemaVersion !== CLICK_QUALITY_EVENT_SCHEMA_VERSION) {
    throw new ClickQualityValidationError(
      `${fieldLabel(index, "schema_version")} must be ${quote(CLICK_QUALITY_EVENT_SCHEMA_VERSION)}.`,
    );
  }

  const eventId = readRequiredString(index, payload, "event_id");
  assertOpaqueId(index, "event_id", eventId);

  const recipientId = readRequiredString(index, payload, "recipient_id");
  if (recipientId.includes("@")) {
    throw new ClickQualityValidationError(
      `${fieldLabel(index, "recipient_id")} must not contain an email address.`,
    );
  }
  assertOpaqueId(index, "recipient_id", recipientId);

  const messageId = readRequiredString(index, payload, "message_id");
  assertOpaqueId(index, "message_id", messageId);

  const linkId = readRequiredString(index, payload, "link_id");
  assertOpaqueId(index, "link_id", linkId);

  let campaignId: string | null;
  if (payload.campaign_id === null) {
    campaignId = null;
  } else {
    campaignId = readRequiredString(index, payload, "campaign_id");
    assertOpaqueId(index, "campaign_id", campaignId);
  }

  const occurredAt = parseUtcTimestamp(
    index,
    "occurred_at",
    readRequiredString(index, payload, "occurred_at"),
  );

  const messageSentRaw = readNullableString(index, payload, "message_sent_at");
  const messageSentAt =
    messageSentRaw === null ? null : parseUtcTimestamp(index, "message_sent_at", messageSentRaw);

  const linkPosition = readNullableInteger(index, payload, "link_position");
  if (linkPosition !== null && linkPosition < 1) {
    throw new ClickQualityValidationError(`${fieldLabel(index, "link_position")} must be >= 1.`);
  }

  const trackedLinkCount = readNullableInteger(index, payload, "tracked_link_count");
  if (trackedLinkCount !== null && trackedLinkCount < 1) {
    throw new ClickQualityValidationError(
      `${fieldLabel(index, "tracked_link_count")} must be >= 1.`,
    );
  }

  const asn = readNullableInteger(index, payload, "asn");
  const destinationHost = readNullableString(index, payload, "destination_host");
  const userAgentRaw = readNullableString(index, payload, "user_agent_raw");
  const asnOrg = readNullableString(index, payload, "asn_org");

  const source = readRequiredString(index, payload, "source");
  if (source !== CLICK_QUALITY_EVENT_SOURCE) {
    throw new ClickQualityValidationError(
      `${fieldLabel(index, "source")} must be ${quote(CLICK_QUALITY_EVENT_SOURCE)}.`,
    );
  }

  return {
    schema_version: CLICK_QUALITY_EVENT_SCHEMA_VERSION,
    event_id: eventId,
    occurred_at: occurredAt,
    http_method: readEnum(index, payload, "http_method", HTTP_METHODS) as HttpMethod,
    recipient_id: recipientId,
    message_id: messageId,
    campaign_id: campaignId,
    link_id: linkId,
    link_position: linkPosition,
    tracked_link_count: trackedLinkCount,
    destination_host: destinationHost === null ? null : destinationHost.trim() || null,
    message_sent_at: messageSentAt,
    user_agent_raw: userAgentRaw === null ? null : userAgentRaw.trim() || null,
    accept_language_present: readNullableBoolean(index, payload, "accept_language_present"),
    accept_header_present: readNullableBoolean(index, payload, "accept_header_present"),
    network_type: readEnum(index, payload, "network_type", NETWORK_TYPES) as NetworkType,
    asn,
    asn_org: asnOrg === null ? null : asnOrg.trim() || null,
    js_execution: readEnum(index, payload, "js_execution", JS_EXECUTION_STATES) as JsExecution,
    cookie_state: readEnum(index, payload, "cookie_state", COOKIE_STATES) as CookieState,
    referrer_class: readEnum(index, payload, "referrer_class", REFERRER_CLASSES) as ReferrerClass,
    source: CLICK_QUALITY_EVENT_SOURCE,
  };
}

export function validateClickQualityEventBatch(payload: unknown): ClickQualityEvent[] {
  if (!Array.isArray(payload)) {
    throw new ClickQualityValidationError("Click-quality fixture must be a JSON array.");
  }
  if (payload.length === 0) {
    throw new ClickQualityValidationError("Click-quality event batch is empty.");
  }

  const events = payload.map((item, index) => validateClickQualityEvent(item, index));
  const ids = new Set<string>();
  const naturalKeys = new Set<string>();
  for (const event of events) {
    if (ids.has(event.event_id)) {
      throw new ClickQualityValidationError("Click-quality batch contains duplicate event_id values.");
    }
    ids.add(event.event_id);
    const naturalKey = [
      event.recipient_id,
      event.message_id,
      event.link_id,
      event.occurred_at,
      event.http_method,
    ].join("|");
    if (naturalKeys.has(naturalKey)) {
      throw new ClickQualityValidationError(
        "Click-quality batch contains duplicate click identities.",
      );
    }
    naturalKeys.add(naturalKey);
  }
  return events;
}
