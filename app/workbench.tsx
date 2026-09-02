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

function PublishingResultCard({ result }: { result: PublishingResult }) {
  return (
    <div className="result-details">
      <div className="result-status-row">
        <span className={`status-badge ${result.status === "published" ? "is-ready" : "is-failed"}`}>
          <span className="status-dot" aria-hidden="true" />
          {result.status === "published" ? "Ready" : "Failed"}
        </span>
        <span className="provider-label">{providerLabel(result.provider)} · Mock mode</span>
      </div>
      {result.status === "published" ? (
        <dl className="result-metadata">
          <div>
            <dt>Post ID</dt>
            <dd><code>{result.externalPostId}</code></dd>
          </div>
          <div>
            <dt>Mock URL</dt>
            <dd><code>{result.url}</code></dd>
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
  const publishingResultsByStoryId = new Map(
    state.publishingResults.map((result) => [result.sourceStoryId, result]),
  );
  const readyResults = state.publishingResults.filter(
    (result) => result.status === "published",
  ).length;
  const selectedCount = state.draft.selectedStories.length;
  const hasPreparationResults = state.publishingResults.length > 0;
  const canPrepare = selectedCount > 0;
  const preparedStoryLabel = readyResults === 1 ? "story" : "stories";
  const preparationSummary = readyResults === selectedCount
    ? `${readyResults} ${preparedStoryLabel} prepared in the Mock WordPress test environment.`
    : `${readyResults} of ${selectedCount} stories prepared in the Mock WordPress test environment.`;

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
                <h2 id="preparation-heading">Mock WordPress test evidence</h2>
                <p>Prepare local test results for the stories added above.</p>
              </div>
            </div>

            <div className="publishing-mode">
              <div>
                <span className="mode-label">Test environment</span>
                <strong>Mock WordPress</strong>
              </div>
              <span className="mock-badge">MOCK</span>
            </div>

            <form action={publishSelectedStories}>
              <button className="button button-primary prepare-button" type="submit" disabled={!canPrepare}>
                Prepare selected stories
              </button>
            </form>
            <p className="preparation-hint">
              {canPrepare
                ? "Creates test results only. Nothing is published externally."
                : "Add at least one story to continue."}
            </p>

            {hasPreparationResults ? (
              <p className="preparation-summary" role="status">
                <strong>{preparationSummary}</strong>
                <span>Nothing was published externally.</span>
              </p>
            ) : null}

            {selectedCount > 0 ? (
              <div className="publishing-results" aria-live="polite">
                <div className="results-heading">
                  <h3>Result</h3>
                  <span>{readyResults} of {selectedCount} ready</span>
                </div>
                <ul className="result-list">
                  {state.draft.selectedStories.map((story) => {
                    const result = publishingResultsByStoryId.get(story.id);
                    return (
                      <li key={story.id} className="result-card">
                        <h4>{story.title}</h4>
                        {result ? (
                          <PublishingResultCard result={result} />
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
