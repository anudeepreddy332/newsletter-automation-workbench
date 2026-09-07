import type { IntegrationDatabase } from "@/src/integration/postgres/database";
import { IntegrationOfferRepository } from "@/src/integration/postgres/offer-repository";
import {
  IntegrationOfferSyncError,
  MOCK_EVERFLOW_OFFERS_FIXTURE_PATH,
  MockEverflowOfferFixtureSource,
} from "@/src/integration/offers/fixture-source";
import {
  SUPPORTED_OFFER_STATUSES,
  type IntegrationOffer,
  type IntegrationOfferStatus,
} from "@/src/integration/offers/model";

export type OfferSyncResult = {
  processed: number;
  stored: number;
};

export function validateNormalizedOfferBatch(batch: readonly IntegrationOffer[]): void {
  if (batch.length === 0) {
    throw new IntegrationOfferSyncError("Offer batch is empty.");
  }

  const ids = new Set<string>();
  const sourceIdentities = new Set<string>();

  for (const [index, offer] of batch.entries()) {
    if (
      !offer.id ||
      !offer.source ||
      !offer.sourceOfferId ||
      !offer.advertiserName ||
      !offer.offerName ||
      !offer.status ||
      !offer.trackingUrl
    ) {
      throw new IntegrationOfferSyncError(`Offer ${index + 1} is missing a required normalized field.`);
    }

    if (!SUPPORTED_OFFER_STATUSES.includes(offer.status as IntegrationOfferStatus)) {
      throw new IntegrationOfferSyncError(`Offer ${index + 1} has an unsupported status.`);
    }

    try {
      const trackingUrl = new URL(offer.trackingUrl);
      if (trackingUrl.protocol !== "https:") {
        throw new IntegrationOfferSyncError(`Offer ${index + 1} tracking URL must use HTTPS.`);
      }
    } catch (error) {
      if (error instanceof IntegrationOfferSyncError) {
        throw error;
      }
      throw new IntegrationOfferSyncError(`Offer ${index + 1} has an invalid tracking URL.`);
    }

    if (ids.has(offer.id)) {
      throw new IntegrationOfferSyncError("Offer batch contains duplicate IDs.");
    }
    const sourceKey = `${offer.source}|${offer.sourceOfferId}`;
    if (sourceIdentities.has(sourceKey)) {
      throw new IntegrationOfferSyncError("Offer batch contains duplicate source identities.");
    }
    ids.add(offer.id);
    sourceIdentities.add(sourceKey);
  }
}

export async function syncMockEverflowOffersToPostgres(options: {
  db: IntegrationDatabase;
  fixturePath?: string;
  offers?: IntegrationOffer[];
}): Promise<OfferSyncResult> {
  const batch =
    options.offers ??
    (await new MockEverflowOfferFixtureSource(
      options.fixturePath ?? MOCK_EVERFLOW_OFFERS_FIXTURE_PATH,
    ).read());
  validateNormalizedOfferBatch(batch);

  const repository = new IntegrationOfferRepository(options.db);
  await repository.saveNormalizedBatch(batch);

  return {
    processed: batch.length,
    stored: await repository.countOffers(),
  };
}
