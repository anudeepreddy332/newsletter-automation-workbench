import { mockEverflowOfferCatalog } from "@/src/adapters/offers/mock-everflow";
import type { ContentDatabase } from "@/src/db/database";
import type { OfferCatalog } from "@/src/domain/offer";
import {
  readIntegrationApiBaseUrl,
  readNewsletterIntegrationMode,
} from "@/src/integration/http/config";
import {
  FastApiOfferSource,
  type AdvertiserOfferSource,
} from "@/src/integration/http/fastapi-offer-source";
import { SqliteOfferCatalog } from "@/src/integration/offers/sqlite-offer-catalog";
import { OfferSnapshotRepository } from "@/src/repositories/offer-snapshot-repository";

export function createWorkbenchOfferCatalog(
  db: ContentDatabase,
  env: NodeJS.Dict<string> = process.env,
): OfferCatalog {
  if (readNewsletterIntegrationMode(env) === "drill") {
    return new SqliteOfferCatalog(new OfferSnapshotRepository(db));
  }

  return mockEverflowOfferCatalog;
}

export function createWorkbenchOfferSource(
  env: NodeJS.Dict<string> = process.env,
): AdvertiserOfferSource | null {
  if (readNewsletterIntegrationMode(env) === "drill") {
    return new FastApiOfferSource(readIntegrationApiBaseUrl(env));
  }

  return null;
}

export function createWorkbenchOfferSnapshots(
  db: ContentDatabase,
  env: NodeJS.Dict<string> = process.env,
): OfferSnapshotRepository | null {
  if (readNewsletterIntegrationMode(env) === "drill") {
    return new OfferSnapshotRepository(db);
  }

  return null;
}
