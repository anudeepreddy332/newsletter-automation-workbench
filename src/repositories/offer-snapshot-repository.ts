import { and, asc, eq } from "drizzle-orm";

import type { ContentDatabase } from "@/src/db/database";
import { offerSnapshots } from "@/src/db/schema";
import {
  MOCK_EVERFLOW_SOURCE,
  SUPPORTED_OFFER_STATUSES,
  type IntegrationOffer,
  type IntegrationOfferStatus,
} from "@/src/integration/offers/model";

export class OfferSnapshotRepository {
  constructor(private readonly db: ContentDatabase) {}

  saveOffers(offers: readonly IntegrationOffer[]): void {
    this.db.transaction((tx) => {
      for (const offer of offers) {
        tx.insert(offerSnapshots)
          .values({
            id: offer.id,
            source: offer.source,
            sourceOfferId: offer.sourceOfferId,
            advertiserName: offer.advertiserName,
            offerName: offer.offerName,
            status: offer.status,
            trackingUrl: offer.trackingUrl,
          })
          .onConflictDoUpdate({
            target: offerSnapshots.id,
            set: {
              source: offer.source,
              sourceOfferId: offer.sourceOfferId,
              advertiserName: offer.advertiserName,
              offerName: offer.offerName,
              status: offer.status,
              trackingUrl: offer.trackingUrl,
            },
          })
          .run();
      }
    });
  }

  get(id: string): IntegrationOffer | undefined {
    const [row] = this.db
      .select()
      .from(offerSnapshots)
      .where(eq(offerSnapshots.id, id))
      .limit(1)
      .all();
    return row ? this.toIntegrationOffer(row) : undefined;
  }

  listActive(): IntegrationOffer[] {
    return this.mapOffers(
      this.db
        .select()
        .from(offerSnapshots)
        .where(and(eq(offerSnapshots.source, MOCK_EVERFLOW_SOURCE), eq(offerSnapshots.status, "active")))
        .orderBy(asc(offerSnapshots.sourceOfferId), asc(offerSnapshots.id))
        .all(),
    );
  }

  listAll(): IntegrationOffer[] {
    return this.mapOffers(
      this.db
        .select()
        .from(offerSnapshots)
        .orderBy(asc(offerSnapshots.sourceOfferId), asc(offerSnapshots.id))
        .all(),
    );
  }

  count(): number {
    return this.db.select({ id: offerSnapshots.id }).from(offerSnapshots).all().length;
  }

  private mapOffers(rows: Array<typeof offerSnapshots.$inferSelect>): IntegrationOffer[] {
    return rows.map((row) => this.toIntegrationOffer(row));
  }

  private toIntegrationOffer(row: typeof offerSnapshots.$inferSelect): IntegrationOffer {
    if (row.source !== MOCK_EVERFLOW_SOURCE) {
      throw new Error("Stored offer snapshot source is not mock-everflow.");
    }
    if (!SUPPORTED_OFFER_STATUSES.includes(row.status as IntegrationOfferStatus)) {
      throw new Error("Stored offer snapshot status is unsupported.");
    }
    return {
      id: row.id,
      source: MOCK_EVERFLOW_SOURCE,
      sourceOfferId: row.sourceOfferId,
      advertiserName: row.advertiserName,
      offerName: row.offerName,
      status: row.status as IntegrationOfferStatus,
      trackingUrl: row.trackingUrl,
    };
  }
}
