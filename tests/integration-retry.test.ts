import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { MockWordPress } from "@/src/adapters/publishing/mock-wordpress";
import { MockIterable } from "@/src/adapters/staging/mock-iterable";
import { BenzingaShapedFixtureSource } from "@/src/adapters/rss/benzinga-shaped-rss";
import { openContentDatabase } from "@/src/db/database";
import { applyContentFoundationMigrations } from "@/src/db/migrate";
import { FastApiOfferSource } from "@/src/integration/http/fastapi-offer-source";
import { FastApiStorySource } from "@/src/integration/http/fastapi-story-source";
import {
  INTEGRATION_RETRY_MAX_ATTEMPTS,
  IntegrationAttemptTimeoutError,
  backoffCapMs,
  fetchWithRetry,
  jitteredBackoffMs,
  parseRetryAfterMs,
  type FetchLike,
} from "@/src/integration/http/retry";
import { IntegrationHttpError } from "@/src/integration/http/stories-response";
import { SqliteOfferCatalog } from "@/src/integration/offers/sqlite-offer-catalog";
import { ContentRepository } from "@/src/repositories/content-repository";
import { OfferSnapshotRepository } from "@/src/repositories/offer-snapshot-repository";
import { WorkbenchRepository } from "@/src/repositories/workbench-repository";
import { WorkbenchService } from "@/src/workbench/workbench-service";

const firstStoryId = "story_6c43c8a1944281017858d68b";
const firstActiveOfferId = "offer_9b274df57cc91d06448f3d48";
const rssFixturePath = path.join(
  process.cwd(),
  "tests/fixtures/benzinga-shaped-financial-news.xml",
);
const storyFixture = JSON.parse(
  readFileSync(path.join(process.cwd(), "tests/fixtures/integration-stories-response.json"), "utf8"),
) as unknown;
const offerFixture = JSON.parse(
  readFileSync(path.join(process.cwd(), "tests/fixtures/integration-offers-response.json"), "utf8"),
) as unknown;

const noopSleep = async () => undefined;

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

type TrackedFetch = FetchLike & { calls: number };

function sequencedFetch(responses: Array<Response | Error>): TrackedFetch {
  const fetchImpl = (async () => {
    const next = responses[fetchImpl.calls] ?? responses[responses.length - 1];
    fetchImpl.calls += 1;
    if (next instanceof Error) {
      throw next;
    }
    return next;
  }) as unknown as TrackedFetch;
  fetchImpl.calls = 0;
  return fetchImpl;
}

async function withTrackedRetry(
  responses: Array<Response | Error>,
  options: {
    random?: () => number;
    now?: () => number;
    sleeps?: number[];
  } = {},
): Promise<{ response: Response; sleeps: number[]; calls: number }> {
  const sleeps: number[] = options.sleeps ?? [];
  const fetchImpl = sequencedFetch(responses);
  const response = await fetchWithRetry("http://127.0.0.1:9/stories", { method: "GET" }, {
    fetch: fetchImpl,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    random: options.random ?? (() => 0),
    now: options.now ?? (() => 0),
  });
  return { response, sleeps, calls: fetchImpl.calls };
}

test("503 -> 200 succeeds on second attempt", async () => {
  const source = new FastApiStorySource(
    "http://127.0.0.1:8000",
    sequencedFetch([jsonResponse({ error: "busy" }, 503), jsonResponse(storyFixture)]),
    { sleep: noopSleep, random: () => 0, now: () => 0 },
  );
  const batch = await source.read();
  assert.equal(batch.stories.length, 5);
});

test("502 -> 200 succeeds", async () => {
  const { response, calls } = await withTrackedRetry([
    jsonResponse({ error: "bad gateway" }, 502),
    jsonResponse(storyFixture),
  ]);
  assert.equal(response.status, 200);
  assert.equal(calls, 2);
});

test("504 -> 200 succeeds", async () => {
  const { response, calls } = await withTrackedRetry([
    jsonResponse({ error: "timeout" }, 504),
    jsonResponse(offerFixture),
  ]);
  assert.equal(response.status, 200);
  assert.equal(calls, 2);
});

test("429 -> 200 succeeds", async () => {
  const { response, calls } = await withTrackedRetry([
    jsonResponse({ error: "rate limited" }, 429),
    jsonResponse(storyFixture),
  ]);
  assert.equal(response.status, 200);
  assert.equal(calls, 2);
});

test("timeout -> later success", async () => {
  const fetchImpl = sequencedFetch([
    new IntegrationAttemptTimeoutError(),
    jsonResponse(storyFixture),
  ]);
  const source = new FastApiStorySource("http://127.0.0.1:8000", fetchImpl, {
    sleep: noopSleep,
    random: () => 0,
    now: () => 0,
  });
  const batch = await source.read();
  assert.equal(batch.stories.length, 5);
  assert.equal(fetchImpl.calls, 2);
});

