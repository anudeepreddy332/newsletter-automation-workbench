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
        generatedNewsletterIsCurrent ? (
          <p className="preparation-summary" role="status">
            <strong>A current newsletter is ready to review.</strong>
          </p>
        ) : (
          <p className="stale-banner" role="status">
            This generated newsletter is out of date. Generate again from the current stories and
            advertiser links.
          </p>
        )
      ) : null}
    </section>
  );
}
