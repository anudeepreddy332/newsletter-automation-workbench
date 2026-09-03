export const STORY_BLOCK_KIND = "story";
export const SPONSORED_BLOCK_KIND = "sponsored";

export type LayoutBlockKind = typeof STORY_BLOCK_KIND | typeof SPONSORED_BLOCK_KIND;

export type StoredLayoutBlock =
  | { kind: "story"; storyId: string }
  | { kind: "sponsored"; offerId: string };

export function storyBlockKey(storyId: string): string {
  return `${STORY_BLOCK_KIND}:${storyId}`;
}

export function sponsoredBlockKey(offerId: string): string {
  return `${SPONSORED_BLOCK_KIND}:${offerId}`;
}

export function layoutBlockKey(block: StoredLayoutBlock): string {
  return block.kind === STORY_BLOCK_KIND
    ? storyBlockKey(block.storyId)
    : sponsoredBlockKey(block.offerId);
}

export function parseBlockKey(blockKey: string): StoredLayoutBlock {
  if (blockKey.startsWith(`${STORY_BLOCK_KIND}:`)) {
    const storyId = blockKey.slice(`${STORY_BLOCK_KIND}:`.length);
    if (storyId.length === 0) {
      throw new Error("A story block is missing its identity.");
    }
    return { kind: "story", storyId };
  }

  if (blockKey.startsWith(`${SPONSORED_BLOCK_KIND}:`)) {
    const offerId = blockKey.slice(`${SPONSORED_BLOCK_KIND}:`.length);
    if (offerId.length === 0) {
      throw new Error("A sponsored block is missing its identity.");
    }
    return { kind: "sponsored", offerId };
  }

  throw new Error("A newsletter layout block has an invalid identity.");
}
