import { createHash } from "node:crypto";

import type { ApprovedNewsletterIdentity, ApprovedNewsletterSnapshot } from "@/src/domain/approval";
import type { GeneratedNewsletter, NewsletterAssemblyInput } from "@/src/domain/newsletter";

export function fingerprintNewsletterInput(input: NewsletterAssemblyInput): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export function fingerprintApprovedNewsletter(identity: ApprovedNewsletterIdentity): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        generatedInputFingerprint: identity.generatedInputFingerprint,
        subject: identity.subject,
        preheader: identity.preheader,
        html: identity.html,
        plainText: identity.plainText,
      }),
    )
    .digest("hex");
}

export function approvedSnapshotFromGenerated(
  draftId: string,
  generated: GeneratedNewsletter,
): ApprovedNewsletterSnapshot {
  const identity: ApprovedNewsletterIdentity = {
    generatedInputFingerprint: generated.inputFingerprint,
    subject: generated.subject,
    preheader: generated.preheader,
    html: generated.html,
    plainText: generated.plainText,
  };

  return {
    draftId,
    approvalFingerprint: fingerprintApprovedNewsletter(identity),
    ...identity,
  };
}

export function isApprovedSnapshotConsistent(snapshot: ApprovedNewsletterSnapshot): boolean {
  return (
    snapshot.approvalFingerprint ===
    fingerprintApprovedNewsletter({
      generatedInputFingerprint: snapshot.generatedInputFingerprint,
      subject: snapshot.subject,
      preheader: snapshot.preheader,
      html: snapshot.html,
      plainText: snapshot.plainText,
    })
  );
}

export function isCurrentApproval(
  generated: GeneratedNewsletter | null,
  generatedIsCurrent: boolean,
  approval: ApprovedNewsletterSnapshot | null,
): boolean {
  if (!generated || !generatedIsCurrent || !approval || !isApprovedSnapshotConsistent(approval)) {
    return false;
  }

  const expected = approvedSnapshotFromGenerated(approval.draftId, generated);
  return (
    approval.approvalFingerprint === expected.approvalFingerprint &&
    approval.generatedInputFingerprint === generated.inputFingerprint &&
    approval.subject === generated.subject &&
    approval.preheader === generated.preheader &&
    approval.html === generated.html &&
    approval.plainText === generated.plainText
  );
}
