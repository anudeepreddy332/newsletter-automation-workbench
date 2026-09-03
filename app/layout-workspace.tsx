"use client";

import { useState } from "react";

import { moveBlockDown, moveBlockUp, removeBlock, reorderLayout } from "@/app/actions";
import { layoutBlockKey } from "@/src/domain/layout";
import type { NewsletterBlock } from "@/src/domain/workbench";

type LayoutWorkspaceProps = {
  blocks: NewsletterBlock[];
};

function blockTitle(block: NewsletterBlock): string {
  return block.kind === "story"
    ? block.story.title
    : `${block.offer.advertiserName} — ${block.offer.offerName}`;
}

function storedBlock(block: NewsletterBlock) {
  return block.kind === "story"
    ? { kind: "story" as const, storyId: block.story.id }
    : { kind: "sponsored" as const, offerId: block.offer.id };
}

export function LayoutWorkspace({ blocks }: LayoutWorkspaceProps) {
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const keys = blocks.map((block) => layoutBlockKey(storedBlock(block)));

  async function persistOrder(nextKeys: string[]) {
    if (nextKeys.join("\0") === keys.join("\0")) {
      return;
    }
    await reorderLayout(nextKeys);
  }

  async function handleDrop(targetIndex: number) {
    if (draggingKey === null) {
      return;
    }
    const fromIndex = keys.indexOf(draggingKey);
    if (fromIndex === -1) {
      return;
    }
    const nextKeys = [...keys];
    const [moved] = nextKeys.splice(fromIndex, 1);
    if (!moved) {
      return;
    }
    nextKeys.splice(targetIndex, 0, moved);
    setDraggingKey(null);
    setDropIndex(null);
    await persistOrder(nextKeys);
  }

  if (blocks.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon" aria-hidden="true">+</div>
        <h3>No blocks in this newsletter yet</h3>
        <p>Add stories and optional advertiser links, then arrange them here.</p>
      </div>
    );
  }

  return (
    <ol className="layout-block-list">
      {blocks.map((block, index) => {
        const key = keys[index]!;
        const isFirst = index === 0;
        const isLast = index === blocks.length - 1;
        return (
          <li
            key={key}
            className={`layout-block${draggingKey === key ? " is-dragging" : ""}${dropIndex === index ? " is-drop-target" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              setDropIndex(index);
            }}
            onDrop={async (event) => {
              event.preventDefault();
              await handleDrop(index);
            }}
          >
            <div
              className="drag-handle"
              draggable
              role="button"
              tabIndex={0}
              aria-label={`Drag to reorder ${blockTitle(block)}`}
              onDragStart={(event) => {
                event.dataTransfer.setData("text/plain", key);
                event.dataTransfer.effectAllowed = "move";
                setDraggingKey(key);
                setDropIndex(index);
              }}
              onDragEnd={() => {
                setDraggingKey(null);
                setDropIndex(null);
              }}
            >
              <span aria-hidden="true">⋮⋮</span>
            </div>
            <div className="selected-story-copy">
              <p className="block-type-marker">{block.kind === "story" ? "Story" : "Sponsored"}</p>
              <h3>{blockTitle(block)}</h3>
            </div>
            <div className="layout-block-actions">
              <form action={moveBlockUp}>
                <input type="hidden" name="blockKey" value={key} />
                <button
                  className="small-button move-button"
                  type="submit"
                  disabled={isFirst}
                  aria-label={`Move ${blockTitle(block)} up`}
                >
                  Move up
                </button>
              </form>
              <form action={moveBlockDown}>
                <input type="hidden" name="blockKey" value={key} />
                <button
                  className="small-button move-button"
                  type="submit"
                  disabled={isLast}
                  aria-label={`Move ${blockTitle(block)} down`}
                >
                  Move down
                </button>
              </form>
              <form action={removeBlock}>
                <input type="hidden" name="blockKey" value={key} />
                <button
                  className="small-button remove-button"
                  type="submit"
                  aria-label={`Remove ${blockTitle(block)} from newsletter`}
                >
                  Remove
                </button>
              </form>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
