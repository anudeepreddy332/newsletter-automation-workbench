import { generateNewsletter } from "@/app/actions";
import type { GeneratedNewsletter } from "@/src/domain/newsletter";

type GeneratedNewsletterPanelProps = {
  canGenerate: boolean;
  generatedNewsletter: GeneratedNewsletter | null;
  generatedNewsletterIsCurrent: boolean;
};

export function GeneratedNewsletterPanel({
  canGenerate,
  generatedNewsletter,
  generatedNewsletterIsCurrent,
}: GeneratedNewsletterPanelProps) {
  return (
    <section className="workflow-panel generate-panel" aria-labelledby="generate-heading">
      <div className="panel-heading">
        <div>
          <h2 id="generate-heading">5. Generate and preview</h2>
          <p>
            Generate the newsletter from the current layout. Story pages are resolved through Mock
            WordPress automatically.
          </p>
        </div>
      </div>

      <form action={generateNewsletter}>
        <button className="button button-primary prepare-button" type="submit" disabled={!canGenerate}>
          Generate newsletter
        </button>
      </form>
      <p className="preparation-hint">
        {canGenerate
          ? "Creates HTML and plain text from the exact current layout. Advertiser links are optional."
          : "Add at least one story block to generate a newsletter."}
      </p>

      {generatedNewsletter ? (
        <div className="generated-newsletter" aria-live="polite">
          {generatedNewsletterIsCurrent ? (
            <p className="preparation-summary" role="status">
              <strong>Current preview</strong>
              This preview matches the current layout and is ready to review.
            </p>
          ) : (
            <p className="stale-banner" role="status">
              Stale preview. Generate again from the current layout before continuing.
            </p>
          )}

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
            <summary>Plain text</summary>
            <pre>{generatedNewsletter.plainText}</pre>
          </details>

          <a className="button button-quiet edit-layout-link" href="#arrange-newsletter">
            Edit layout
          </a>
        </div>
      ) : null}
    </section>
  );
}
