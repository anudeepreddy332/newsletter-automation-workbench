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
          <h2 id="review-heading">4. Review and approve</h2>
          <p>Review the exact generated newsletter. Approval applies only to this snapshot.</p>
        </div>
      </div>

      {generatedNewsletter ? (
        <div className="generated-newsletter" aria-live="polite">
          {!generatedNewsletterIsCurrent ? (
            <p className="stale-banner" role="status">
              This generated newsletter is out of date. Generate again before approving.
            </p>
          ) : approvalIsCurrent ? (
            <p className="preparation-summary" role="status">
              <strong>This exact newsletter is approved and eligible to stage.</strong>
            </p>
          ) : (
            <p className="preparation-hint review-hint">
              Review the subject, preheader, HTML preview, and plain text, then approve this exact
              newsletter.
            </p>
          )}

          <p className="approval-status" role="status">
            Status: {approvalIsCurrent ? "Approved" : "Not approved"}
          </p>

          <dl className="generated-meta">
            <div>
              <dt>Subject</dt>
              <dd>{generatedNewsletter.subject}</dd>
            </div>
            <div>
              <dt>Preheader</dt>
              <dd>{generatedNewsletter.preheader}</dd>
            </div>
          </dl>

          <div className="newsletter-preview-frame">
            <h3>Preview</h3>
            <iframe
              className="newsletter-frame"
              title="Generated newsletter preview"
              sandbox=""
              srcDoc={generatedNewsletter.html}
            />
          </div>

          <details className="generated-evidence">
            <summary>HTML</summary>
            <pre>{generatedNewsletter.html}</pre>
          </details>
          <details className="generated-evidence">
            <summary>Plain text</summary>
            <pre>{generatedNewsletter.plainText}</pre>
          </details>
        </div>
      ) : (
        <div className="empty-state">
          <h3>No newsletter to review yet</h3>
          <p>Generate a newsletter first, then review the exact HTML and plain text here.</p>
        </div>
      )}

      <form action={approveNewsletter}>
        <button className="button button-primary prepare-button" type="submit" disabled={!canApprove}>
          Approve newsletter
        </button>
      </form>
      <p className="preparation-hint">
        {canApprove
          ? "Records a human approval of this exact generated newsletter. Nothing is staged yet."
          : approvalIsCurrent
            ? "This exact newsletter is already approved."
            : "A current generated newsletter is required before approval."}
      </p>
    </section>
  );
}