test("exponential backoff bounds", () => {
  assert.equal(backoffCapMs(1), 250);
  assert.equal(backoffCapMs(2), 500);
  assert.equal(jitteredBackoffMs(1, () => 0), 0);
  assert.equal(jitteredBackoffMs(1, () => 1), 250);
  assert.equal(jitteredBackoffMs(2, () => 1), 500);
});

test("jitter uses injected random source", async () => {
  const { sleeps } = await withTrackedRetry(
    [jsonResponse({ error: "busy" }, 503), jsonResponse(storyFixture)],
    { random: () => 0.5 },
  );
  assert.deepEqual(sleeps, [125]);
});

test("Retry-After delay-seconds honored", async () => {
  const { sleeps, calls } = await withTrackedRetry(
    [
      jsonResponse({ error: "busy" }, 503, { "Retry-After": "1" }),
      jsonResponse(storyFixture),
    ],
    { random: () => 1 },
  );
  assert.deepEqual(sleeps, [1000]);
  assert.equal(calls, 2);
});

test("Retry-After HTTP-date honored", async () => {
  const now = Date.UTC(2026, 8, 8, 4, 45, 0);
  const retryAt = new Date(now + 2000).toUTCString();
  const { sleeps } = await withTrackedRetry(
    [
      jsonResponse({ error: "busy" }, 503, { "Retry-After": retryAt }),
      jsonResponse(storyFixture),
    ],
    { now: () => now, random: () => 1 },
  );
  assert.deepEqual(sleeps, [2000]);
});

test("malformed Retry-After falls back to normal backoff", async () => {
  const { sleeps } = await withTrackedRetry(
    [
      jsonResponse({ error: "busy" }, 503, { "Retry-After": "soon" }),
      jsonResponse(storyFixture),
    ],
    { random: () => 1 },
  );
  assert.deepEqual(sleeps, [250]);
});

test("past Retry-After falls back appropriately", async () => {
  const now = Date.UTC(2026, 8, 8, 4, 45, 0);
  const past = new Date(now - 5000).toUTCString();
  assert.equal(parseRetryAfterMs(past, now), null);
  const { sleeps } = await withTrackedRetry(
    [
      jsonResponse({ error: "busy" }, 503, { "Retry-After": past }),
      jsonResponse(storyFixture),
    ],
    { now: () => now, random: () => 1 },
  );
  assert.deepEqual(sleeps, [250]);
});

test("Retry-After exceeding remaining deadline stops", async () => {
  const { response, sleeps, calls } = await withTrackedRetry([
    jsonResponse({ error: "busy" }, 503, { "Retry-After": "10" }),
    jsonResponse(storyFixture),
  ]);
  assert.equal(response.status, 503);
  assert.deepEqual(sleeps, []);
  assert.equal(calls, 1);
});

test("exactly 3 total attempts maximum", async () => {
  const fetchImpl = sequencedFetch([
    jsonResponse({ error: "busy" }, 503),
    jsonResponse({ error: "busy" }, 503),
    jsonResponse({ error: "busy" }, 503),
    jsonResponse(storyFixture),
  ]);
  const response = await fetchWithRetry("http://127.0.0.1:9/stories", undefined, {
    fetch: fetchImpl,
    sleep: noopSleep,
    random: () => 0,
    now: () => 0,
  });
  assert.equal(response.status, 503);
  assert.equal(fetchImpl.calls, INTEGRATION_RETRY_MAX_ATTEMPTS);
});

test("exhausted retries fail cleanly", async () => {
  const fetchImpl = sequencedFetch([new Error("connect ECONNREFUSED")]);
  const source = new FastApiStorySource("http://127.0.0.1:8000", fetchImpl, {
    sleep: noopSleep,
    random: () => 0,
    now: () => 0,
  });
  await assert.rejects(
    () => source.read(),
    (error: unknown) =>
      error instanceof IntegrationHttpError && error.code === "STORIES_UNAVAILABLE",
  );
  assert.equal(fetchImpl.calls, 3);
});

for (const status of [400, 401, 403, 404, 422] as const) {
  test(`${status} is not retried`, async () => {
    const fetchImpl = sequencedFetch([
      jsonResponse({ error: "no" }, status),
      jsonResponse(storyFixture),
    ]);
    const source = new FastApiStorySource("http://127.0.0.1:8000", fetchImpl, {
      sleep: noopSleep,
    });
    await assert.rejects(
      () => source.read(),
      (error: unknown) =>
        error instanceof IntegrationHttpError && error.code === "STORIES_UNAVAILABLE",
    );
    assert.equal(fetchImpl.calls, 1);
  });
}

