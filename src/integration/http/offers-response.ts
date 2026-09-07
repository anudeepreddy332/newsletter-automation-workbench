import {
  MOCK_EVERFLOW_SOURCE,
  SUPPORTED_OFFER_STATUSES,
  type IntegrationOffer,
  type IntegrationOfferStatus,
} from "@/src/integration/offers/model";
import { IntegrationHttpError } from "@/src/integration/http/stories-response";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new IntegrationHttpError(
      "INVALID_OFFERS_RESPONSE",
      `The offers catalog response is missing a valid ${field}.`,
    );
  }
  return value.trim();
}

function httpsTrackingUrl(value: unknown, field: string): string {
  const raw = requiredString(value, field);
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") {
      throw new IntegrationHttpError(
        "INVALID_OFFERS_RESPONSE",
        `The offers catalog response ${field} must use HTTPS.`,
      );
    }
    return url.toString();
  } catch (error) {
    if (error instanceof IntegrationHttpError) {
      throw error;
    }
    throw new IntegrationHttpError(
      "INVALID_OFFERS_RESPONSE",
      `The offers catalog response has an invalid ${field}.`,
    );
  }
}

function parseOffer(value: unknown, index: number): IntegrationOffer {
  if (!isRecord(value)) {
    throw new IntegrationHttpError(
      "INVALID_OFFERS_RESPONSE",
      `The offers catalog response offer ${index + 1} is invalid.`,
    );
  }

  const source = requiredString(value.source, `offer ${index + 1} source`);
  if (source !== MOCK_EVERFLOW_SOURCE) {
    throw new IntegrationHttpError(
      "INVALID_OFFERS_RESPONSE",
      `The offers catalog response offer ${index + 1} has an unsupported source.`,
    );
  }

  const status = requiredString(value.status, `offer ${index + 1} status`);
  if (!SUPPORTED_OFFER_STATUSES.includes(status as IntegrationOfferStatus)) {
    throw new IntegrationHttpError(
      "INVALID_OFFERS_RESPONSE",
      `The offers catalog response offer ${index + 1} has an unsupported status.`,
    );
  }

  return {
    id: requiredString(value.id, `offer ${index + 1} id`),
    source: MOCK_EVERFLOW_SOURCE,
    sourceOfferId: requiredString(value.sourceOfferId, `offer ${index + 1} sourceOfferId`),
    advertiserName: requiredString(value.advertiserName, `offer ${index + 1} advertiserName`),
    offerName: requiredString(value.offerName, `offer ${index + 1} offerName`),
    status: status as IntegrationOfferStatus,
    trackingUrl: httpsTrackingUrl(value.trackingUrl, `offer ${index + 1} trackingUrl`),
  };
}

export function parseOffersResponse(payload: unknown): IntegrationOffer[] {
  if (!isRecord(payload)) {
    throw new IntegrationHttpError(
      "INVALID_OFFERS_RESPONSE",
      "The offers catalog response is not a JSON object.",
    );
  }

  if (!Array.isArray(payload.offers)) {
    throw new IntegrationHttpError(
      "INVALID_OFFERS_RESPONSE",
      "The offers catalog response is missing an offers array.",
    );
  }

  const offers = payload.offers.map((offer, index) => parseOffer(offer, index));
  const ids = new Set<string>();
  const sourceIdentities = new Set<string>();

  for (const [index, offer] of offers.entries()) {
    if (ids.has(offer.id)) {
      throw new IntegrationHttpError(
        "INVALID_OFFERS_RESPONSE",
        "The offers catalog response contains duplicate IDs.",
      );
    }
    const sourceKey = `${offer.source}|${offer.sourceOfferId}`;
    if (sourceIdentities.has(sourceKey)) {
      throw new IntegrationHttpError(
        "INVALID_OFFERS_RESPONSE",
        `The offers catalog response offer ${index + 1} conflicts with another record that uses the same source identity.`,
      );
    }
    ids.add(offer.id);
    sourceIdentities.add(sourceKey);
  }

  return offers;
}
