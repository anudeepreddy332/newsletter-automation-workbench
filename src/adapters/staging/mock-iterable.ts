import { createHash } from "node:crypto";

import type { ApprovedNewsletterSnapshot } from "@/src/domain/approval";
import { isApprovedSnapshotConsistent } from "@/src/newsletter/fingerprint";
import {
  NewsletterStagingError,
  type NewsletterStager,
  type StagingResult,
} from "@/src/staging/newsletter-stager";

export const MOCK_ITERABLE_PROVIDER = "MockIterable";

export class MockIterable implements NewsletterStager {
  readonly provider = MOCK_ITERABLE_PROVIDER;

  stage(approvedSnapshot: ApprovedNewsletterSnapshot): StagingResult {
    if (!isApprovedSnapshotConsistent(approvedSnapshot)) {
      throw new NewsletterStagingError(
        "INCONSISTENT_SNAPSHOT",
        "Mock Iterable can only stage a consistent approved newsletter snapshot.",
      );
    }

    return {
      provider: MOCK_ITERABLE_PROVIDER,
      status: "staged",
      externalDraftId: this.draftIdFor(approvedSnapshot),
      approvalFingerprint: approvedSnapshot.approvalFingerprint,
    };
  }

  private draftIdFor(approvedSnapshot: ApprovedNewsletterSnapshot): string {
    return `mock_iterable_draft_${createHash("sha256")
      .update(`${approvedSnapshot.draftId}\n${approvedSnapshot.approvalFingerprint}`)
      .digest("hex")
      .slice(0, 16)}`;
  }
}