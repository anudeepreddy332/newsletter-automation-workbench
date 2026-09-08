import { and, asc, eq } from "drizzle-orm";

import type { ClickQualityEvent } from "@/src/click-quality/contract";
import { ClickQualityIdentityConflictError } from "@/src/click-quality/errors";
import type { ClickQualityDatabase } from "@/src/click-quality/postgres/database";
import { clickQualityEvents } from "@/src/click-quality/postgres/schema";

type EventRow = typeof clickQualityEvents.$inferSelect;

function toIso(value: string | Date | null): string | null {
  if (value === null) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString();
  }
  const rewritten = value.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  const fallback = Date.parse(rewritten);
  return Number.isNaN(fallback) ? value : new Date(fallback).toISOString();
}

function rowToEvent(row: EventRow): ClickQualityEvent {
  return {
    schema_version: row.schemaVersion as ClickQualityEvent["schema_version"],
    event_id: row.eventId,
    occurred_at: toIso(row.occurredAt) ?? row.occurredAt,
    http_method: row.httpMethod as ClickQualityEvent["http_method"],
    recipient_id: row.recipientId,
    message_id: row.messageId,
    campaign_id: row.campaignId,
    link_id: row.linkId,
    link_position: row.linkPosition,
    tracked_link_count: row.trackedLinkCount,
    destination_host: row.destinationHost,
    message_sent_at: toIso(row.messageSentAt),
    user_agent_raw: row.userAgentRaw,
    accept_language_present: row.acceptLanguagePresent,
    accept_header_present: row.acceptHeaderPresent,
    network_type: row.networkType as ClickQualityEvent["network_type"],
    asn: row.asn,
    asn_org: row.asnOrg,
    js_execution: row.jsExecution as ClickQualityEvent["js_execution"],
    cookie_state: row.cookieState as ClickQualityEvent["cookie_state"],
    referrer_class: row.referrerClass as ClickQualityEvent["referrer_class"],
    source: row.source as ClickQualityEvent["source"],
  };
}

function eventValues(event: ClickQualityEvent) {
  return {
    eventId: event.event_id,
    schemaVersion: event.schema_version,
    occurredAt: event.occurred_at,
    httpMethod: event.http_method,
    recipientId: event.recipient_id,
    messageId: event.message_id,
    campaignId: event.campaign_id,
    linkId: event.link_id,
    linkPosition: event.link_position,
    trackedLinkCount: event.tracked_link_count,
    destinationHost: event.destination_host,
    messageSentAt: event.message_sent_at,
    userAgentRaw: event.user_agent_raw,
    acceptLanguagePresent: event.accept_language_present,
    acceptHeaderPresent: event.accept_header_present,
    networkType: event.network_type,
    asn: event.asn,
    asnOrg: event.asn_org,
    jsExecution: event.js_execution,
    cookieState: event.cookie_state,
    referrerClass: event.referrer_class,
    source: event.source,
  };
}

function sameEvent(left: ClickQualityEvent, right: ClickQualityEvent): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export class ClickQualityEventRepository {
  constructor(private readonly db: ClickQualityDatabase) {}

  async saveNormalizedBatch(batch: readonly ClickQualityEvent[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const event of batch) {
        const [existingById] = await tx
          .select()
          .from(clickQualityEvents)
          .where(eq(clickQualityEvents.eventId, event.event_id))
          .limit(1);

        if (existingById) {
          const stored = rowToEvent(existingById);
          if (!sameEvent(stored, event)) {
            throw new ClickQualityIdentityConflictError(
              event.event_id,
              `Click-quality identity conflict for ${event.event_id}: stored event does not match incoming payload. The batch was not saved.`,
            );
          }
          continue;
        }

        const [existingByNaturalKey] = await tx
          .select({ eventId: clickQualityEvents.eventId })
          .from(clickQualityEvents)
          .where(
            and(
              eq(clickQualityEvents.recipientId, event.recipient_id),
              eq(clickQualityEvents.messageId, event.message_id),
              eq(clickQualityEvents.linkId, event.link_id),
              eq(clickQualityEvents.occurredAt, event.occurred_at),
              eq(clickQualityEvents.httpMethod, event.http_method),
            ),
          )
          .limit(1);

        if (existingByNaturalKey && existingByNaturalKey.eventId !== event.event_id) {
          throw new ClickQualityIdentityConflictError(
            event.event_id,
            `Click-quality identity conflict: click already stored as ${existingByNaturalKey.eventId}, incoming id is ${event.event_id}. The batch was not saved.`,
          );
        }

        await tx.insert(clickQualityEvents).values(eventValues(event));
      }
    });
  }

  async countEvents(): Promise<number> {
    const rows = await this.db.select({ eventId: clickQualityEvents.eventId }).from(clickQualityEvents);
    return rows.length;
  }

  async listEvents(): Promise<ClickQualityEvent[]> {
    const rows = await this.db
      .select()
      .from(clickQualityEvents)
      .orderBy(asc(clickQualityEvents.eventId));
    return rows.map(rowToEvent);
  }
}
