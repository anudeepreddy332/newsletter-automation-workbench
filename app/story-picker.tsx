"use client";

import { useState } from "react";

import { addStory } from "@/app/actions";
import { formatStoryTimestamp, storyOptionLabel } from "@/app/story-presentation";
import type { Story } from "@/src/domain/story";

type StoryPickerProps = {
  stories: Story[];
  selectedStoryIds: string[];
};

function storyBodyParagraphs(body: string | undefined): string[] {
  return body?.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean) ?? [];
}

export function StoryPicker({ stories, selectedStoryIds }: StoryPickerProps) {
  const [storyId, setStoryId] = useState("");
  const [isFullStoryOpen, setIsFullStoryOpen] = useState(false);
  const selectedStory = stories.find((story) => story.id === storyId);
  const isAlreadySelected = selectedStory ? selectedStoryIds.includes(selectedStory.id) : false;
  const fullStoryId = selectedStory ? `full-story-${selectedStory.id}` : undefined;
  const bodyParagraphs = storyBodyParagraphs(selectedStory?.body);

  return (
    <div className="story-picker">
      <div className="field-group">
        <label htmlFor="story-picker">Available stories</label>
        <select
          id="story-picker"
          value={storyId}
          onChange={(event) => {
            setStoryId(event.target.value);
            setIsFullStoryOpen(false);
          }}
        >
          <option value="">Select a story to inspect</option>
          {stories.map((story) => (
            <option key={story.id} value={story.id}>
              {storyOptionLabel(story)}
            </option>
          ))}
        </select>
        <p className="field-help">{stories.length} stories available</p>
      </div>

      {!selectedStory ? (
        <div className="story-picker-placeholder">
          <div className="placeholder-lines" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <p>Select a title above to review its details before adding it.</p>
        </div>
      ) : (
        <article className="story-detail-card">
          <div className="story-detail-header">
            <div>
              <span className="story-detail-label">Story details</span>
              <h3>{selectedStory.title}</h3>
              <p className="story-byline">
                <span>{selectedStory.sourceAuthor ?? "Author not provided"}</span>
                <span aria-hidden="true"> · </span>
                <time dateTime={selectedStory.publishedAt}>
                  {formatStoryTimestamp(selectedStory.publishedAt)}
                </time>
              </p>
            </div>
          </div>

          <p className="story-summary">{selectedStory.summary}</p>

          <div className="story-detail-actions">
            <button
              className="button button-quiet"
              type="button"
              aria-expanded={isFullStoryOpen}
              aria-controls={fullStoryId}
              onClick={() => setIsFullStoryOpen((open) => !open)}
            >
              {isFullStoryOpen ? "Close full story" : "View full story"}
            </button>
            <form action={addStory}>
              <input type="hidden" name="storyId" value={selectedStory.id} />
              <button className="button button-primary" type="submit" disabled={isAlreadySelected}>
                {isAlreadySelected ? "Already added" : "Add to newsletter"}
              </button>
            </form>
          </div>

          {isFullStoryOpen ? (
            <section
              id={fullStoryId}
              className="full-story"
              aria-labelledby={`${fullStoryId}-heading`}
            >
              <header className="full-story-heading">
                <span className="full-story-label">Full story</span>
                <h4 id={`${fullStoryId}-heading`}>{selectedStory.title}</h4>
                <p>
                  {selectedStory.sourceAuthor ?? "Author not provided"} ·{" "}
                  <time dateTime={selectedStory.publishedAt}>
                    {formatStoryTimestamp(selectedStory.publishedAt)}
                  </time>
                </p>
              </header>

              {selectedStory.imageUrl ? (
                <div className="story-image-reference" aria-label="Story image metadata available">
                  <span aria-hidden="true">▧</span>
                  <p>Image metadata is included with this story.</p>
                </div>
              ) : null}

              {bodyParagraphs.length > 0 ? (
                <div className="full-story-body">
                  {bodyParagraphs.map((paragraph, index) => (
                    <p key={`${selectedStory.id}-paragraph-${index}`}>{paragraph}</p>
                  ))}
                </div>
              ) : (
                <p className="full-story-unavailable">
                  Full story content is not available for this sample.
                </p>
              )}
            </section>
          ) : null}
        </article>
      )}
    </div>
  );
}
