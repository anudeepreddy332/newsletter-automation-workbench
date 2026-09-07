import { readIntegrationApiBaseUrl } from "@/src/integration/http/config";
import { parseOffersResponse } from "@/src/integration/http/offers-response";
import { IntegrationHttpError } from "@/src/integration/http/stories-response";
import type { IntegrationOffer } from "@/src/integration/offers/model";

export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export interface AdvertiserOfferSource {
  read(): Promise<IntegrationOffer[]>;
}

export class FastApiOfferSource implements AdvertiserOfferSource {
  constructor(
    private readonly baseUrl: string = readIntegrationApiBaseUrl(),
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async read(): Promise<IntegrationOffer[]> {
    const url = `${this.baseUrl.replace(/\/+$/, "")}/offers`;
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "GET",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Cache-Control": "no-cache",
        },
      });
    } catch {
      throw new IntegrationHttpError(
        "OFFERS_UNAVAILABLE",
        "The offers catalog could not be reached.",
      );
    }

    if (!response.ok) {
      throw new IntegrationHttpError(
        "OFFERS_UNAVAILABLE",
        "The offers catalog is temporarily unavailable.",
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new IntegrationHttpError(
        "MALFORMED_OFFERS_JSON",
        "The offers catalog returned malformed JSON.",
      );
    }

    return parseOffersResponse(payload);
  }
}
