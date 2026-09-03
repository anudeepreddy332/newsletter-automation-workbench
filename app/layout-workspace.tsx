"use client";

import { useState, useSyncExternalStore } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { removeBlock, reorderLayout } from "@/app/actions";
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

function ignoreDragActivation(event: { stopPropagation: () => void }) {
  event.stopPropagation();
}

function BlockBody({
  block,
  blockKey,
  interactive,
}: {
  block: NewsletterBlock;
  blockKey: string;
  interactive: boolean;
}) {
  return (
    <>
      <div className="drag-affordance" aria-hidden="true">
        <span>⋮⋮</span>
      </div>
      <div className="selected-story-copy">
        <p className="block-type-marker">{block.kind === "story" ? "Story" : "Sponsored"}</p>
        <h3>{blockTitle(block)}</h3>
      </div>
      <div className="layout-block-actions">
        {interactive ? (
          <form
            action={removeBlock}
            data-no-drag="true"
            onPointerDown={ignoreDragActivation}
            onMouseDown={ignoreDragActivation}
            onTouchStart={ignoreDragActivation}
          >
            <input type="hidden" name="blockKey" value={blockKey} />
            <button
              className="small-button remove-button"
              type="submit"
              aria-label={`Remove ${blockTitle(block)} from newsletter`}
            >
              Remove
            </button>
          </form>
        ) : (
          <button className="small-button remove-button" type="button" tabIndex={-1} disabled>
            Remove
          </button>
        )}
      </div>
    </>
  );
}

function SortableBlock({
  block,
  blockKey,
  isDropTarget,
}: {
  block: NewsletterBlock;
  blockKey: string;
  isDropTarget: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: blockKey,
  });

  return (
    <li>
      <div
        ref={setNodeRef}
        className={`layout-block${isDragging ? " is-dragging" : ""}${isDropTarget ? " is-drop-target" : ""}`}
        style={{
          transform: CSS.Transform.toString(transform),
          transition,
        }}
        {...attributes}
        {...listeners}
        aria-label={`${block.kind === "story" ? "Story" : "Sponsored"}: ${blockTitle(block)}. Drag to reorder.`}
      >
        <BlockBody block={block} blockKey={blockKey} interactive />
      </div>
    </li>
  );
}

export function LayoutWorkspace({ blocks }: LayoutWorkspaceProps) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  const keys = blocks.map((block) => layoutBlockKey(storedBlock(block)));
  const activeBlock = blocks.find((block, index) => keys[index] === activeKey) ?? null;
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 4 },
    }),
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  async function persistOrder(nextKeys: string[]) {
    if (nextKeys.join("\0") === keys.join("\0")) {
      return;
    }
    await reorderLayout(nextKeys);
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveKey(String(event.active.id));
    setOverKey(String(event.active.id));
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveKey(null);
    setOverKey(null);
    if (!over || active.id === over.id) {
      return;
    }
    const fromIndex = keys.indexOf(String(active.id));
    const toIndex = keys.indexOf(String(over.id));
    if (fromIndex === -1 || toIndex === -1) {
      return;
    }
    await persistOrder(arrayMove(keys, fromIndex, toIndex));
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

  if (!mounted) {
    return (
      <ol className="layout-block-list">
        {blocks.map((block, index) => {
          const key = keys[index]!;
          return (
            <li key={key}>
              <div
                className="layout-block"
                aria-label={`${block.kind === "story" ? "Story" : "Sponsored"}: ${blockTitle(block)}. Drag to reorder.`}
              >
                <BlockBody block={block} blockKey={key} interactive />
              </div>
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragStart={handleDragStart}
      onDragOver={(event) => setOverKey(event.over ? String(event.over.id) : null)}
      onDragCancel={() => {
        setActiveKey(null);
        setOverKey(null);
      }}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={keys} strategy={verticalListSortingStrategy}>
        <ol className="layout-block-list">
          {blocks.map((block, index) => {
            const key = keys[index]!;
            return (
              <SortableBlock
                key={key}
                block={block}
                blockKey={key}
                isDropTarget={activeKey !== null && overKey === key && activeKey !== key}
              />
            );
          })}
        </ol>
      </SortableContext>
      <DragOverlay modifiers={[restrictToVerticalAxis]}>
        {activeBlock && activeKey ? (
          <div className="layout-block layout-block-overlay">
            <BlockBody block={activeBlock} blockKey={activeKey} interactive={false} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
