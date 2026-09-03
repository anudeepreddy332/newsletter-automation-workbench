import { fetchLatestStories } from "@/app/actions";
import { GeneratedNewsletterPanel } from "@/app/generated-newsletter";
import { LayoutWorkspace } from "@/app/layout-workspace";
import { OfferPicker } from "@/app/offer-picker";
import { PublishWordpressPanel } from "@/app/publish-wordpress";
import { ReviewApprovePanel } from "@/app/review-approve";
import { StageIterablePanel } from "@/app/stage-iterable";
import { StoryPicker } from "@/app/story-picker";
import type { WorkbenchState } from "@/src/domain/workbench";

type WorkbenchProps = {
  state: WorkbenchState;
};

export function Workbench({ state }: WorkbenchProps) {
  const selectedStoryIds = state.draft.selectedStories.map((story) => story.id);
  const selectedOfferIds = state.draft.selectedOffers.map((offer) => offer.id);
  const selectedCount = state.draft.selectedStories.length;
  const availableCount = state.availableStories.length;
  const canGenerate = selectedCount > 0;

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-mark" aria-hidden="true">NB</div>
        <div className="header-copy">
          <h1>Newsletter Builder</h1>
          <p className="header-description">
            Fetch stories, choose stories and advertiser links, arrange the newsletter, generate a
            preview, approve it, publish it to WordPress, then stage it.
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

          <PublishWordpressPanel
            wordpressConfigured={state.wordpressConfigured}
            approvalIsCurrent={state.approvalIsCurrent}
            publication={state.newsletterPublication}
            publicationIsCurrent={state.newsletterPublicationIsCurrent}
          />

          <StageIterablePanel
            canStage={state.approvalIsCurrent && state.newsletterPublicationIsCurrent}
            stagingReceipt={state.stagingReceipt}
            publicationIsCurrent={state.newsletterPublicationIsCurrent}
            approvalIsCurrent={state.approvalIsCurrent}
          />
        </div>
      </div>

      <footer className="app-footer">
        Sample content is used in this prototype.
      </footer>
    </main>
  );
}
