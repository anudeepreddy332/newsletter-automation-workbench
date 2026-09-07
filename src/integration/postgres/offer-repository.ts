import { and, asc, eq } from "drizzle-orm";

import { MOCK_EVERFLOW_SOURCE, type IntegrationOffer } from "@/src/integration/offers/model";
import type { IntegrationDatabase } from "@/src/integration/postgres/database";
import { offers } from "@/src/integration/postgres/schema";

export class IntegrationOfferIdentityConflictError extends Error {
  readonly source: string;
  readonly sourceOfferId: string;
  readonly existingId: string;
  readonly incomingId: string;

  constructor(source: string, sourceOfferId: string, existingId: string, incomingId: string) {
    super(
      `Offer identity conflict: source identity already belongs to ${existingId}, incoming id is ${incomingId}. The batch was not saved.`,
    );
    this.name = "IntegrationOfferIdentityConflictError";
    this.source = source;
    this.sourceOfferId = sourceOfferId;
    this.existingId = existingId;
    this.incomingId = incomingId;
  }
}

export class IntegrationOfferRepository {
  constructor(private readonly db: IntegrationDatabase) {}

  async saveNormalizedBatch(batch: readonly IntegrationOffer[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const offer of batch) {
        const [existingBySource] = await tx
          .select({ id: offers.id })
          .from(offers)
          .where(and(eq(offers.source, offer.source), eq(offers.sourceOfferId, offer.sourceOfferId)))
          .limit(1);

        if (existingBySource && existingBySource.id !== offer.id) {
          throw new IntegrationOfferIdentityConflictError(
            offer.source,
            offer.sourceOfferId,
            existingBySource.id,
            offer.id,
          );
        }

        const [existingById] = await tx
          .select({ source: offers.source, sourceOfferId: offers.sourceOfferId })
          .from(offers)
          .where(eq(offers.id, offer.id))
          .limit(1);

        if (
          existingById &&
          (existingById.source !== offer.source || existingById.sourceOfferId !== offer.sourceOfferId)
        ) {
          throw new IntegrationOfferIdentityConflictError(
            offer.source,
            offer.sourceOfferId,
            offer.id,
            offer.id,
          );
        }

        await tx
          .insert(offers)
          .values(offer)
          .onConflictDoUpdate({
            target: offers.id,
            set: {
              source: offer.source,
              sourceOfferId: offer.sourceOfferId,
              advertiserName: offer.advertiserName,
              offerName: offer.offerName,
              status: offer.status,
              trackingUrl: offer.trackingUrl,
            },
          });
      }
    });
  }

  async countOffers(): Promise<number> {
    const rows = await this.db.select({ id: offers.id }).from(offers);
    return rows.length;
  }

  async listOffers(): Promise<IntegrationOffer[]> {
    const rows = await this.db.select().from(offers).orderBy(asc(offers.sourceOfferId));
    return rows.map((row) => {
      if (row.source !== MOCK_EVERFLOW_SOURCE) {
        throw new Error("Stored offer source is not mock-everflow.");
      }
      if (row.status !== "active" && row.status !== "paused") {
        throw new Error("Stored offer status is unsupported.");
      }
      return {
        id: row.id,
        source: MOCK_EVERFLOW_SOURCE,
        sourceOfferId: row.sourceOfferId,
        advertiserName: row.advertiserName,
        offerName: row.offerName,
        status: row.status,
        trackingUrl: row.trackingUrl,
      };
    });
  }
}
