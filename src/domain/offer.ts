export type Offer = {
  id: string;
  advertiserName: string;
  offerName: string;
  trackingUrl: string;
};

export interface OfferCatalog {
  list(): readonly Offer[];
  get(id: string): Offer | undefined;
}
