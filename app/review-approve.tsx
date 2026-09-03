import { approveNewsletter } from "@/app/actions";
import type { GeneratedNewsletter } from "@/src/domain/newsletter";

type ReviewApprovePanelProps = {
  canApprove: boolean;
  approvalIsCurrent: boolean;
  generatedNewsletter: GeneratedNewsletter | null;
  generatedNewsletterIsCurrent: boolean;
};

export function ReviewApprovePanel({
  canApprove,
  approvalIsCurrent,
  generatedNewsletter,
  generatedNewsletterIsCurrent,
}: ReviewApprovePanelProps) {
  return (
    <section className="workflow-panel review-panel" aria-labelledby="review-heading">
      <div className="panel-heading">
        <div>
          <h2 id="review-heading">6. Review and approve</h2>
          <p>Approval applies only to the exact preview immediately above.</p>
        </div>
      </div>

      {generatedNewsletter ? (
        <div aria-live="polite">
          <p className="approval-status" role="status">
            {approvalIsCurrent ? "Approved" : "Not approved"}
          </p>
          {generatedNewsletterIsCurrent ? (
            <p className="preparation-hint review-hint">
              Approval records a human review of the exact current preview, including its subject,
              preheader, HTML, and plain text.
            </p>
          ) : (
            <p className="stale-banner" role="status">
              The preview above is out of date. Generate again before approving.
            </p>
          )}
        </div>
      ) : (
        <div className="empty-state">
          <h3>No newsletter to approve yet</h3>
          <p>Generate a current preview first, then approve that exact snapshot here.</p>
        </div>
      )}

      <form action={approveNewsletter}>
        <button className="button button-primary prepare-button" type="submit" disabled={!canApprove}>
          Approve newsletter
        </button>
      </form>
      <p className="preparation-hint">
        {canApprove
          ? "Records a human approval of the exact preview above. Nothing is staged yet."
          : approvalIsCurrent
            ? "This exact newsletter is already approved."
            : "A current generated newsletter is required before approval."}
      </p>
    </section>
  );
}
