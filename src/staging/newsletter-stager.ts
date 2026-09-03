import type { ApprovedNewsletterSnapshot } from "@/src/domain/approval";

export type StagingHandoff = {
  approvedSnapshot: ApprovedNewsletterSnapshot;
  wordpressPostId: string;
  wordpressUrl: string;
  wordpressApprovalFingerprint: string;
};

export type StagingResult = {
  provider: string;
  status: "staged";
  externalDraftId: string;
  approvalFingerprint: string;
};

export interface NewsletterStager {
  readonly provider: string;
  stage(handoff: StagingHandoff): StagingResult;
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