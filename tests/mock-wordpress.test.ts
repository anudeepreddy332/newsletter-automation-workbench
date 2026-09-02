import assert from "node:assert/strict";
import test from "node:test";

import { MockWordPress } from "@/src/adapters/publishing/mock-wordpress";
import type { PublishingRequest } from "@/src/publishing/content-publisher";

const request: PublishingRequest = {
  draftId: "draft_controlled",
  publicationId: "publication_controlled",
  story: {
    id: "story_controlled",
    contentFeedId: "content_feed_controlled",
    title: "Controlled story",
    summary: "Controlled summary.",
    canonicalUrl: "https://fixture.example.test/news/controlled-story",
    publishedAt: "2026-09-02T06:00:00.000Z",
  },
};

test("MockWordPress returns the same normalized success result for the same request", async () => {
  const publisher = new MockWordPress();

  const first = await publisher.publish(request);
  const second = await publisher.publish(request);

  assert.deepEqual(second, first);
  assert.equal(first.sourceStoryId, request.story.id);
  assert.equal(first.provider, "MockWordPress");
  assert.equal(first.mode, "mock");
  assert.equal(first.status, "published");
  if (first.status === "published") {
    assert.match(first.externalPostId, /^mock_wp_[a-f0-9]{16}$/);
    assert.match(first.url, /^https:\/\/wordpress-fixture\.test\/posts\/mock_wp_[a-f0-9]{16}$/);
  }
});

test("MockWordPress reports a controlled failure without a post ID or URL", async () => {
  const publisher = new MockWordPress({ failForStoryIds: [request.story.id] });

  const result = await publisher.publish(request);

  assert.deepEqual(result, {
    sourceStoryId: request.story.id,
    provider: "MockWordPress",
    mode: "mock",
    status: "failed",
    diagnostic: "Mock publishing was configured to fail for this controlled story.",
  });
  assert.equal("externalPostId" in result, false);
  assert.equal("url" in result, false);
});
