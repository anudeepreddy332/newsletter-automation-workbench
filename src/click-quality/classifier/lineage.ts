import type { ThresholdSet } from "@/src/click-quality/classifier/thresholds";
import type { Classification } from "@/src/click-quality/classifier/types";
import { CLASSIFIER_VERSION } from "@/src/click-quality/classifier/versions";
import { ClickQualityClassificationLineageError } from "@/src/click-quality/errors";

function failLineage(eventId: string, detail: string): never {
  throw new ClickQualityClassificationLineageError(
    `Classification lineage mismatch for ${eventId}: ${detail}. The batch was not saved.`,
  );
}

export function assertClassificationLineage(thresholdSet: ThresholdSet, row: Classification): void {
  if (row.classifier_version !== CLASSIFIER_VERSION) {
    failLineage(
      row.event_id,
      `classifier_version ${row.classifier_version} does not match CLASSIFIER_VERSION ${CLASSIFIER_VERSION}`,
    );
  }
  if (row.classifier_version !== thresholdSet.classifier_version) {
    failLineage(
      row.event_id,
      `classifier_version ${row.classifier_version} does not match threshold set ${thresholdSet.classifier_version}`,
    );
  }
  if (row.threshold_set_id !== thresholdSet.threshold_set_id) {
    failLineage(
      row.event_id,
      `threshold_set_id ${row.threshold_set_id} does not match supplied ${thresholdSet.threshold_set_id}`,
    );
  }
  if (row.evidence_report.classifier_version !== row.classifier_version) {
    failLineage(
      row.event_id,
      `evidence_report.classifier_version ${row.evidence_report.classifier_version} does not match row ${row.classifier_version}`,
    );
  }
  if (row.evidence_report.threshold_set_id !== row.threshold_set_id) {
    failLineage(
      row.event_id,
      `evidence_report.threshold_set_id ${row.evidence_report.threshold_set_id} does not match row ${row.threshold_set_id}`,
    );
  }
}

export function assertClassificationBatchLineage(
  thresholdSet: ThresholdSet,
  batch: readonly Classification[],
): void {
  for (const row of batch) {
    assertClassificationLineage(thresholdSet, row);
  }
}
