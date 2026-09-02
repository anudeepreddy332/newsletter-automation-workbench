import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { BenzingaShapedFixtureSource } from "@/src/adapters/rss/benzinga-shaped-rss";
import { MockWordPress } from "@/src/adapters/publishing/mock-wordpress";
import { openContentDatabase } from "@/src/db/database";
import { applyContentFoundationMigrations } from "@/src/db/migrate";
import type { NewsletterAssemblyInput } from "@/src/domain/newsletter";
import { buildNewsletterAssemblyInput } from "@/src/newsletter/assembly";
import { fingerprintNewsletterInput } from "@/src/newsletter/fingerprint";
import { POC_SPONSORED_LINKS_HEADING, placeNewsletterContent } from "@/src/newsletter/placement";
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
  stories: [
    {
      title: `Rates <script>alert("x")</script> & "quotes"`,
      summary: "A controlled summary with <b>markup</b>.",
      body: "First paragraph.\n\nSecond paragraph with & ampersands.",
      url: "https://fixture.example.test/news/controlled-story",
    },
    {
      title: "Second controlled story",
      summary: "Second summary.",
      url: "https://fixture.example.test/news/second-controlled-story",
    },
  ],
  offers: [
    {
      advertiserName: "Harborline Savings",
      offerName: "High-yield savings <trial>",
      trackingUrl: "https://offers-fixture.test/track/harborline-savings",
    },
    {
      advertiserName: "Northstar Brokerage",
      offerName: "Self-directed investing starter kit",
      trackingUrl: "https://offers-fixture.test/track/northstar-brokerage",
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
    assert.equal(first.subject, controlledInput.stories[0]?.title);
    assert.equal(first.preheader, controlledInput.stories[0]?.summary);
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

test("multiple offers appear in selection order in a final sponsored section", () => {
  const rendered = renderNewsletter(controlledInput);
  const placement = placeNewsletterContent(controlledInput);
  const htmlSponsoredIndex = rendered.html.indexOf(POC_SPONSORED_LINKS_HEADING);
  const firstStoryIndex = rendered.html.indexOf("Second controlled story");
  const firstOfferIndex = rendered.html.indexOf("Harborline Savings");
  const secondOfferIndex = rendered.html.indexOf("Northstar Brokerage");

  assert.deepEqual(
    placement.sponsoredOffers.map((offer) => offer.offerName),
    controlledInput.offers.map((offer) => offer.offerName),
  );
  assert.ok(htmlSponsoredIndex > firstStoryIndex);
  assert.ok(firstOfferIndex > htmlSponsoredIndex);
  assert.ok(secondOfferIndex > firstOfferIndex);
  assert.match(rendered.plainText, new RegExp(`${POC_SPONSORED_LINKS_HEADING}\\n\\n• Harborline Savings`));
  assert.equal(rendered.html.split(POC_SPONSORED_LINKS_HEADING).length - 1, 1);
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
        id: "story_controlled",
        contentFeedId: "content_feed_controlled",
        title: "Controlled story",
        summary: "Controlled summary.",
        canonicalUrl: "https://fixture.example.test/news/controlled-story",
        publishedAt: "2026-09-02T06:00:00.000Z",
      },
    ],
    [
      {
        id: "offer_controlled",
        advertiserName: "Harborline Savings",
        offerName: "High-yield savings account review",
        trackingUrl: "https://offers-fixture.test/track/harborline-savings",
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

  assert.deepEqual(input.stories[0], {
    title: "Controlled story",
    summary: "Controlled summary.",
    body: undefined,
    url: "https://wordpress-fixture.test/posts/mock_wp_controlled",
  });
  assert.equal("id" in input.offers[0]!, false);
  assert.equal("provider" in input.stories[0]!, false);
});

test("newsletter generation allows zero selected offers", async () => {
  await withWorkbench(async (service) => {
    await service.addStory(firstStoryId);
    await service.generateNewsletter();
    const state = await service.load();

    assert.equal(state.generatedNewsletterIsCurrent, true);
    assert.doesNotMatch(state.generatedNewsletter?.html ?? "", /Sponsored links/);
    assert.doesNotMatch(state.generatedNewsletter?.plainText ?? "", /Sponsored links/);
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
    assert.match(generated.generatedNewsletter.plainText, /Sponsored links/);
    assert.equal(afterOfferChange.generatedNewsletterIsCurrent, false);
    assert.deepEqual(afterOfferChange.generatedNewsletter, generated.generatedNewsletter);
    assert.equal(afterStoryChange.generatedNewsletterIsCurrent, false);
  });
});

test("no Phase 5 approval or Iterable behavior exists", () => {
  const roots = ["app", "src"];
  const files = roots.flatMap((root) => collectSourceFiles(path.join(process.cwd(), root)));

  for (const filePath of files) {
    const source = readFileSync(filePath, "utf8");
    assert.doesNotMatch(source, /MockIterable|stageToIterable|approveNewsletter|Iterable staging/);
  }
});

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const resolved = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectSourceFiles(resolved);
    }
    return /\.(ts|tsx)$/.test(entry.name) ? [resolved] : [];
  });
}
