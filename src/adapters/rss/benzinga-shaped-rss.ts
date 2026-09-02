import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { XMLParser, XMLValidator } from "fast-xml-parser";

import { ContentSourceError, type ContentSource } from "@/src/content/content-source";
import type {
  NormalizedContentBatch,
  ContentFeed,
  Story,
} from "@/src/domain/story";

const BENZINGA_SHAPED_CONTENT_FEED: ContentFeed = {
  id: "content_feed_benzinga_shaped_fixture",
  name: "Benzinga-shaped financial-news fixture",
  sourceKind: "rss",
};

type RawRssItem = {
  title?: unknown;
  description?: unknown;
  link?: unknown;
  guid?: unknown;
  pubDate?: unknown;
  "dc:creator"?: unknown;
  "media:content"?: unknown;
};

type ParsedRss = {
  rss?: {
    channel?: {
      item?: RawRssItem | RawRssItem[];
    };
  };
};

const parser = new XMLParser({
  attributeNamePrefix: "",
  cdataPropName: "__cdata",
  ignoreAttributes: false,
  parseTagValue: false,
  trimValues: true,
});

function asString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (
    value !== null &&
    typeof value === "object" &&
    "__cdata" in value
  ) {
    return asString(value.__cdata);
  }

  if (value !== null && typeof value === "object" && "#text" in value) {
    return asString(value["#text"]);
  }

  return undefined;
}

function toPlainText(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function requireText(value: unknown, field: string, index: number): string {
  const text = asString(value);

  if (!text) {
    throw new ContentSourceError(
      "INVALID_ITEM",
      `RSS item ${index + 1} is missing a required ${field} value.`,
    );
  }

  return text;
}

function validHttpsUrl(value: string, field: string, index: number): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      throw new ContentSourceError(
        "INVALID_ITEM",
        `RSS item ${index + 1} ${field} URL must use HTTPS.`,
      );
    }
    return url.toString();
  } catch (error) {
    if (error instanceof ContentSourceError) {
      throw error;
    }
    throw new ContentSourceError(
      "INVALID_ITEM",
      `RSS item ${index + 1} has an invalid ${field} URL.`,
    );
  }
}

function optionalImageUrl(value: unknown, index: number): string | undefined {
  const candidate = value as { url?: unknown } | undefined;
  const url = asString(candidate?.url);
  return url ? validHttpsUrl(url, "image", index) : undefined;
}

function normalizeItem(item: RawRssItem, index: number): Story {
  const title = requireText(item.title, "title", index);
  const description = requireText(item.description, "description", index);
  const summary = toPlainText(description);

  if (!summary) {
    throw new ContentSourceError(
      "INVALID_ITEM",
      `RSS item ${index + 1} has an empty description after normalization.`,
    );
  }

  const canonicalUrl = validHttpsUrl(
    requireText(item.link, "link", index),
    "canonical",
    index,
  );
  const publishedAt = new Date(requireText(item.pubDate, "pubDate", index));

  if (Number.isNaN(publishedAt.valueOf())) {
    throw new ContentSourceError(
      "INVALID_ITEM",
      `RSS item ${index + 1} has an invalid publication timestamp.`,
    );
  }

  const sourceItemId = asString(item.guid);
  const idSeed = sourceItemId ?? `${canonicalUrl}|${publishedAt.toISOString()}`;

  return {
    id: `story_${createHash("sha256").update(idSeed).digest("hex").slice(0, 24)}`,
    contentFeedId: BENZINGA_SHAPED_CONTENT_FEED.id,
    title,
    summary,
    canonicalUrl,
    imageUrl: optionalImageUrl(item["media:content"], index),
    publishedAt: publishedAt.toISOString(),
    sourceAuthor: asString(item["dc:creator"]),
    sourceItemId,
  };
}

export function parseBenzingaShapedRss(xml: string): NormalizedContentBatch {
  const validation = XMLValidator.validate(xml);
  if (validation !== true) {
    throw new ContentSourceError("MALFORMED_XML", "RSS fixture XML is malformed.");
  }

  const parsed = parser.parse(xml) as ParsedRss;
  const channel = parsed.rss?.channel;
  if (!channel) {
    throw new ContentSourceError("MISSING_CHANNEL", "RSS fixture has no channel.");
  }

  const items = channel.item
    ? Array.isArray(channel.item)
      ? channel.item
      : [channel.item]
    : [];

  if (items.length === 0) {
    throw new ContentSourceError("MISSING_ITEMS", "RSS fixture has no items.");
  }

  return {
    contentFeed: BENZINGA_SHAPED_CONTENT_FEED,
    stories: items.map(normalizeItem),
  };
}

export class BenzingaShapedFixtureSource implements ContentSource {
  constructor(private readonly fixturePath: string) {}

  async read(): Promise<NormalizedContentBatch> {
    let xml: string;
    try {
      xml = await readFile(this.fixturePath, "utf8");
    } catch {
      throw new ContentSourceError(
        "FIXTURE_READ_FAILED",
        "RSS fixture could not be read.",
      );
    }

    return parseBenzingaShapedRss(xml);
  }
}
