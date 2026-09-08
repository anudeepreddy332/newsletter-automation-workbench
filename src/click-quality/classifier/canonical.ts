import type { Classification, EvidenceReport, FamilyScore } from "@/src/click-quality/classifier/types";
import { FAMILY_IDS } from "@/src/click-quality/classifier/versions";

function familyJson(score: FamilyScore): string {
  const autoWinners = `[${score.auto_winning_features.map((key) => JSON.stringify(key)).join(",")}]`;
  const humanWinners = `[${score.human_winning_features.map((key) => JSON.stringify(key)).join(",")}]`;
  return `{"auto_contribution":${score.auto_contribution},"auto_winning_features":${autoWinners},"human_contribution":${score.human_contribution},"human_winning_features":${humanWinners}}`;
}

export function canonicalEvidenceReportJson(report: EvidenceReport): string {
  const families = `{${FAMILY_IDS.map((id) => `${JSON.stringify(id)}:${familyJson(report.families[id])}`).join(",")}}`;
  return `{${[
    `"auto_family_count":${report.auto_family_count}`,
    `"classifier_version":${JSON.stringify(report.classifier_version)}`,
    `"extractor_version":${JSON.stringify(report.extractor_version)}`,
    `"families":${families}`,
    `"feature_schema_version":${JSON.stringify(report.feature_schema_version)}`,
    `"feature_vector_hash":${JSON.stringify(report.feature_vector_hash)}`,
    `"threshold_set_id":${JSON.stringify(report.threshold_set_id)}`,
  ].join(",")}}`;
}

export function classificationIdentityJson(row: Classification): string {
  return `{${[
    `"auto_score":${row.auto_score}`,
    `"conflict":${row.conflict}`,
    `"decision":${JSON.stringify(row.decision)}`,
    `"evidence_report":${canonicalEvidenceReportJson(row.evidence_report)}`,
    `"human_score":${row.human_score}`,
    `"reason_codes":[${row.reason_codes.map((code) => JSON.stringify(code)).join(",")}]`,
  ].join(",")}}`;
}

export function sameClassification(left: Classification, right: Classification): boolean {
  return classificationIdentityJson(left) === classificationIdentityJson(right);
}
