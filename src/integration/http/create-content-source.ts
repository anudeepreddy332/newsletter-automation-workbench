import path from "node:path";

import { BenzingaShapedFixtureSource } from "@/src/adapters/rss/benzinga-shaped-rss";
import type { ContentSource } from "@/src/content/content-source";
import {
  readIntegrationApiBaseUrl,
  readNewsletterIntegrationMode,
} from "@/src/integration/http/config";
import { FastApiStorySource } from "@/src/integration/http/fastapi-story-source";

const fixturePath = path.join(
  process.cwd(),
  "tests/fixtures/benzinga-shaped-financial-news.xml",
);

export function createWorkbenchContentSource(
  env: NodeJS.Dict<string> = process.env,
): ContentSource {
  if (readNewsletterIntegrationMode(env) === "drill") {
    return new FastApiStorySource(readIntegrationApiBaseUrl(env));
  }

  return new BenzingaShapedFixtureSource(fixturePath);
}
