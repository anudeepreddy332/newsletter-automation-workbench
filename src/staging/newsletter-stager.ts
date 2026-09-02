import type { ApprovedNewsletterSnapshot } from "@/src/domain/approval";

export type StagingResult = {
  provider: string;
  status: "staged";
  externalDraftId: string;
  approvalFingerprint: string;
};

export interface NewsletterStager {
  readonly provider: string;
  stage(approvedSnapshot: ApprovedNewsletterSnapshot): StagingResult;
}

export class NewsletterStagingError extends Error {
  constructor(
    readonly code: "INCONSISTENT_SNAPSHOT",
    message: string,
  ) {
    super(message);
    this.name = "NewsletterStagingError";
  }
}