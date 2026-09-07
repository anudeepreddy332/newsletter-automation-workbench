import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  MOCK_EVERFLOW_SOURCE,
  SUPPORTED_OFFER_STATUSES,
  type IntegrationOffer,
  type IntegrationOfferStatus,
} from "@/src/integration/offers/model";

export const MOCK_EVERFLOW_OFFERS_FIXTURE_PATH = path.join(
  process.cwd(),
  "tests/fixtures/mock-everflow-offers.json",
);

export class IntegrationOfferSyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IntegrationOfferSyncError";
  }
}

export function integrationOfferId(source: string, sourceOfferId: string): string {
  return `offer_${createHash("sha256").update(`${source}|${sourceOfferId}`).digest("hex").slice(0, 24)}`;
}

function requiredText(value: unknown, field: string, index: number): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new IntegrationOfferSyncError(
      `Offer ${index + 1} is missing a required ${field} value.`,
    );
  }
  return value.trim();
}

function supportedStatus(value: unknown, index: number): IntegrationOfferStatus {
  const status = requiredText(value, "status", index);
  if (!SUPPORTED_OFFER_STATUSES.includes(status as IntegrationOfferStatus)) {
    throw new IntegrationOfferSyncError(
      `Offer ${index + 1} has an unsupported status.`,
    );
  }
  return status as IntegrationOfferStatus;
}

function httpsTrackingUrl(value: unknown, index: number): string {
  const raw = requiredText(value, "tracking_url", index);
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") {
      throw new IntegrationOfferSyncError(
        `Offer ${index + 1} tracking URL must use HTTPS.`,
      );
    }
    return url.toString();
  } catch (error) {
    if (error instanceof IntegrationOfferSyncError) {
      throw error;
    }
    throw new IntegrationOfferSyncError(`Offer ${index + 1} has an invalid tracking URL.`);
  }
}

export function normalizeMockEverflowOffer(
  record: unknown,
  index: number,
): IntegrationOffer {
  if (record === null || typeof record !== "object" || Array.isArray(record)) {
    throw new IntegrationOfferSyncError(`Offer ${index + 1} is not a JSON object.`);
  }

  const row = record as Record<string, unknown>;
  const sourceOfferId = requiredText(row.offer_id, "offer_id", index);
  const advertiserName = requiredText(row.advertiser_name, "advertiser_name", index);
  const offerName = requiredText(row.name, "name", index);
  const status = supportedStatus(row.status, index);
  const trackingUrl = httpsTrackingUrl(row.tracking_url, index);

  return {
    id: integrationOfferId(MOCK_EVERFLOW_SOURCE, sourceOfferId),
    source: MOCK_EVERFLOW_SOURCE,
    sourceOfferId,
    advertiserName,
    offerName,
    status,
    trackingUrl,
  };
}

function offersAreIdentical(left: IntegrationOffer, right: IntegrationOffer): boolean {
  return (
    left.id === right.id &&
    left.source === right.source &&
    left.sourceOfferId === right.sourceOfferId &&
    left.advertiserName === right.advertiserName &&
    left.offerName === right.offerName &&
    left.status === right.status &&
    left.trackingUrl === right.trackingUrl
  );
}

export function deduplicateNormalizedOffers(
  offers: readonly IntegrationOffer[],
): IntegrationOffer[] {
  const bySourceIdentity = new Map<string, IntegrationOffer>();

  for (const [index, offer] of offers.entries()) {
    const key = `${offer.source}|${offer.sourceOfferId}`;
    const existing = bySourceIdentity.get(key);
    if (!existing) {
      bySourceIdentity.set(key, offer);
      continue;
    }
    if (offersAreIdentical(existing, offer)) {
      continue;
    }
    throw new IntegrationOfferSyncError(
      `Offer ${index + 1} conflicts with another record that uses the same source identity.`,
    );
  }

  return [...bySourceIdentity.values()];
}

export function parseMockEverflowOffers(payload: unknown): IntegrationOffer[] {
  if (!Array.isArray(payload)) {
    throw new IntegrationOfferSyncError("Offer fixture must be a JSON array.");
  }
  if (payload.length === 0) {
    throw new IntegrationOfferSyncError("Offer fixture is empty.");
  }

  return deduplicateNormalizedOffers(payload.map((record, index) => normalizeMockEverflowOffer(record, index)));
}

export class MockEverflowOfferFixtureSource {
  constructor(private readonly fixturePath: string = MOCK_EVERFLOW_OFFERS_FIXTURE_PATH) {}

  async read(): Promise<IntegrationOffer[]> {
    let raw: string;
    try {
      raw = await readFile(this.fixturePath, "utf8");
    } catch {
      throw new IntegrationOfferSyncError("Offer fixture could not be read.");
    }

    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new IntegrationOfferSyncError("Offer fixture JSON is malformed.");
    }

    return parseMockEverflowOffers(payload);
  }
}
