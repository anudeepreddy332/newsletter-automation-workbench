import type { ContentSource } from "@/src/content/content-source";
import type { NormalizedContentBatch } from "@/src/domain/story";
import { readIntegrationApiBaseUrl } from "@/src/integration/http/config";
import {
  IntegrationHttpError,
  parseStoriesResponse,
} from "@/src/integration/http/stories-response";

export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export class FastApiStorySource implements ContentSource {
  constructor(
    private readonly baseUrl: string = readIntegrationApiBaseUrl(),
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async read(): Promise<NormalizedContentBatch> {
    const url = `${this.baseUrl.replace(/\/+$/, "")}/stories`;
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
        "STORIES_UNAVAILABLE",
        "The stories catalog could not be reached.",
      );
    }

    if (!response.ok) {
      throw new IntegrationHttpError(
        "STORIES_UNAVAILABLE",
        "The stories catalog is temporarily unavailable.",
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new IntegrationHttpError(
        "MALFORMED_STORIES_JSON",
        "The stories catalog returned malformed JSON.",
      );
    }

    return parseStoriesResponse(payload);
  }
}
