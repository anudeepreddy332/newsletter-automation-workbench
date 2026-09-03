import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { BenzingaShapedFixtureSource } from "@/src/adapters/rss/benzinga-shaped-rss";
import { MockWordPress } from "@/src/adapters/publishing/mock-wordpress";
import { openContentDatabase } from "@/src/db/database";
import { applyContentFoundationMigrations } from "@/src/db/migrate";
import type { NewsletterAssemblyInput } from "@/src/domain/newsletter";
import { buildNewsletterAssemblyInput, resolveNewsletterStoryUrl } from "@/src/newsletter/assembly";
import { fingerprintNewsletterInput } from "@/src/newsletter/fingerprint";
import { POC_SPONSORED_LABEL, placeNewsletterContent } from "@/src/newsletter/placement";
import { escapeHtml, renderNewsletter } from "@/src/newsletter/renderer";
import { ContentRepository } from "@/src/repositories/content-repository";
import { WorkbenchRepository } from "@/src/repositories/workbench-repository";
import { WorkbenchService, WorkbenchServiceError } from "@/src/workbench/workbench-service";

const fixturePath = path.join(
  process.cwd(),
  "tests/fixtures/benzinga-shaped-financial-news.xml",
);
const firstStoryId = "story_6c43c8a1944281017858d68b";
const secondStoryId = "story_5c6a67b4a9b7cb360ddc7877";
const firstOfferId = "offer_harborline_savings";
const secondOfferId = "offer_northstar_brokerage";
const thirdOfferId = "offer_ledgerbay_software";

const controlledInput: NewsletterAssemblyInput = {
  blocks: [
    {
      kind: "story",
      story: {
        title: `Rates <script>alert("x")</script> & "quotes"`,
        summary: "A controlled summary with <b>markup</b>.",
        body: "First paragraph.\n\nSecond paragraph with & ampersands.",
        url: "https://fixture.example.test/news/controlled-story",
      },
    },
    {
      kind: "story",
      story: {
        title: "Second controlled story",
        summary: "Second summary.",
        url: "https://fixture.example.test/news/second-controlled-story",
      },
    },
    {
      kind: "sponsored",
      offer: {
        advertiserName: "Harborline Savings",
        offerName: "High-yield savings <trial>",
        trackingUrl: "https://offers-fixture.test/track/harborline-savings",
      },
    },
    {
      kind: "sponsored",
      offer: {
        advertiserName: "Northstar Brokerage",
        offerName: "Self-directed investing starter kit",
        trackingUrl: "https://offers-fixture.test/track/northstar-brokerage",
      },
    },
  ],
};

function installNetworkGuard(): () => void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("Phase 4 tests must not make a real network request.");
  }) as typeof fetch;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

async function withWorkbench(
  run: (service: WorkbenchService) => Promise<void>,
): Promise<void> {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "newsletter-renderer-"));
  const databasePath = path.join(temporaryDirectory, "workbench.db");
  const { client, db } = openContentDatabase(databasePath);
  applyContentFoundationMigrations(db);
  const service = new WorkbenchService(
    new BenzingaShapedFixtureSource(fixturePath),
    new ContentRepository(db),
    new WorkbenchRepository(db),
    new MockWordPress(),
  );
  await service.fetchLatestStories();

  try {
    await run(service);
  } finally {
    client.close();
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

test("renderer HTML and plain text are deterministic for the same inputs", () => {
  const restoreFetch = installNetworkGuard();
  try {
    const first = renderNewsletter(controlledInput);
    const second = renderNewsletter(controlledInput);

    assert.deepEqual(second, first);
    assert.equal(first.subject, `Rates <script>alert("x")</script> & "quotes"`);
    assert.equal(first.preheader, "A controlled summary with <b>markup</b>.");
    assert.equal(fingerprintNewsletterInput(controlledInput), fingerprintNewsletterInput(controlledInput));
  } finally {
    restoreFetch();
  }
});

test("HTML renderer safely escapes controlled text", () => {
  const html = renderNewsletter(controlledInput).html;

  assert.equal(html.includes("<script>"), false);
  assert.equal(html.includes("<b>markup</b>"), false);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;b&gt;markup&lt;\/b&gt;/);
  assert.match(html, /&lt;trial&gt;/);
  assert.match(html, /&amp; &quot;quotes&quot;/);
  assert.equal(escapeHtml(`<img src="x" onerror="alert(1)">`), `&lt;img src=&quot;x&quot; onerror=&quot;alert(1)&quot;&gt;`);
});