test("malformed JSON is not retried", async () => {
  const fetchImpl = sequencedFetch([
    new Response("{", { status: 200, headers: { "Content-Type": "application/json" } }),
    jsonResponse(storyFixture),
  ]);
  const source = new FastApiStorySource("http://127.0.0.1:8000", fetchImpl, {
    sleep: noopSleep,
  });
  await assert.rejects(
    () => source.read(),
    (error: unknown) =>
      error instanceof IntegrationHttpError && error.code === "MALFORMED_STORIES_JSON",
  );
  assert.equal(fetchImpl.calls, 1);
});

test("invalid contract is not retried", async () => {
  const fetchImpl = sequencedFetch([
    jsonResponse({ offers: [{ id: "offer_1" }] }),
    jsonResponse(offerFixture),
  ]);
  const source = new FastApiOfferSource("http://127.0.0.1:8000", fetchImpl, {
    sleep: noopSleep,
  });
  await assert.rejects(
    () => source.read(),
    (error: unknown) =>
      error instanceof IntegrationHttpError && error.code === "INVALID_OFFERS_RESPONSE",
  );
  assert.equal(fetchImpl.calls, 1);
});

test("story refresh failure preserves local story state", async () => {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "newsletter-retry-stories-"));
  const { client, db } = openContentDatabase(path.join(temporaryDirectory, "drill.db"));
  applyContentFoundationMigrations(db);
  let fail = false;
  const fetchImpl: FetchLike = async () => {
    if (fail) {
      throw new Error("connect ECONNRESET");
    }
    return jsonResponse(storyFixture);
  };
  const service = new WorkbenchService(
    new FastApiStorySource("http://127.0.0.1:8000", fetchImpl, {
      sleep: noopSleep,
      random: () => 0,
      now: () => 0,
    }),
    new ContentRepository(db),
    new WorkbenchRepository(db),
    new MockWordPress(),
  );
  try {
    await service.fetchLatestStories();
    await service.addStory(firstStoryId);
    fail = true;
    await assert.rejects(() => service.fetchLatestStories(), IntegrationHttpError);
    const after = await service.load();
    assert.equal(after.availableStories.length, 5);
    assert.equal(after.draft.selectedStories[0]?.id, firstStoryId);
  } finally {
    client.close();
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test("offer refresh failure preserves offer snapshot and selections", async () => {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "newsletter-retry-offers-"));
  const { client, db } = openContentDatabase(path.join(temporaryDirectory, "drill.db"));
  applyContentFoundationMigrations(db);
  let fail = false;
  const fetchImpl: FetchLike = async () => {
    if (fail) {
      return jsonResponse({ error: "busy" }, 503);
    }
    return jsonResponse(offerFixture);
  };
  const snapshots = new OfferSnapshotRepository(db);
  const service = new WorkbenchService(
    new BenzingaShapedFixtureSource(rssFixturePath),
    new ContentRepository(db),
    new WorkbenchRepository(db),
    new MockWordPress(),
    null,
    new SqliteOfferCatalog(snapshots),
    new MockIterable(),
    null,
    new FastApiOfferSource("http://127.0.0.1:8000", fetchImpl, {
      sleep: noopSleep,
      random: () => 0,
      now: () => 0,
    }),
    snapshots,
  );
  try {
    await service.fetchLatestStories();
    await service.fetchAdvertiserLinks();
    await service.addOffer(firstActiveOfferId);
    await service.addStory(firstStoryId);
    await service.generateNewsletter();
    const before = await service.load();
    fail = true;
    await assert.rejects(() => service.fetchAdvertiserLinks(), IntegrationHttpError);
    const after = await service.load();
    assert.equal(snapshots.count(), 10);
    assert.equal(after.availableOffers.length, 9);
    assert.equal(after.draft.selectedOffers[0]?.id, firstActiveOfferId);
    assert.equal(after.generatedNewsletter?.subject, before.generatedNewsletter?.subject);
  } finally {
    client.close();
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test("successful story fetch still works", async () => {
  const source = new FastApiStorySource(
    "http://127.0.0.1:8000",
    async () => jsonResponse(storyFixture),
    { sleep: noopSleep },
  );
  const batch = await source.read();
  assert.equal(batch.stories.length, 5);
  assert.equal(batch.stories[0]?.id, firstStoryId);
});

test("successful offer fetch still works", async () => {
  const source = new FastApiOfferSource(
    "http://127.0.0.1:8000",
    async () => jsonResponse(offerFixture),
    { sleep: noopSleep },
  );
  const offers = await source.read();
  assert.equal(offers.length, 10);
  assert.equal(offers[0]?.id, firstActiveOfferId);
});

test("loopback 503 then 200 is retried once", async () => {
  let hits = 0;
  const server = createServer((request, response) => {
    hits += 1;
    if (hits === 1) {
      response.writeHead(503, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "busy" }));
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(storyFixture));
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  try {
    const source = new FastApiStorySource(`http://127.0.0.1:${address.port}`, fetch, {
      sleep: noopSleep,
      random: () => 0,
      now: () => 0,
    });
    const batch = await source.read();
    assert.equal(hits, 2);
    assert.equal(batch.stories.length, 5);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
});
