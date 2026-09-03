import { stageApprovedNewsletter } from "@/app/actions";
import type { StagingResult } from "@/src/staging/newsletter-stager";

type StageIterablePanelProps = {
  canStage: boolean;
  stagingReceipt: StagingResult | null;
};

function shortApprovalEvidence(fingerprint: string): string {
  return fingerprint.slice(0, 12);
}

export function StageIterablePanel({
  canStage,
  stagingReceipt,
}: StageIterablePanelProps) {
  return (
    <section className="workflow-panel stage-panel" aria-labelledby="stage-heading">
      <div className="panel-heading">
        <div>
          <h2 id="stage-heading">7. Stage to Iterable</h2>
          <p>
            Mock Iterable only. This creates or prepares a mock draft. This does not send email.
          </p>
        </div>
      </div>

      <form action={stageApprovedNewsletter}>
        <button className="button button-primary prepare-button" type="submit" disabled={!canStage}>
          Stage approved newsletter
        </button>
      </form>
      <p className="preparation-hint">
        {canStage
          ? "Prepares a mock Iterable draft from the approved snapshot. This does not send email."
          : "Approve the current newsletter before staging."}
      </p>

      {stagingReceipt ? (
        <div className="staging-receipt" aria-live="polite" role="status">
          <div className="result-status-row">
            <span className="status-badge is-ready">
              <span className="status-dot" aria-hidden="true" />
              Staged
            </span>
            <span className="provider-label">MOCK · Mock Iterable</span>
          </div>
          <dl className="result-metadata">
            <div>
              <dt>Draft ID</dt>
              <dd><code>{stagingReceipt.externalDraftId}</code></dd>
            </div>
            <div>
              <dt>Approved newsletter</dt>
              <dd><code>{shortApprovalEvidence(stagingReceipt.approvalFingerprint)}</code></dd>
            </div>
          </dl>
        </div>
      ) : null}
    </section>
  );
}
