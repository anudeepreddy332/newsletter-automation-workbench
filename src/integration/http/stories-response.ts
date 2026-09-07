import type { ContentFeed, NormalizedContentBatch, Story } from "@/src/domain/story";

export class IntegrationHttpError extends Error {
  constructor(
    readonly code:
      | "STORIES_UNAVAILABLE"
      | "MALFORMED_STORIES_JSON"
      | "INVALID_STORIES_RESPONSE"
      | "OFFERS_UNAVAILABLE"
      | "MALFORMED_OFFERS_JSON"
      | "INVALID_OFFERS_RESPONSE",
    message: string,
  ) {
    super(message);
    this.name = "IntegrationHttpError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new IntegrationHttpError(
      "INVALID_STORIES_RESPONSE",
      `The stories catalog response is missing a valid ${field}.`,
    );
  }
  return value;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new IntegrationHttpError(
      "INVALID_STORIES_RESPONSE",
      `The stories catalog response has an invalid ${field}.`,
    );
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function httpsUrl(value: string, field: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      throw new IntegrationHttpError(
        "INVALID_STORIES_RESPONSE",
        `The stories catalog response ${field} must use HTTPS.`,
      );
    }
    return url.toString();
  } catch (error) {
    if (error instanceof IntegrationHttpError) {
      throw error;
    }
    throw new IntegrationHttpError(
      "INVALID_STORIES_RESPONSE",
      `The stories catalog response has an invalid ${field}.`,
    );
  }
}

function utcTimestamp(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new IntegrationHttpError(
      "INVALID_STORIES_RESPONSE",
      "The stories catalog response is missing a valid publishedAt.",
    );
  }
  const publishedAt = new Date(value);
  if (Number.isNaN(publishedAt.valueOf())) {
    throw new IntegrationHttpError(
      "INVALID_STORIES_RESPONSE",
      "The stories catalog response has an invalid publishedAt.",
    );
  }
  return publishedAt.toISOString();
}

function parseContentFeed(value: unknown): ContentFeed {
  if (!isRecord(value)) {
    throw new IntegrationHttpError(
      "INVALID_STORIES_RESPONSE",
      "The stories catalog response is missing a content feed.",
    );
  }

  const sourceKind = requiredString(value.sourceKind, "contentFeed.sourceKind");
  if (sourceKind !== "rss") {
    throw new IntegrationHttpError(
      "INVALID_STORIES_RESPONSE",
      "The stories catalog response contentFeed.sourceKind must be rss.",
    );
  }

  return {
    id: requiredString(value.id, "contentFeed.id"),
    name: requiredString(value.name, "contentFeed.name"),
    sourceKind,
  };
}

function parseStory(value: unknown, index: number): Story {
  if (!isRecord(value)) {
    throw new IntegrationHttpError(
      "INVALID_STORIES_RESPONSE",
      `The stories catalog response story ${index + 1} is invalid.`,
    );
  }

  const imageUrl = optionalString(value.imageUrl, `story ${index + 1} imageUrl`);
  return {
    id: requiredString(value.id, `story ${index + 1} id`),
    contentFeedId: requiredString(value.contentFeedId, `story ${index + 1} contentFeedId`),
    title: requiredString(value.title, `story ${index + 1} title`),
    summary: requiredString(value.summary, `story ${index + 1} summary`),
    body: optionalString(value.body, `story ${index + 1} body`),
    canonicalUrl: httpsUrl(
      requiredString(value.canonicalUrl, `story ${index + 1} canonicalUrl`),
      `story ${index + 1} canonicalUrl`,
    ),
    imageUrl: imageUrl ? httpsUrl(imageUrl, `story ${index + 1} imageUrl`) : undefined,
    publishedAt: utcTimestamp(value.publishedAt),
    sourceAuthor: optionalString(value.sourceAuthor, `story ${index + 1} sourceAuthor`),
    sourceItemId: optionalString(value.sourceItemId, `story ${index + 1} sourceItemId`),
  };
}

export function parseStoriesResponse(payload: unknown): NormalizedContentBatch {
  if (!isRecord(payload)) {
    throw new IntegrationHttpError(
      "INVALID_STORIES_RESPONSE",
      "The stories catalog response is not a JSON object.",
    );
  }

  if (!Array.isArray(payload.stories)) {
    throw new IntegrationHttpError(
      "INVALID_STORIES_RESPONSE",
      "The stories catalog response is missing a stories array.",
    );
  }

  const contentFeed = parseContentFeed(payload.contentFeed);
  const stories = payload.stories.map((story, index) => {
    const parsed = parseStory(story, index);
    if (parsed.contentFeedId !== contentFeed.id) {
      throw new IntegrationHttpError(
        "INVALID_STORIES_RESPONSE",
        `The stories catalog response story ${index + 1} does not belong to the content feed.`,
      );
    }
    return parsed;
  });

  return { contentFeed, stories };
}
