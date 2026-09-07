import type { Offer, OfferCatalog } from "@/src/domain/offer";
import type { IntegrationOffer } from "@/src/integration/offers/model";
import { OfferSnapshotRepository } from "@/src/repositories/offer-snapshot-repository";

function toDomainOffer(offer: IntegrationOffer): Offer {
  return {
    id: offer.id,
    advertiserName: offer.advertiserName,
    offerName: offer.offerName,
    trackingUrl: offer.trackingUrl,
  };
}

export class SqliteOfferCatalog implements OfferCatalog {
  constructor(private readonly snapshots: OfferSnapshotRepository) {}

  list(): readonly Offer[] {
    return this.snapshots.listActive().map(toDomainOffer);
  }

  get(id: string): Offer | undefined {
    const stored = this.snapshots.get(id);
    return stored ? toDomainOffer(stored) : undefined;
  }
}
