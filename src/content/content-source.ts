import type { NormalizedContentBatch } from "@/src/domain/story";

export interface ContentSource {
  read(): Promise<NormalizedContentBatch>;
}

export class ContentSourceError extends Error {
  constructor(
    readonly code:
      | "MALFORMED_XML"
      | "MISSING_CHANNEL"
      | "MISSING_ITEMS"
      | "INVALID_ITEM"
      | "FIXTURE_READ_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "ContentSourceError";
  }
}