test("plain-text renderer is deterministic and includes selected stories", () => {
  const first = renderNewsletter(controlledInput).plainText;
  const second = renderNewsletter(controlledInput).plainText;

  assert.equal(second, first);
  assert.match(first, /Rates <script>alert\("x"\)<\/script>/);
  assert.match(first, /Second controlled story/);
  assert.doesNotMatch(first, /Date\.now|new Date\(/);
});

test("renderer follows exact mixed block order instead of regrouping by type", () => {
  const interleaved: NewsletterAssemblyInput = {
    blocks: [
      controlledInput.blocks[0]!,
      controlledInput.blocks[2]!,
      controlledInput.blocks[1]!,
      controlledInput.blocks[3]!,
    ],
  };
  const rendered = renderNewsletter(interleaved);
  const placement = placeNewsletterContent(interleaved);
  const firstStoryIndex = rendered.html.indexOf("Rates");
  const firstOfferIndex = rendered.html.indexOf("Harborline Savings");
  const secondStoryIndex = rendered.html.indexOf("Second controlled story");
  const secondOfferIndex = rendered.html.indexOf("Northstar Brokerage");

  assert.deepEqual(
    placement.blocks.map((block) => block.kind),
    ["story", "sponsored", "story", "sponsored"],
  );
  assert.ok(firstStoryIndex < firstOfferIndex);
  assert.ok(firstOfferIndex < secondStoryIndex);
  assert.ok(secondStoryIndex < secondOfferIndex);
  assert.match(rendered.html, new RegExp(`${POC_SPONSORED_LABEL}[\\s\\S]*Harborline Savings[\\s\\S]*Second controlled story`));
  assert.doesNotMatch(rendered.html, /Sponsored links/);
  assert.match(rendered.plainText, /Sponsored\n\nHarborline Savings/);
});

test("renderer does not claim intelligent advertisement placement", () => {
  const rendered = renderNewsletter(controlledInput);
  const combined = `${rendered.html}\n${rendered.plainText}`;

  assert.doesNotMatch(combined, /afterStoryId|relevance|recommended offer|matched to this story|AI placement|best offer/i);
  assert.match(readFileSync(path.join(process.cwd(), "src/newsletter/placement.ts"), "utf8"), /not the target production placement policy/);
});

test("assembly input stays provider-neutral", () => {
  const input = buildNewsletterAssemblyInput(
    [
      {
        kind: "story",
        story: {
          id: "story_controlled",
          contentFeedId: "content_feed_controlled",
          title: "Controlled story",
          summary: "Controlled summary.",
          canonicalUrl: "https://fixture.example.test/news/controlled-story",
          publishedAt: "2026-09-02T06:00:00.000Z",
        },
      },
      {
        kind: "sponsored",
        offer: {
          id: "offer_controlled",
          advertiserName: "Harborline Savings",
          offerName: "High-yield savings account review",
          trackingUrl: "https://offers-fixture.test/track/harborline-savings",
        },
      },
    ],
    [
      {
        sourceStoryId: "story_controlled",
        provider: "MockWordPress",
        mode: "mock",
        status: "published",
        externalPostId: "mock_wp_controlled",
        url: "https://wordpress-fixture.test/posts/mock_wp_controlled",
      },
    ],
  );

  assert.deepEqual(input.blocks[0], {
    kind: "story",
    story: {
      title: "Controlled story",
      summary: "Controlled summary.",
      body: undefined,
      url: "https://wordpress-fixture.test/posts/mock_wp_controlled",
    },
  });
  assert.equal("id" in (input.blocks[1] && input.blocks[1].kind === "sponsored" ? input.blocks[1].offer : {}), false);
  assert.equal("provider" in (input.blocks[0] && input.blocks[0].kind === "story" ? input.blocks[0].story : {}), false);
});

const controlledStory = {
  id: "story_controlled",
  contentFeedId: "content_feed_controlled",
  title: "Controlled story",
  summary: "Controlled summary.",
  canonicalUrl: "https://fixture.example.test/news/controlled-story",
  publishedAt: "2026-09-02T06:00:00.000Z",
} as const;

const mockPublished = {
  sourceStoryId: controlledStory.id,
  provider: "MockWordPress",
  mode: "mock" as const,
  status: "published" as const,
  externalPostId: "mock_wp_controlled",
  url: "https://wordpress-fixture.test/posts/mock_wp_controlled",
};

const realPublished = {
  sourceStoryId: controlledStory.id,
  provider: "WordPress.com",
  mode: "real" as const,
  status: "published" as const,
  externalPostId: "88421",
  url: "https://example.wordpress.com/2026/09/02/controlled-story/",
};

test("real published and mock published resolve to the real WordPress.com URL", () => {
  const restoreFetch = installNetworkGuard();
  try {
    const mockFirst = resolveNewsletterStoryUrl(controlledStory, [mockPublished, realPublished]);
    const realFirst = resolveNewsletterStoryUrl(controlledStory, [realPublished, mockPublished]);
    const assembled = buildNewsletterAssemblyInput(
      [{ kind: "story", story: controlledStory }],
      [mockPublished, realPublished],
    );

    assert.equal(mockFirst, realPublished.url);
    assert.equal(realFirst, realPublished.url);
    assert.equal(assembled.blocks[0]?.kind === "story" ? assembled.blocks[0].story.url : undefined, realPublished.url);
  } finally {
    restoreFetch();
  }
});

test("mock published only resolves to the MockWordPress URL", () => {
  assert.equal(resolveNewsletterStoryUrl(controlledStory, [mockPublished]), mockPublished.url);
});

test("no published result resolves to the story canonical URL", () => {
  assert.equal(resolveNewsletterStoryUrl(controlledStory, []), controlledStory.canonicalUrl);
  assert.equal(
    resolveNewsletterStoryUrl(controlledStory, [
      {
        sourceStoryId: controlledStory.id,
        provider: "MockWordPress",
        mode: "mock",
        status: "failed",
        diagnostic: "Mock publishing was configured to fail for this controlled story.",
      },
    ]),
    controlledStory.canonicalUrl,
  );
});

test("failed or unknown real results do not override a valid mock published URL", () => {
  const failedReal = {
    sourceStoryId: controlledStory.id,
    provider: "WordPress.com",
    mode: "real" as const,
    status: "failed" as const,
    diagnostic: "WordPress.com authentication failed.",
  };
  const unknownReal = {
    sourceStoryId: controlledStory.id,
    provider: "WordPress.com",
    mode: "real" as const,
    status: "unknown" as const,
    diagnostic: "The WordPress.com request did not complete.",
  };

  assert.equal(
    resolveNewsletterStoryUrl(controlledStory, [failedReal, mockPublished]),
    mockPublished.url,
  );
  assert.equal(
    resolveNewsletterStoryUrl(controlledStory, [unknownReal, mockPublished]),
    mockPublished.url,
  );
});

test("equivalent resolved inputs still render identically", () => {
  const restoreFetch = installNetworkGuard();
  try {
    const fromMockFirst = buildNewsletterAssemblyInput(
      [{ kind: "story", story: controlledStory }],
      [mockPublished, realPublished],
    );
    const fromRealFirst = buildNewsletterAssemblyInput(
      [{ kind: "story", story: controlledStory }],
      [realPublished, mockPublished],
    );

    assert.deepEqual(fromRealFirst, fromMockFirst);
    assert.deepEqual(renderNewsletter(fromRealFirst), renderNewsletter(fromMockFirst));
    assert.deepEqual(renderNewsletter(controlledInput), renderNewsletter(controlledInput));
  } finally {
    restoreFetch();
  }
});

test("newsletter generation allows zero selected offers", async () => {
  await withWorkbench(async (service) => {
    await service.addStory(firstStoryId);
    await service.generateNewsletter();
    const state = await service.load();

    assert.equal(state.generatedNewsletterIsCurrent, true);
    assert.doesNotMatch(state.generatedNewsletter?.html ?? "", /Sponsored/);
    assert.doesNotMatch(state.generatedNewsletter?.plainText ?? "", /Sponsored/);
  });
});

test("generating a newsletter requires at least one selected story", async () => {
  await withWorkbench(async (service) => {
    await assert.rejects(
      service.generateNewsletter(),
      (error: unknown) => error instanceof WorkbenchServiceError && error.code === "STORIES_REQUIRED",
    );
  });
});

test("generated newsletter persists and is marked stale after selection changes", async () => {
  await withWorkbench(async (service) => {
    await service.addStory(firstStoryId);
    await service.addOffer(firstOfferId);
    await service.addOffer(secondOfferId);
    await service.generateNewsletter();

    const generated = await service.load();
    await service.generateNewsletter();
    const regenerated = await service.load();
    await service.addOffer(thirdOfferId);
    const afterOfferChange = await service.load();
    await service.addStory(secondStoryId);
    const afterStoryChange = await service.load();

    assert.equal(generated.generatedNewsletterIsCurrent, true);
    assert.ok(generated.generatedNewsletter);
    assert.deepEqual(regenerated.generatedNewsletter, generated.generatedNewsletter);
    assert.match(generated.generatedNewsletter.html, /Aurora Grid Reports Higher Storage Orders/);
    assert.match(generated.generatedNewsletter.html, /Harborline Savings/);
    assert.match(generated.generatedNewsletter.html, /Northstar Brokerage/);
    assert.match(generated.generatedNewsletter.plainText, /Sponsored/);
    assert.equal(afterOfferChange.generatedNewsletterIsCurrent, false);
    assert.deepEqual(afterOfferChange.generatedNewsletter, generated.generatedNewsletter);
    assert.equal(afterStoryChange.generatedNewsletterIsCurrent, false);
  });
});
