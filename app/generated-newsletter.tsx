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
          <h2 id="generate-heading">3. Generate newsletter</h2>
          <p>Assemble the selected stories and advertiser links into a deterministic newsletter.</p>
        </div>
      </div>

      <form action={generateNewsletter}>
        <button className="button button-primary prepare-button" type="submit" disabled={!canGenerate}>
          Generate newsletter
        </button>
      </form>
      <p className="preparation-hint">
        {canGenerate
          ? "Creates HTML and plain text from the current selection. Advertiser links are optional."
          : "Add at least one story to generate a newsletter."}
      </p>

      {generatedNewsletter ? (
        <div className="generated-newsletter" aria-live="polite">
          {!generatedNewsletterIsCurrent ? (
            <p className="stale-banner" role="status">
              This generated newsletter is out of date. Generate again from the current stories and
              advertiser links.
            </p>
          ) : (
            <p className="preparation-summary" role="status">
              <strong>This is the newsletter assembled from what you selected.</strong>
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
            <summary>HTML</summary>
            <pre>{generatedNewsletter.html}</pre>
          </details>
          <details className="generated-evidence">
            <summary>Plain text</summary>
            <pre>{generatedNewsletter.plainText}</pre>
          </details>
        </div>
      ) : null}
    </section>
  );
}
