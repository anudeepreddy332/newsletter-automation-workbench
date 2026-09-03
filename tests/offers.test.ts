import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { MOCK_OFFER_CATALOG, MockEverflowOfferCatalog } from "@/src/adapters/offers/mock-everflow";
import { BenzingaShapedFixtureSource } from "@/src/adapters/rss/benzinga-shaped-rss";
import { MockWordPress } from "@/src/adapters/publishing/mock-wordpress";
import { openContentDatabase } from "@/src/db/database";
import { applyContentFoundationMigrations } from "@/src/db/migrate";
import type { ContentDatabase } from "@/src/db/database";
import { draftBlocks } from "@/src/db/schema";
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

async function withWorkbench(
  run: (service: WorkbenchService, db: ContentDatabase) => Promise<void>,
): Promise<void> {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "newsletter-offers-"));
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
    await run(service, db);
  } finally {
    client.close();
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function installNetworkGuard(): () => void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("Phase 4 tests must not make a real network request.");
  }) as typeof fetch;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

test("the mock offer catalog is deterministic and contains five controlled offers", () => {
  const restoreFetch = installNetworkGuard();
  try {
    const first = new MockEverflowOfferCatalog().list();
    const second = new MockEverflowOfferCatalog().list();

    assert.equal(first.length, 5);
    assert.deepEqual(second, first);
    assert.deepEqual(first, MOCK_OFFER_CATALOG);
    for (const offer of first) {
      assert.ok(offer.id);
      assert.ok(offer.advertiserName);
      assert.ok(offer.offerName);
      assert.match(offer.trackingUrl, /^https:\/\/offers-fixture\.test\//);
    }
  } finally {
    restoreFetch();
  }
});

test("multiple offers can be selected in deterministic order", async () => {
  const restoreFetch = installNetworkGuard();
  try {
    await withWorkbench(async (service) => {
      await service.addOffer(secondOfferId);
      await service.addOffer(firstOfferId);
      await service.addOffer(thirdOfferId);

      assert.deepEqual(
        (await service.load()).draft.selectedOffers.map((offer) => offer.id),
        [secondOfferId, firstOfferId, thirdOfferId],
      );
    });
  } finally {
    restoreFetch();
  }
});

test("duplicate offer selection is prevented", async () => {
  await withWorkbench(async (service) => {
    await service.addOffer(firstOfferId);
    await service.addOffer(firstOfferId);

    assert.deepEqual(
      (await service.load()).draft.selectedOffers.map((offer) => offer.id),
      [firstOfferId],
    );
  });
});

test("offer removal persists and keeps remaining selection order", async () => {
  await withWorkbench(async (service) => {
    await service.addOffer(firstOfferId);
    await service.addOffer(secondOfferId);
    await service.addOffer(thirdOfferId);
    await service.removeOffer(secondOfferId);

    assert.deepEqual(
      (await service.load()).draft.selectedOffers.map((offer) => offer.id),
      [firstOfferId, thirdOfferId],
    );
  });
});

test("offer selection persists across reload", async () => {
  await withWorkbench(async (service) => {
    await service.addOffer(thirdOfferId);
    await service.addOffer(firstOfferId);
    const firstLoad = await service.load();
    const secondLoad = await service.load();

    assert.deepEqual(
      firstLoad.draft.selectedOffers.map((offer) => offer.id),
      [thirdOfferId, firstOfferId],
    );
    assert.deepEqual(secondLoad.draft.selectedOffers, firstLoad.draft.selectedOffers);
  });
});

test("stories and offers remain separate domain concepts", async () => {
  await withWorkbench(async (service, db) => {
    await service.addStory(firstStoryId);
    await service.addStory(secondStoryId);
    await service.addOffer(firstOfferId);
    await service.addOffer(secondOfferId);
    const state = await service.load();

    assert.deepEqual(
      state.draft.selectedStories.map((story) => story.id),
      [firstStoryId, secondStoryId],
    );
    assert.deepEqual(
      state.draft.selectedOffers.map((offer) => offer.id),
      [firstOfferId, secondOfferId],
    );
    assert.equal(
      state.draft.selectedStories.some((story) => story.id === firstOfferId),
      false,
    );
    assert.equal(
      state.draft.selectedOffers.some((offer) => offer.id === firstStoryId),
      false,
    );
    assert.equal(db.select().from(draftBlocks).all().length, 4);
  });
});

test("an unknown offer ID is rejected safely", async () => {
  await withWorkbench(async (service) => {
    await assert.rejects(
      service.addOffer("offer_unknown"),
      (error: unknown) => error instanceof WorkbenchServiceError && error.code === "UNKNOWN_OFFER",
    );
  });
});
