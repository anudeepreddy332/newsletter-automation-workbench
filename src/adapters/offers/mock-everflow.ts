import type { Offer, OfferCatalog } from "@/src/domain/offer";

export const MOCK_OFFER_CATALOG: readonly Offer[] = [
  {
    id: "offer_harborline_savings",
    advertiserName: "Harborline Savings",
    offerName: "High-yield savings account review",
    trackingUrl: "https://offers-fixture.test/track/harborline-savings",
  },
  {
    id: "offer_northstar_brokerage",
    advertiserName: "Northstar Brokerage",
    offerName: "Self-directed investing starter kit",
    trackingUrl: "https://offers-fixture.test/track/northstar-brokerage",
  },
  {
    id: "offer_ledgerbay_software",
    advertiserName: "LedgerBay Software",
    offerName: "Small-business bookkeeping trial",
    trackingUrl: "https://offers-fixture.test/track/ledgerbay-software",
  },
  {
    id: "offer_summit_mutual",
    advertiserName: "Summit Mutual",
    offerName: "Term life insurance quote guide",
    trackingUrl: "https://offers-fixture.test/track/summit-mutual",
  },
  {
    id: "offer_riverview_credit",
    advertiserName: "Riverview Credit",
    offerName: "Personal loan comparison worksheet",
    trackingUrl: "https://offers-fixture.test/track/riverview-credit",
  },
];

export class MockEverflowOfferCatalog implements OfferCatalog {
  list(): readonly Offer[] {
    return MOCK_OFFER_CATALOG;
  }

  get(id: string): Offer | undefined {
    return MOCK_OFFER_CATALOG.find((offer) => offer.id === id);
  }
}

export const mockEverflowOfferCatalog = new MockEverflowOfferCatalog();
