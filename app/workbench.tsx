import { fetchLatestStories, publishSelectedStories } from "@/app/actions";
import { GeneratedNewsletterPanel } from "@/app/generated-newsletter";
import { LayoutWorkspace } from "@/app/layout-workspace";
import { OfferPicker } from "@/app/offer-picker";
import { ReviewApprovePanel } from "@/app/review-approve";
import { StageIterablePanel } from "@/app/stage-iterable";
import { StoryPicker } from "@/app/story-picker";
import type { WorkbenchState } from "@/src/domain/workbench";
import type { PublishingResult } from "@/src/publishing/content-publisher";

type WorkbenchProps = {
  state: WorkbenchState;
};

function providerLabel(provider: string): string {
  return provider === "MockWordPress" ? "Mock WordPress" : provider;
}

function resultStatusLabel(result: PublishingResult): string {
  if (result.status === "published") {
    return result.mode === "real" ? "Published" : "Ready";
  }
  if (result.status === "unknown") {
    return "Unknown";
  }
  return "Failed";
}

function resultStatusClass(result: PublishingResult): string {
  if (result.status === "published") {
    return "is-ready";
  }
  if (result.status === "unknown") {
    return "is-unknown";
  }
  return "is-failed";
}

function isClickableRealUrl(result: Extract<PublishingResult, { status: "published" }>): boolean {
  return result.mode === "real" && /^https:\/\//i.test(result.url);
}

