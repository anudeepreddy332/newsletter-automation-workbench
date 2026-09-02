import {
  moveStoryDown,
  moveStoryUp,
  publishSelectedStories,
  removeStory,
  selectPublication,
} from "@/app/actions";
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
  const selectedPublication = state.publications.find(
    (publication) => publication.id === state.draft.publicationId,
  );
  const readyResults = state.publishingResults.filter(
    (result) => result.status === "published",
  ).length;
  const canPrepare = Boolean(state.draft.publicationId && state.draft.selectedStories.length > 0);

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-mark" aria-hidden="true">NB</div>
        <div className="header-copy">
          <p className="eyebrow">Operator workbench</p>
          <h1>Newsletter Builder</h1>
          <p className="header-description">
            Choose and organize stories already loaded into the workbench, then prepare them for the next step.
          </p>
        </div>
        <div className="saved-indicator">
          <span className="saved-dot" aria-hidden="true" />
          Draft saved automatically
        </div>
      </header>

      <div className="workbench-surface">
        <div className="workflow-overview" aria-label="Newsletter building workflow">
          <div className={`workflow-stage ${selectedPublication ? "is-complete" : "is-current"}`}>
            <span className="stage-number">1</span>
            <span>Choose newsletter</span>
          </div>
          <span className="stage-line" aria-hidden="true" />
          <div className={`workflow-stage ${selectedStoryIds.length > 0 ? "is-complete" : selectedPublication ? "is-current" : ""}`}>
            <span className="stage-number">2</span>
            <span>Pick stories</span>
          </div>
          <span className="stage-line" aria-hidden="true" />
          <div className={`workflow-stage ${readyResults > 0 ? "is-complete" : selectedStoryIds.length > 0 ? "is-current" : ""}`}>
            <span className="stage-number">3</span>
            <span>Organize</span>
          </div>
          <span className="stage-line" aria-hidden="true" />
          <div className={`workflow-stage ${readyResults > 0 ? "is-current" : ""}`}>
            <span className="stage-number">4</span>
            <span>Prepare</span>
          </div>
        </div>

        <div className="builder-grid">
          <div className="builder-main">
            <section className="workflow-panel" aria-labelledby="publication-heading">
              <div className="panel-heading">
                <span className="panel-step" aria-hidden="true">01</span>
                <div>
                  <h2 id="publication-heading">Choose your newsletter</h2>
                  <p>Select the publication you are building today.</p>
                </div>
              </div>
              <form action={selectPublication} className="publication-form">
                <div className="field-group">
                  <label htmlFor="publicationId">Publication</label>
                  <select
                    id="publicationId"
                    name="publicationId"
                    defaultValue={state.draft.publicationId ?? ""}
                  >
                    <option value="" disabled>Choose a publication</option>
                    {state.publications.map((publication) => (
                      <option key={publication.id} value={publication.id}>
                        {publication.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button className="button button-secondary" type="submit">Save choice</button>
              </form>
              {selectedPublication ? (
                <p className="selection-confirmation">
                  <span aria-hidden="true">✓</span>
                  Building <strong>{selectedPublication.name}</strong>
                </p>
              ) : null}
            </section>

            <section className="workflow-panel story-selection-panel" aria-labelledby="story-picker-heading">
              <div className="panel-heading">
                <span className="panel-step" aria-hidden="true">02</span>
                <div>
                  <h2 id="story-picker-heading">Choose a story</h2>
                  <p>Review one story at a time before adding it to your newsletter.</p>
                </div>
              </div>
              <StoryPicker
                stories={state.availableStories}
                selectedStoryIds={selectedStoryIds}
              />
            </section>
          </div>

          <aside className="builder-sidebar" aria-label="Newsletter draft and preparation">
            <section className="workflow-panel selected-panel" aria-labelledby="selected-stories-heading">
              <div className="panel-heading panel-heading-with-count">
                <span className="panel-step" aria-hidden="true">03</span>
                <div>
                  <h2 id="selected-stories-heading">Newsletter stories</h2>
                  <p>Arrange stories in the order they should appear.</p>
                </div>
                <span
                  className="story-count"
                  aria-label={`${selectedStoryIds.length} selected ${selectedStoryIds.length === 1 ? "story" : "stories"}`}
                >
                  {selectedStoryIds.length}
                </span>
              </div>

              {state.draft.selectedStories.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon" aria-hidden="true">+</div>
                  <h3>Your newsletter is empty</h3>
                  <p>Choose a story from the picker and add it here.</p>
                </div>
              ) : (
                <ol className="selected-story-list">
                  {state.draft.selectedStories.map((story, index) => {
                    const result = publishingResultsByStoryId.get(story.id);
                    return (
                      <li key={story.id} className="selected-story-item">
                        <span className="story-position" aria-hidden="true">{index + 1}</span>
                        <div className="selected-story-copy">
                          <h3>{story.title}</h3>
                          <p>{formatStoryTimestamp(story.publishedAt)}</p>
                          {result ? <span className="mini-ready-label">Prepared</span> : null}
                        </div>
                        <div className="story-order-actions" aria-label={`Controls for ${story.title}`}>
                          <form action={moveStoryUp}>
                            <input type="hidden" name="storyId" value={story.id} />
                            <button
                              className="small-button"
                              type="submit"
                              disabled={index === 0}
                              aria-label={`Move ${story.title} up`}
                            >
                              <span aria-hidden="true">↑</span> Up
                            </button>
                          </form>
                          <form action={moveStoryDown}>
                            <input type="hidden" name="storyId" value={story.id} />
                            <button
                              className="small-button"
                              type="submit"
                              disabled={index === state.draft.selectedStories.length - 1}
                              aria-label={`Move ${story.title} down`}
                            >
                              <span aria-hidden="true">↓</span> Down
                            </button>
                          </form>
                          <form action={removeStory}>
                            <input type="hidden" name="storyId" value={story.id} />
                            <button
                              className="small-button remove-button"
                              type="submit"
                              aria-label={`Remove ${story.title} from newsletter`}
                            >
                              Remove
                            </button>
                          </form>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>

            <section className="workflow-panel preparation-panel" aria-labelledby="preparation-heading">
              <div className="panel-heading">
                <span className="panel-step" aria-hidden="true">04</span>
                <div>
                  <h2 id="preparation-heading">Prepare for publishing</h2>
                  <p>Resolve the selected stories through the current publishing step.</p>
                </div>
              </div>

              <div className="publishing-mode">
                <div>
                  <span className="mode-label">Publishing mode</span>
                  <strong>Mock WordPress</strong>
                </div>
                <span className="mock-badge">MOCK</span>
              </div>

              <form action={publishSelectedStories}>
                <button className="button button-primary prepare-button" type="submit" disabled={!canPrepare}>
                  Prepare selected stories
                </button>
              </form>
              {!canPrepare ? (
                <p className="preparation-hint">
                  Choose a publication and add at least one story to continue.
                </p>
              ) : (
                <p className="preparation-hint">
                  This POC uses an offline mock. No external WordPress request will be made.
                </p>
              )}

              {state.draft.selectedStories.length > 0 ? (
                <div className="publishing-results" aria-live="polite">
                  <div className="results-heading">
                    <h3>Preparation status</h3>
                    <span>{readyResults} of {state.draft.selectedStories.length} ready</span>
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
          </aside>
        </div>
      </div>

      <footer className="app-footer">
        Controlled fixture data · Single-operator POC · No external publishing
      </footer>
    </main>
  );
}
