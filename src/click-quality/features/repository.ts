import { eq } from "drizzle-orm";

import { ClickQualityFeatureConflictError } from "@/src/click-quality/errors";
import {
  EXTRACTOR_VERSION,
  FEATURE_SCHEMA_VERSION,
} from "@/src/click-quality/features/versions";
import type { ExtractedFeatures } from "@/src/click-quality/features/types";
import type { ClickQualityDatabase } from "@/src/click-quality/postgres/database";
import { clickQualityEventFeatures } from "@/src/click-quality/postgres/schema";

export class ClickQualityFeatureRepository {
  constructor(private readonly db: ClickQualityDatabase) {}

  async saveExtractedBatch(batch: readonly ExtractedFeatures[], extractedAt: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const row of batch) {
        const [existing] = await tx
          .select()
          .from(clickQualityEventFeatures)
          .where(eq(clickQualityEventFeatures.eventId, row.event_id))
          .limit(1);

        if (existing) {
          if (
            existing.featureSchemaVersion !== FEATURE_SCHEMA_VERSION ||
            existing.extractorVersion !== EXTRACTOR_VERSION
          ) {
            throw new ClickQualityFeatureConflictError(
              row.event_id,
              `Click-quality feature version conflict for ${row.event_id}: stored ${existing.featureSchemaVersion}/${existing.extractorVersion}, incoming ${FEATURE_SCHEMA_VERSION}/${EXTRACTOR_VERSION}. The batch was not saved.`,
            );
          }
          if (existing.featureVectorHash !== row.feature_vector_hash) {
            throw new ClickQualityFeatureConflictError(
              row.event_id,
              `Click-quality feature hash conflict for ${row.event_id}: stored evidence does not match the current extractor. The batch was not saved.`,
            );
          }
          continue;
        }

        await tx.insert(clickQualityEventFeatures).values({
          eventId: row.event_id,
          featureSchemaVersion: row.feature_schema_version,
          extractorVersion: row.extractor_version,
          extractedAt,
          evidenceQuality: row.evidence_quality,
          observedFamilyCount: row.observed_family_count,
          featureVector: row.feature_vector,
          featureStatus: row.feature_status,
          featureVectorHash: row.feature_vector_hash,
        });
      }
    });
  }

  async countFeatures(): Promise<number> {
    const rows = await this.db
      .select({ eventId: clickQualityEventFeatures.eventId })
      .from(clickQualityEventFeatures);
    return rows.length;
  }

  async listHashes(): Promise<Array<{ eventId: string; featureVectorHash: string }>> {
    return this.db
      .select({
        eventId: clickQualityEventFeatures.eventId,
        featureVectorHash: clickQualityEventFeatures.featureVectorHash,
      })
      .from(clickQualityEventFeatures);
  }
}
