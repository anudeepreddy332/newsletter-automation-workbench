import { and, eq } from "drizzle-orm";

import { sameClassification } from "@/src/click-quality/classifier/canonical";
import {
  assertThresholdSetCompatible,
  sameThresholdSet,
  type ThresholdSet,
} from "@/src/click-quality/classifier/thresholds";
import type { Classification, EvidenceReport } from "@/src/click-quality/classifier/types";
import type { Decision, ReasonCode } from "@/src/click-quality/classifier/versions";
import {
  ClickQualityClassificationConflictError,
  ClickQualityThresholdConflictError,
} from "@/src/click-quality/errors";
import type { ClickQualityDatabase } from "@/src/click-quality/postgres/database";
import {
  clickQualityClassifications,
  clickQualityThresholdSets,
} from "@/src/click-quality/postgres/schema";

type ClassificationRow = typeof clickQualityClassifications.$inferSelect;
type ThresholdRow = typeof clickQualityThresholdSets.$inferSelect;

function rowToThreshold(row: ThresholdRow): ThresholdSet {
  return {
    threshold_set_id: row.thresholdSetId,
    status: row.status,
    classifier_version: row.classifierVersion,
    config: row.config as ThresholdSet["config"],
    notes: row.notes,
  };
}

function rowToClassification(row: ClassificationRow): Classification {
  return {
    event_id: row.eventId,
    classifier_version: row.classifierVersion,
    threshold_set_id: row.thresholdSetId,
    decision: row.decision as Decision,
    auto_score: row.autoScore,
    human_score: row.humanScore,
    conflict: row.conflict,
    reason_codes: row.reasonCodes as ReasonCode[],
    evidence_report: row.evidenceReport as EvidenceReport,
  };
}

export class ClickQualityClassificationRepository {
  constructor(private readonly db: ClickQualityDatabase) {}

  async saveClassifiedBatch(
    thresholdSet: ThresholdSet,
    batch: readonly Classification[],
    classifiedAt: string,
  ): Promise<void> {
    assertThresholdSetCompatible(thresholdSet);
    await this.db.transaction(async (tx) => {
      const [existingThreshold] = await tx
        .select()
        .from(clickQualityThresholdSets)
        .where(eq(clickQualityThresholdSets.thresholdSetId, thresholdSet.threshold_set_id))
        .limit(1);
      if (existingThreshold) {
        if (!sameThresholdSet(rowToThreshold(existingThreshold), thresholdSet)) {
          throw new ClickQualityThresholdConflictError(
            `Click-quality threshold set ${thresholdSet.threshold_set_id} already exists with a different config. The batch was not saved.`,
          );
        }
      } else {
        await tx.insert(clickQualityThresholdSets).values({
          thresholdSetId: thresholdSet.threshold_set_id,
          status: thresholdSet.status,
          classifierVersion: thresholdSet.classifier_version,
          config: thresholdSet.config,
          notes: thresholdSet.notes,
        });
      }

      for (const row of batch) {
        const [existing] = await tx
          .select()
          .from(clickQualityClassifications)
          .where(
            and(
              eq(clickQualityClassifications.eventId, row.event_id),
              eq(clickQualityClassifications.classifierVersion, row.classifier_version),
              eq(clickQualityClassifications.thresholdSetId, row.threshold_set_id),
            ),
          )
          .limit(1);
        if (existing) {
          if (!sameClassification(rowToClassification(existing), row)) {
            throw new ClickQualityClassificationConflictError(
              row.event_id,
              `Click-quality classification conflict for ${row.event_id}: stored decision does not match the current classifier. The batch was not saved.`,
            );
          }
          continue;
        }
        await tx.insert(clickQualityClassifications).values({
          eventId: row.event_id,
          classifierVersion: row.classifier_version,
          thresholdSetId: row.threshold_set_id,
          decision: row.decision,
          autoScore: row.auto_score,
          humanScore: row.human_score,
          conflict: row.conflict,
          reasonCodes: row.reason_codes,
          evidenceReport: row.evidence_report,
          classifiedAt,
        });
      }
    });
  }

  async countClassifications(): Promise<number> {
    const rows = await this.db
      .select({ eventId: clickQualityClassifications.eventId })
      .from(clickQualityClassifications);
    return rows.length;
  }

  async listClassifications(): Promise<Classification[]> {
    const rows = await this.db.select().from(clickQualityClassifications);
    return rows.map(rowToClassification);
  }
}
