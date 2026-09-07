export const MOCK_EVERFLOW_SOURCE = "mock-everflow";

export const SUPPORTED_OFFER_STATUSES = ["active", "paused"] as const;

export type IntegrationOfferStatus = (typeof SUPPORTED_OFFER_STATUSES)[number];

export type IntegrationOffer = {
  id: string;
  source: typeof MOCK_EVERFLOW_SOURCE;
  sourceOfferId: string;
  advertiserName: string;
  offerName: string;
  status: IntegrationOfferStatus;
  trackingUrl: string;
};