function PublishingResultCard({ result }: { result: PublishingResult }) {
  return (
    <div className="result-details">
      <div className="result-status-row">
        <span className={`status-badge ${resultStatusClass(result)}`}>
          <span className="status-dot" aria-hidden="true" />
          {resultStatusLabel(result)}
        </span>
        <span className="provider-label">
          {result.mode === "real" ? "REAL" : "MOCK"} · {providerLabel(result.provider)}
          {result.mode === "real" ? "" : " · Mock mode"}
        </span>
      </div>
      {result.status === "published" ? (
        <dl className="result-metadata">
          <div>
            <dt>Post ID</dt>
            <dd><code>{result.externalPostId}</code></dd>
          </div>
          <div>
            <dt>{result.mode === "real" ? "URL" : "Mock URL"}</dt>
            <dd>
              {isClickableRealUrl(result) ? (
                <a
                  className="result-url-link"
                  href={result.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {result.url}
                </a>
              ) : (
                <code>{result.url}</code>
              )}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="result-diagnostic">{result.diagnostic}</p>
      )}
    </div>
  );
}

export function Workbench({ state }: WorkbenchProps) {
  const selectedStoryIds = state.draft.selectedStories.map((story) => story.id);
  const selectedOfferIds = state.draft.selectedOffers.map((offer) => offer.id);
  const selectedCount = state.draft.selectedStories.length;
  const availableCount = state.availableStories.length;
  const canGenerate = selectedCount > 0;
  const canPublishReal = state.realWordPressConfigured && selectedCount === 1;
  const mockPublishedCount = state.publishingResults.filter(
    (result) => result.mode === "mock" && result.status === "published",
  ).length;
  const realPublishedCount = state.publishingResults.filter(
    (result) => result.mode === "real" && result.status === "published",
  ).length;
  const hasPreparationResults = state.publishingResults.length > 0;
  const preparedStoryLabel = mockPublishedCount === 1 ? "story" : "stories";
  const mockSummary = mockPublishedCount === selectedCount
    ? `${mockPublishedCount} ${preparedStoryLabel} prepared in the Mock WordPress test environment.`
    : `${mockPublishedCount} of ${selectedCount} stories prepared in the Mock WordPress test environment.`;

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-mark" aria-hidden="true">NB</div>
        <div className="header-copy">
          <h1>Newsletter Builder</h1>
          <p className="header-description">
            Fetch stories, choose stories and advertiser links, arrange the newsletter, generate a
            preview, then review, approve, and stage it.
          </p>
        </div>
        <div className="saved-indicator">
          <span className="saved-dot" aria-hidden="true" />
          Draft saved automatically
        </div>
      </header>

      <div className="workbench-surface">
        <div className="workflow-stack">
          <section className="workflow-panel fetch-panel" aria-labelledby="fetch-stories-heading">
            <div className="panel-heading">
              <div>
                <h2 id="fetch-stories-heading">1. Fetch stories</h2>
                <p>
                  Read the local sample story fixture into this workbench. This is not a live feed
                  and does not schedule updates.
                </p>
              </div>
            </div>
            <form action={fetchLatestStories}>
              <button className="button button-primary prepare-button" type="submit">
                Fetch latest stories
              </button>
            </form>
            <p className="preparation-hint">
              {availableCount === 0
                ? "No stories are available yet. Fetch latest stories to load the local sample fixture."
                : `${availableCount} ${availableCount === 1 ? "story is" : "stories are"} available. Fetch again to refresh the source without removing existing stories.`}
            </p>
          </section>

          <section className="workflow-panel story-selection-panel" aria-labelledby="story-picker-heading">
            <div className="panel-heading">
              <div>
                <h2 id="story-picker-heading">2. Choose stories</h2>
                <p>Select one or more available stories and add them to the newsletter.</p>
              </div>
            </div>
            <StoryPicker
              stories={state.availableStories}
              selectedStoryIds={selectedStoryIds}
            />
          </section>

          <section className="workflow-panel offer-selection-panel" aria-labelledby="offer-picker-heading">
            <div className="panel-heading">
              <div>
                <h2 id="offer-picker-heading">3. Choose advertiser links</h2>
                <p>Select one or more sample advertiser offers to include with this newsletter.</p>
              </div>
            </div>
            <p className="sample-offers-note">Sample advertiser offers are used in this prototype.</p>
            <OfferPicker
              offers={state.availableOffers}
              selectedOfferIds={selectedOfferIds}
            />
          </section>

          <section
            id="arrange-newsletter"
            className="workflow-panel selected-panel arrange-panel"
            aria-labelledby="arrange-heading"
          >
            <div className="panel-heading">
              <div>
                <h2 id="arrange-heading">4. Arrange newsletter</h2>
                <p>
                  Drag any block above or below any other block. This order is the exact newsletter
                  render order.
                </p>
              </div>
            </div>
            <LayoutWorkspace blocks={state.draft.layout} />
          </section>

          <GeneratedNewsletterPanel
            canGenerate={canGenerate}
            generatedNewsletter={state.generatedNewsletter}
            generatedNewsletterIsCurrent={state.generatedNewsletterIsCurrent}
          />

          <ReviewApprovePanel
            canApprove={
              state.generatedNewsletter !== null &&
              state.generatedNewsletterIsCurrent &&
              selectedCount > 0 &&
              !state.approvalIsCurrent
            }
            approvalIsCurrent={state.approvalIsCurrent}
            generatedNewsletter={state.generatedNewsletter}
            generatedNewsletterIsCurrent={state.generatedNewsletterIsCurrent}
          />

          <StageIterablePanel
            canStage={state.approvalIsCurrent}
            stagingReceipt={state.stagingReceipt}
          />

          <details className="workflow-panel wordpress-evidence">
            <summary>
              <span className="wordpress-evidence-title">WordPress test evidence</span>
              <span className="wordpress-evidence-copy">Optional publishing test details</span>
            </summary>

            <p className="preparation-hint wordpress-evidence-note">
              WordPress resolves or publishes story pages only. It does not publish the finished
              newsletter.
            </p>

            <div className="publishing-mode">
              <div>
                <span className="mode-label">Default test environment</span>
                <strong>Mock WordPress</strong>
              </div>
              <span className="mock-badge">MOCK</span>
            </div>

            <form action={publishSelectedStories}>
              <input type="hidden" name="mode" value="mock" />
              <button className="button button-quiet prepare-button" type="submit" disabled={!canGenerate}>
                Prepare selected stories
              </button>
            </form>
            <p className="preparation-hint">
              {canGenerate
                ? "Optional. Generate newsletter already creates mock story-page results when needed. Nothing is published externally."
                : "Add at least one story to inspect mock WordPress results."}
            </p>

            <div className={`publishing-mode real-mode${state.realWordPressConfigured ? "" : " is-disabled"}`}>
              <div>
                <span className="mode-label">Optional live integration</span>
                <strong>REAL WORDPRESS.COM TEST SITE</strong>
              </div>
              <span className="real-badge">{state.realWordPressConfigured ? "REAL" : "DISABLED"}</span>
            </div>

            <form action={publishSelectedStories}>
              <input type="hidden" name="mode" value="real" />
              <button
                className="button button-real prepare-button"
                type="submit"
                disabled={!canPublishReal}
              >
                Publish one story to the real test site
              </button>
            </form>
            <p className="preparation-hint">
              {!state.realWordPressConfigured
                ? "Unavailable until server-side WordPress.com credentials are configured. No site or token fields are accepted in the browser."
                : selectedCount === 1
                  ? "Publishes exactly one selected fictional fixture story to the configured disposable WordPress.com test site."
                  : "Select exactly one story before using the real WordPress.com test site."}
            </p>

            {hasPreparationResults ? (
              <p className="preparation-summary" role="status">
                <strong>{mockSummary}</strong>
                {realPublishedCount > 0 ? (
                  <span>
                    {realPublishedCount === 1
                      ? "1 real WordPress.com test post is recorded."
                      : `${realPublishedCount} real WordPress.com test posts are recorded.`}
                  </span>
                ) : (
                  <span>Nothing was published externally unless a REAL result is shown below.</span>
                )}
              </p>
            ) : null}

            {selectedCount > 0 ? (
              <div className="publishing-results" aria-live="polite">
                <div className="results-heading">
                  <h3>Result</h3>
                  <span>{mockPublishedCount} of {selectedCount} mock ready</span>
                </div>
                <ul className="result-list">
                  {state.draft.selectedStories.map((story) => {
                    const storyResults = state.publishingResults.filter(
                      (result) => result.sourceStoryId === story.id,
                    );
                    return (
                      <li key={story.id} className="result-card">
                        <h4>{story.title}</h4>
                        {storyResults.length > 0 ? (
                          storyResults.map((result) => (
                            <PublishingResultCard
                              key={`${result.provider}-${result.mode}`}
                              result={result}
                            />
                          ))
                        ) : (
                          <p className="waiting-status">
                            <span className="status-dot" aria-hidden="true" />
                            Waiting to be prepared
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </details>
        </div>
      </div>

      <footer className="app-footer">
        Sample content is used in this prototype.
      </footer>
    </main>
  );
}
