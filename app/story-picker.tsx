"use client";

import { useState } from "react";

import { addSelectedStories } from "@/app/actions";
import { formatStoryTimestamp } from "@/app/story-presentation";
import type { Story } from "@/src/domain/story";

type StoryPickerProps = {
  stories: Story[];
  selectedStoryIds: string[];
};

function storyBodyParagraphs(body: string | undefined): string[] {
  return body?.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean) ?? [];
}

export function StoryPicker({ stories, selectedStoryIds }: StoryPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [pendingStoryIds, setPendingStoryIds] = useState<string[]>([]);
  const [inspectingStoryId, setInspectingStoryId] = useState<string | null>(null);
  const selectedCount = selectedStoryIds.length;
  const availableCount = stories.length;
  const pendingCount = pendingStoryIds.filter((storyId) => !selectedStoryIds.includes(storyId)).length;
  const inspectingStory = stories.find((story) => story.id === inspectingStoryId);
  const bodyParagraphs = storyBodyParagraphs(inspectingStory?.body);
  const panelId = "story-picker-panel";

  function togglePending(storyId: string, alreadySelected: boolean) {
    if (alreadySelected) {
      return;
    }
    setPendingStoryIds((current) =>
      current.includes(storyId)
        ? current.filter((id) => id !== storyId)
        : [...current, storyId],
    );
  }

  return (
    <div className="choice-picker">
      <button
        className="button button-quiet picker-toggle"
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setIsOpen((open) => !open)}
      >
        Choose stories
      </button>
      <p className="picker-summary">
        {selectedCount} {selectedCount === 1 ? "story" : "stories"} in the newsletter
      </p>
      <p className="field-help">
        {availableCount === 0
          ? "Fetch stories first."
          : `${availableCount} ${availableCount === 1 ? "story" : "stories"} available`}
      </p>

      {isOpen ? (
        <div id={panelId} className="picker-panel">
          {availableCount === 0 ? (
            <p className="picker-empty">Fetch stories first.</p>
          ) : (
            <form
              action={async (formData) => {
                await addSelectedStories(formData);
                setPendingStoryIds([]);
                setInspectingStoryId(null);
                setIsOpen(false);
              }}
            >
              <ul className="picker-row-list">
                {stories.map((story) => {
                  const alreadySelected = selectedStoryIds.includes(story.id);
                  const checked = alreadySelected || pendingStoryIds.includes(story.id);
                  return (
                    <li key={story.id} className="picker-row">
                      <label className={`picker-choice${alreadySelected ? " is-disabled" : ""}`}>
                        <input
                          type="checkbox"
                          name="storyId"
                          value={story.id}
                          checked={checked}
                          disabled={alreadySelected}
                          onChange={() => togglePending(story.id, alreadySelected)}
                        />
                        <span>{story.title}</span>
                      </label>
                      <button
                        className="small-button"
                        type="button"
                        onClick={() =>
                          setInspectingStoryId((current) => (current === story.id ? null : story.id))
                        }
                        aria-expanded={inspectingStoryId === story.id}
                      >
                        View
                      </button>
                    </li>
                  );
                })}
              </ul>
              <button
                className="button button-primary prepare-button"
                type="submit"
                disabled={pendingCount === 0}
              >
                Add selected stories ({pendingCount})
              </button>
            </form>
          )}

          {inspectingStory ? (
            <article className="story-detail-card">
              <div className="story-detail-header">
                <div>
                  <span className="story-detail-label">Story details</span>
                  <h3>{inspectingStory.title}</h3>
                  <p className="story-byline">
                    <span>{inspectingStory.sourceAuthor ?? "Author not provided"}</span>
                    <span aria-hidden="true"> · </span>
                    <time dateTime={inspectingStory.publishedAt}>
                      {formatStoryTimestamp(inspectingStory.publishedAt)}
                    </time>
                  </p>
                </div>
              </div>
              <p className="story-summary">{inspectingStory.summary}</p>
              {inspectingStory.imageUrl ? (
                <div className="story-image-reference" aria-label="Story image metadata available">
                  <span aria-hidden="true">▧</span>
                  <p>Image metadata is included with this story.</p>
                </div>
              ) : null}
              {bodyParagraphs.length > 0 ? (
                <div className="full-story-body">
                  {bodyParagraphs.map((paragraph, index) => (
                    <p key={`${inspectingStory.id}-paragraph-${index}`}>{paragraph}</p>
                  ))}
                </div>
              ) : (
                <p className="full-story-unavailable">
                  Full story content is not available for this sample.
                </p>
              )}
            </article>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
