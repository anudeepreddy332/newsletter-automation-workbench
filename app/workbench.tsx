import { publishSelectedStories, removeStory } from "@/app/actions";
import { StoryPicker } from "@/app/story-picker";
import { formatStoryTimestamp } from "@/app/story-presentation";
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
  const selectedCount = state.draft.selectedStories.length;
  const canPrepare = selectedCount > 0;
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
            Review and choose the stories to include in this newsletter.
          </p>
        </div>
        <div className="saved-indicator">
          <span className="saved-dot" aria-hidden="true" />
          Draft saved automatically
        </div>
      </header>

      <div className="workbench-surface">
        <div className="workflow-stack">
          <section className="workflow-panel story-selection-panel" aria-labelledby="story-picker-heading">
            <div className="panel-heading">
              <div>
                <h2 id="story-picker-heading">1. Choose stories</h2>
                <p>Select a story to inspect, read, and add to the newsletter.</p>
              </div>
            </div>
            <StoryPicker
              stories={state.availableStories}
              selectedStoryIds={selectedStoryIds}
            />
          </section>

          <section className="workflow-panel selected-panel" aria-labelledby="selected-stories-heading">
            <div className="panel-heading panel-heading-with-count">
              <div>
                <h2 id="selected-stories-heading">Stories added</h2>
                <p>These are the stories you have added to this newsletter.</p>
              </div>
              <span
                className="story-count"
                aria-label={`${selectedCount} ${selectedCount === 1 ? "story" : "stories"} added`}
              >
                {selectedCount}
              </span>
            </div>

            {selectedCount === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon" aria-hidden="true">+</div>
                <h3>No stories added yet</h3>
                <p>Choose a story above and add it to the newsletter.</p>
              </div>
            ) : (
              <ol className="selected-story-list">
                {state.draft.selectedStories.map((story, index) => (
                  <li key={story.id} className="selected-story-item">
                    <span className="story-position" aria-hidden="true">{index + 1}</span>
                    <div className="selected-story-copy">
                      <h3>{story.title}</h3>
                      <p>{formatStoryTimestamp(story.publishedAt)}</p>
                    </div>
                    <form className="selected-story-actions" action={removeStory}>
                      <input type="hidden" name="storyId" value={story.id} />
                      <button
                        className="small-button remove-button"
                        type="submit"
                        aria-label={`Remove ${story.title} from newsletter`}
                      >
                        Remove
                      </button>
                    </form>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="workflow-panel preparation-panel" aria-labelledby="preparation-heading">
            <div className="panel-heading">
              <div>
                <h2 id="preparation-heading">WordPress test evidence</h2>
                <p>Prepare local mock results, or optionally publish one story to a disposable WordPress.com test site.</p>
              </div>
            </div>

            <div className="publishing-mode">
              <div>
                <span className="mode-label">Default test environment</span>
                <strong>Mock WordPress</strong>
              </div>
              <span className="mock-badge">MOCK</span>
            </div>

            <form action={publishSelectedStories}>
              <input type="hidden" name="mode" value="mock" />
              <button className="button button-primary prepare-button" type="submit" disabled={!canPrepare}>
                Prepare selected stories
              </button>
            </form>
            <p className="preparation-hint">
              {canPrepare
                ? "Creates test results only. Nothing is published externally."
                : "Add at least one story to continue."}
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
          </section>
        </div>
      </div>

      <footer className="app-footer">
        Sample content is used in this prototype.
      </footer>
    </main>
  );
}
