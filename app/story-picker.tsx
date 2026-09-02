"use client";

import { useState } from "react";

import { addStory } from "@/app/actions";
import { formatStoryTimestamp } from "@/app/story-presentation";
import type { Story } from "@/src/domain/story";

type StoryPickerProps = {
  stories: Story[];
  selectedStoryIds: string[];
};

export function StoryPicker({ stories, selectedStoryIds }: StoryPickerProps) {
  const [storyId, setStoryId] = useState("");
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const selectedStory = stories.find((story) => story.id === storyId);
  const isAlreadySelected = selectedStory ? selectedStoryIds.includes(selectedStory.id) : false;

  return (
    <div className="story-picker">
      <div className="field-group">
        <label htmlFor="story-picker">Available stories</label>
        <select
          id="story-picker"
          value={storyId}
          onChange={(event) => {
            setStoryId(event.target.value);
            setIsPreviewOpen(false);
          }}
        >
          <option value="">Select a story to inspect</option>
          {stories.map((story) => (
            <option key={story.id} value={story.id}>
              {story.title}{selectedStoryIds.includes(story.id) ? " — in newsletter" : ""}
            </option>
          ))}
        </select>
        <p className="field-help">{stories.length} controlled fixture stories available</p>
      </div>

      {!selectedStory ? (
        <div className="story-picker-placeholder">
          <div className="placeholder-lines" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <p>Select a title above to see its summary and fixture details.</p>
        </div>
      ) : (
        <article className="story-detail-card">
          <div className="story-detail-header">
            <div>
              <span className="fixture-label">Controlled story</span>
              <h3>{selectedStory.title}</h3>
              <p className="story-byline">
                <time dateTime={selectedStory.publishedAt}>
                  {formatStoryTimestamp(selectedStory.publishedAt)}
                </time>
                {selectedStory.sourceAuthor ? ` · ${selectedStory.sourceAuthor}` : " · Author not provided"}
              </p>
            </div>
            {isAlreadySelected ? <span className="selected-badge">In newsletter</span> : null}
          </div>

          <p className="story-summary">{selectedStory.summary}</p>

          <div className="story-detail-actions">
            <button
              className="button button-quiet"
              type="button"
              aria-expanded={isPreviewOpen}
              aria-controls="fixture-story-preview"
              onClick={() => setIsPreviewOpen((open) => !open)}
            >
              {isPreviewOpen ? "Hide preview" : "Preview story"}
            </button>
            <form action={addStory}>
              <input type="hidden" name="storyId" value={selectedStory.id} />
              <button className="button button-primary" type="submit" disabled={isAlreadySelected}>
                {isAlreadySelected ? "Added to newsletter" : "Add to newsletter"}
              </button>
            </form>
          </div>

          {isPreviewOpen ? (
            <section id="fixture-story-preview" className="fixture-preview" aria-label="Fixture preview">
              <div className="fixture-preview-heading">
                <span className="fixture-preview-icon" aria-hidden="true">F</span>
                <div>
                  <span className="fixture-preview-label">Fixture preview</span>
                  <p>Controlled content available in this POC</p>
                </div>
              </div>
              {selectedStory.imageUrl ? (
                <div className="fixture-image-reference">
                  <span className="image-placeholder" aria-hidden="true">▧</span>
                  <div>
                    <strong>Fixture image reference</strong>
                    <p>The feed includes image metadata, but the reserved test address is not loaded as an external image.</p>
                  </div>
                </div>
              ) : null}
              <h4>{selectedStory.title}</h4>
              <p>{selectedStory.summary}</p>
              <dl className="fixture-metadata">
                <div>
                  <dt>Published</dt>
                  <dd>{formatStoryTimestamp(selectedStory.publishedAt)}</dd>
                </div>
                <div>
                  <dt>Fixture URL</dt>
                  <dd><code>{selectedStory.canonicalUrl}</code></dd>
                </div>
              </dl>
              <p className="fixture-disclaimer">
                This preview contains only the controlled fixture content in the workbench, not a full Benzinga article.
              </p>
            </section>
          ) : null}
        </article>
      )}
    </div>
  );
}
