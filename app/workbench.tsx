import {
  addStory,
  moveStoryDown,
  moveStoryUp,
  removeStory,
  selectPublication,
} from "@/app/actions";
import type { WorkbenchState } from "@/src/domain/workbench";

type WorkbenchProps = {
  state: WorkbenchState;
};

export function Workbench({ state }: WorkbenchProps) {
  const selectedStoryIds = new Set(state.draft.selectedStories.map((story) => story.id));

  return (
    <main>
      <h1>Newsletter Selection Workbench</h1>
      <p>Choose a fictional publication, then manually select and order normalized fixture stories.</p>

      <section aria-labelledby="publication-heading">
        <h2 id="publication-heading">Publication</h2>
        <form action={selectPublication}>
          <label htmlFor="publicationId">Newsletter brand</label>
          <select
            id="publicationId"
            name="publicationId"
            defaultValue={state.draft.publicationId ?? ""}
          >
            <option value="" disabled>
              Select a publication
            </option>
            {state.publications.map((publication) => (
              <option key={publication.id} value={publication.id}>
                {publication.name}
              </option>
            ))}
          </select>
          <button type="submit">Save publication</button>
        </form>
      </section>

      <section aria-labelledby="available-stories-heading">
        <h2 id="available-stories-heading">Available stories</h2>
        <ul>
          {state.availableStories.map((story) => {
            const isSelected = selectedStoryIds.has(story.id);
            return (
              <li key={story.id}>
                <article>
                  <h3>{story.title}</h3>
                  <p>{story.summary}</p>
                  <p>
                    Published {new Date(story.publishedAt).toLocaleString("en-US", { timeZone: "UTC" })}
                    {story.sourceAuthor ? ` · ${story.sourceAuthor}` : ""}
                  </p>
                  {story.imageUrl ? (
                    // Fixture image URLs are external source metadata, not local workbench assets.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={story.imageUrl} alt="" />
                  ) : null}
                  <p>
                    <a href={story.canonicalUrl}>Read source</a>
                  </p>
                  <form action={addStory}>
                    <input type="hidden" name="storyId" value={story.id} />
                    <button type="submit" disabled={isSelected}>
                      {isSelected ? "Selected" : "Add to draft"}
                    </button>
                  </form>
                </article>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="selected-stories-heading">
        <h2 id="selected-stories-heading">Selected stories</h2>
        {state.draft.selectedStories.length === 0 ? (
          <p>No stories selected yet.</p>
        ) : (
          <ol>
            {state.draft.selectedStories.map((story, index) => (
              <li key={story.id}>
                <span>{story.title}</span>
                <form action={moveStoryUp}>
                  <input type="hidden" name="storyId" value={story.id} />
                  <button type="submit" disabled={index === 0}>
                    Move up
                  </button>
                </form>
                <form action={moveStoryDown}>
                  <input type="hidden" name="storyId" value={story.id} />
                  <button type="submit" disabled={index === state.draft.selectedStories.length - 1}>
                    Move down
                  </button>
                </form>
                <form action={removeStory}>
                  <input type="hidden" name="storyId" value={story.id} />
                  <button type="submit">Remove</button>
                </form>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
