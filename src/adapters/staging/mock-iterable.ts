import { createHash } from "node:crypto";

import { isApprovedSnapshotConsistent } from "@/src/newsletter/fingerprint";
import {
  NewsletterStagingError,
  type NewsletterStager,
  type StagingHandoff,
  type StagingResult,
} from "@/src/staging/newsletter-stager";

export const MOCK_ITERABLE_PROVIDER = "MockIterable";

export class MockIterable implements NewsletterStager {
  readonly provider = MOCK_ITERABLE_PROVIDER;

  stage(handoff: StagingHandoff): StagingResult {
    if (!isApprovedSnapshotConsistent(handoff.approvedSnapshot)) {
      throw new NewsletterStagingError(
        "INCONSISTENT_SNAPSHOT",
        "Mock Iterable can only stage a consistent approved newsletter snapshot.",
      );
    }

    return {
      provider: MOCK_ITERABLE_PROVIDER,
      status: "staged",
      externalDraftId: this.draftIdFor(handoff),
      approvalFingerprint: handoff.approvedSnapshot.approvalFingerprint,
    };
  }

  private draftIdFor(handoff: StagingHandoff): string {
    return `mock_iterable_draft_${createHash("sha256")
      .update(
        [
          handoff.approvedSnapshot.draftId,
          handoff.approvedSnapshot.approvalFingerprint,
          handoff.wordpressPostId,
          handoff.wordpressUrl,
          handoff.wordpressApprovalFingerprint,
        ].join("\n"),
      )
      .digest("hex")
      .slice(0, 16)}`;
  }
}