import { publishApprovedNewsletter } from "@/app/actions";
import type { NewsletterPublication } from "@/src/publishing/newsletter-publisher";

type PublishWordpressPanelProps = {
  wordpressConfigured: boolean;
  approvalIsCurrent: boolean;
  publication: NewsletterPublication | null;
  publicationIsCurrent: boolean;
};

function isHttpsUrl(value: string): boolean {
  return /^https:\/\//i.test(value);
}

export function PublishWordpressPanel({
  wordpressConfigured,
  approvalIsCurrent,
  publication,
  publicationIsCurrent,
}: PublishWordpressPanelProps) {
  const hasLivePost = Boolean(publication?.externalPostId && publication.url);
  const needsUpdate =
    approvalIsCurrent &&
    hasLivePost &&
    publication?.approvalFingerprint !== undefined &&
    !publicationIsCurrent;
  const isUnknown = publication?.status === "unknown";
  const canWrite =
    wordpressConfigured &&
    approvalIsCurrent &&
    !isUnknown &&
    (!hasLivePost || needsUpdate);
  const buttonLabel = needsUpdate ? "Update published newsletter" : "Publish approved newsletter";

  return (
    <section className="workflow-panel publish-panel" aria-labelledby="publish-heading">
      <div className="panel-heading">
        <div>
          <h2 id="publish-heading">7. Publish to WordPress</h2>
          <p>
            Publishes the current approved newsletter as one WordPress.com post. Credentials stay
            on the server.
          </p>
        </div>
      </div>

      <p className="approval-status" role="status">
        WordPress status: {wordpressStatusLabel({
          publication,
          publicationIsCurrent,
          needsUpdate,
          isUnknown,
        })}
      </p>

      <form action={publishApprovedNewsletter}>
        <button
          className="button button-primary prepare-button"
          type="submit"
          disabled={!canWrite}
        >
          {buttonLabel}
        </button>
      </form>
      <p className="preparation-hint">
        {publishHint({
          wordpressConfigured,
          approvalIsCurrent,
          publicationIsCurrent,
          needsUpdate,
          isUnknown,
          canWrite,
        })}
      </p>

      {publication?.status === "failed" && publication.diagnostic ? (
        <p className="result-diagnostic" role="status">
          {publication.diagnostic}
        </p>
      ) : null}

      {isUnknown && publication?.diagnostic ? (
        <p className="result-diagnostic" role="status">
          {publication.diagnostic}
        </p>
      ) : null}

      {publicationIsCurrent && publication?.externalPostId && publication.url ? (
        <div className="staging-receipt" aria-live="polite" role="status">
          <div className="result-status-row">
            <span className="status-badge is-ready">
              <span className="status-dot" aria-hidden="true" />
              Published to WordPress.com
            </span>
          </div>
          <dl className="result-metadata">
            <div>
              <dt>Post ID</dt>
              <dd><code>{publication.externalPostId}</code></dd>
            </div>
          </dl>
          {isHttpsUrl(publication.url) ? (
            <a
              className="button button-quiet result-url-link"
              href={publication.url}
              target="_blank"
              rel="noreferrer"
            >
              View live newsletter
            </a>
          ) : (
            <p className="preparation-hint">The published URL is not a public HTTPS link.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}

function wordpressStatusLabel({
  publication,
  publicationIsCurrent,
  needsUpdate,
  isUnknown,
}: {
  publication: NewsletterPublication | null;
  publicationIsCurrent: boolean;
  needsUpdate: boolean;
  isUnknown: boolean;
}): string {
  if (isUnknown) {
    return "Unknown";
  }
  if (publicationIsCurrent) {
    return "Published to WordPress.com";
  }
  if (needsUpdate) {
    return "Update required";
  }
  if (publication?.status === "failed") {
    return "Not published";
  }
  return "Not published";
}

function publishHint({
  wordpressConfigured,
  approvalIsCurrent,
  publicationIsCurrent,
  needsUpdate,
  isUnknown,
  canWrite,
}: {
  wordpressConfigured: boolean;
  approvalIsCurrent: boolean;
  publicationIsCurrent: boolean;
  needsUpdate: boolean;
  isUnknown: boolean;
  canWrite: boolean;
}): string {
  if (isUnknown) {
    return "The previous WordPress write is unconfirmed. This step will not retry a write automatically.";
  }
  if (!wordpressConfigured) {
    return "Unavailable until server-side WordPress.com credentials are configured. No site or token fields are accepted in the browser.";
  }
  if (publicationIsCurrent) {
    return "This approved newsletter is already published. Publishing again will not create another post.";
  }
  if (needsUpdate) {
    return "Updates the existing WordPress.com post with the newly approved newsletter. This does not create a second post.";
  }
  if (canWrite) {
    return "Creates one WordPress.com post from the approved newsletter snapshot.";
  }
  if (!approvalIsCurrent) {
    return "Generate, review, and approve the current newsletter before publishing.";
  }
  return "A current approved newsletter is required before publishing.";
}
