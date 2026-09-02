import assert from "node:assert/strict";
import test from "node:test";

import {
  REAL_WORDPRESS_PROVIDER,
  RealWordPress,
  buildControlledPostContent,
  wordpressCreatePostUrl,
} from "@/src/adapters/publishing/real-wordpress";
import {
  WORDPRESS_ACCESS_TOKEN_ENV,
  WORDPRESS_SITE_ID_ENV,
  readRealWordPressConfig,
} from "@/src/adapters/publishing/wordpress-config";
import type { PublishingRequest } from "@/src/publishing/content-publisher";

const ACCESS_TOKEN = "test-token-secret-value-not-for-production";
const SITE_ID = "241031857";

const request: PublishingRequest = {
  draftId: "draft_controlled",
  publicationId: "publication_controlled",
  story: {
    id: "story_controlled",
    contentFeedId: "content_feed_controlled",
    title: "Controlled story",
    summary: "Controlled summary.",
    body: "First fictional paragraph.\n\nSecond fictional paragraph.",
    canonicalUrl: "https://fixture.example.test/news/controlled-story",
    publishedAt: "2026-09-02T06:00:00.000Z",
    sourceAuthor: "Market Desk",
    sourceItemId: "fixture-controlled",
  },
};

type CapturedRequest = {
  url: string;
  method: string;
  authorization: string | null;
  contentType: string | null;
  body: string;
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createFetch(response: Response | (() => Promise<Response> | Response)) {
  const captured: CapturedRequest[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const resolved = new Request(input, init);
    captured.push({
      url: resolved.url,
      method: resolved.method,
      authorization: resolved.headers.get("authorization"),
      contentType: resolved.headers.get("content-type"),
      body: await resolved.text(),
    });
    return typeof response === "function" ? response() : response;
  };
  return { captured, fetchImpl };
}

function assertNoSecret(value: unknown): void {
  const serialized = JSON.stringify(value);
  assert.equal(serialized.includes(ACCESS_TOKEN), false);
  assert.equal(/Bearer\s+(?!\[redacted\])\S+/i.test(serialized), false);
}

test("missing WordPress.com configuration does not create a real publisher config", () => {
  assert.equal(readRealWordPressConfig({}), null);
  assert.equal(
    readRealWordPressConfig({
      [WORDPRESS_SITE_ID_ENV]: "example.wordpress.com",
      [WORDPRESS_ACCESS_TOKEN_ENV]: ACCESS_TOKEN,
    }),
    null,
  );
  assert.equal(
    readRealWordPressConfig({
      [WORDPRESS_SITE_ID_ENV]: SITE_ID,
      [WORDPRESS_ACCESS_TOKEN_ENV]: "",
    }),
    null,
  );
  assert.deepEqual(
    readRealWordPressConfig({
      [WORDPRESS_SITE_ID_ENV]: SITE_ID,
      [WORDPRESS_ACCESS_TOKEN_ENV]: ACCESS_TOKEN,
    }),
    { siteId: SITE_ID, accessToken: ACCESS_TOKEN },
  );
});

test("RealWordPress constructs the official WordPress.com create-post request", async () => {
  const { captured, fetchImpl } = createFetch(jsonResponse(200, {
    ID: 88421,
    status: "publish",
    URL: "https://example.wordpress.com/2026/09/02/controlled-story/",
  }));
  const publisher = new RealWordPress(
    { siteId: SITE_ID, accessToken: ACCESS_TOKEN },
    { fetch: fetchImpl },
  );

  await publisher.publish(request);

  assert.equal(captured.length, 1);
  assert.equal(captured[0]?.url, wordpressCreatePostUrl(SITE_ID));
  assert.equal(captured[0]?.method, "POST");
  assert.equal(captured[0]?.contentType, "application/x-www-form-urlencoded");
  const body = new URLSearchParams(captured[0]?.body);
  assert.equal(body.get("title"), request.story.title);
  assert.equal(body.get("status"), "publish");
  assert.equal(body.get("publicize"), "false");
  assert.match(body.get("content") ?? "", /POC TEST POST/);
  assert.match(body.get("content") ?? "", /First fictional paragraph/);
  assert.match(body.get("content") ?? "", /Source story ID: story_controlled/);
  assert.equal(body.get("content"), buildControlledPostContent(request.story));
});

test("authorization exists only on the outbound server-side provider request", async () => {
  const { captured, fetchImpl } = createFetch(jsonResponse(200, {
    ID: 88421,
    status: "publish",
    URL: "https://example.wordpress.com/2026/09/02/controlled-story/",
  }));
  const publisher = new RealWordPress(
    { siteId: SITE_ID, accessToken: ACCESS_TOKEN },
    { fetch: fetchImpl },
  );

  const result = await publisher.publish(request);

  assert.equal(captured[0]?.authorization, `Bearer ${ACCESS_TOKEN}`);
  assert.equal(captured[0]?.url.includes(ACCESS_TOKEN), false);
  assert.equal(captured[0]?.body.includes(ACCESS_TOKEN), false);
  assertNoSecret(result);
});

test("a successful provider response normalizes to a real PublishingResult", async () => {
  const { fetchImpl } = createFetch(jsonResponse(200, {
    ID: 88421,
    status: "publish",
    URL: "https://example.wordpress.com/2026/09/02/controlled-story/",
    content: "raw provider body that must not leak",
  }));
  const publisher = new RealWordPress(
    { siteId: SITE_ID, accessToken: ACCESS_TOKEN },
    { fetch: fetchImpl },
  );

  const result = await publisher.publish(request);

  assert.deepEqual(result, {
    sourceStoryId: request.story.id,
    provider: REAL_WORDPRESS_PROVIDER,
    mode: "real",
    status: "published",
    externalPostId: "88421",
    url: "https://example.wordpress.com/2026/09/02/controlled-story/",
  });
  assert.equal("content" in result, false);
  assertNoSecret(result);
});

test("authentication and provider failures return sanitized real failures", async () => {
  for (const status of [401, 403, 400]) {
    const { captured, fetchImpl } = createFetch(jsonResponse(status, {
      error: "unauthorized",
      message: `secret ${ACCESS_TOKEN} must not leak`,
    }));
    const publisher = new RealWordPress(
      { siteId: SITE_ID, accessToken: ACCESS_TOKEN },
      { fetch: fetchImpl },
    );

    const result = await publisher.publish(request);

    assert.equal(captured.length, 1);
    assert.equal(result.status, "failed");
    assert.equal(result.mode, "real");
    assert.equal(result.provider, REAL_WORDPRESS_PROVIDER);
    if (result.status === "failed") {
      assert.match(result.diagnostic, new RegExp(`HTTP ${status}`));
      assert.match(result.diagnostic, /code=unauthorized/);
      assert.equal(result.diagnostic.includes(ACCESS_TOKEN), false);
      assert.equal(/Bearer\s+(?!\[redacted\])\S+/i.test(result.diagnostic), false);
      assert.match(result.diagnostic, /\[redacted\]/);
    }
    assertNoSecret(result);
  }
});

test("ordinary 4xx diagnostics include only allowlisted status, code, and sanitized message", async () => {
  const { fetchImpl } = createFetch(jsonResponse(400, {
    error: "invalid_input",
    message: "Publicize is not available for this site.",
    content: `raw body with ${ACCESS_TOKEN}`,
    authorization: `Bearer ${ACCESS_TOKEN}`,
    extra: { stack: "Error: nope" },
  }));
  const publisher = new RealWordPress(
    { siteId: SITE_ID, accessToken: ACCESS_TOKEN },
    { fetch: fetchImpl },
  );

  const result = await publisher.publish(request);

  assert.equal(result.status, "failed");
  if (result.status === "failed") {
    assert.equal(
      result.diagnostic,
      "WordPress.com rejected the publishing request (HTTP 400; code=invalid_input; Publicize is not available for this site.).",
    );
  }
  assert.equal(JSON.stringify(result).includes("raw body"), false);
  assert.equal(JSON.stringify(result).includes("Error: nope"), false);
  assertNoSecret(result);
});

test("unsafe provider error identifiers and headers are omitted from diagnostics", async () => {
  const { fetchImpl } = createFetch(jsonResponse(422, {
    error: "not a valid code <script>",
    code: "rest_cannot_create",
    message: `Authorization: Bearer ${ACCESS_TOKEN} was rejected`,
  }));
  const publisher = new RealWordPress(
    { siteId: SITE_ID, accessToken: ACCESS_TOKEN },
    { fetch: fetchImpl },
  );

  const result = await publisher.publish(request);

  assert.equal(result.status, "failed");
  if (result.status === "failed") {
    assert.match(result.diagnostic, /HTTP 422/);
    assert.match(result.diagnostic, /code=rest_cannot_create/);
    assert.doesNotMatch(result.diagnostic, /not a valid code/);
    assert.doesNotMatch(result.diagnostic, /<script>/);
    assert.match(result.diagnostic, /Bearer \[redacted\]/);
  }
  assertNoSecret(result);
});

test("network, timeout, server, and malformed outcomes are unknown and not retried by the adapter", async () => {
  const cases: Array<{ label: string; fetch: typeof fetch }> = [
    {
      label: "network",
      fetch: async () => {
        throw new TypeError("fetch failed");
      },
    },
    {
      label: "timeout",
      fetch: async () => {
        const error = new Error("timeout");
        error.name = "TimeoutError";
        throw error;
      },
    },
    {
      label: "server",
      fetch: async () => jsonResponse(503, { error: "server_error" }),
    },
    {
      label: "malformed",
      fetch: async () => jsonResponse(200, { title: "missing required fields" }),
    },
  ];

  for (const testCase of cases) {
    const publisher = new RealWordPress(
      { siteId: SITE_ID, accessToken: ACCESS_TOKEN },
      { fetch: testCase.fetch },
    );
    const result = await publisher.publish(request);
    assert.equal(result.status, "unknown", testCase.label);
    assert.equal(result.mode, "real", testCase.label);
    if (result.status === "unknown") {
      assert.match(
        result.diagnostic,
        /may or may not have been created|unexpected response|published status|prevented confirming/,
      );
    }
    assertNoSecret(result);
  }
});

test("invalid adapter configuration prevents a real request", async () => {
  const { captured, fetchImpl } = createFetch(jsonResponse(200, {
    ID: 1,
    status: "publish",
    URL: "https://example.wordpress.com/post/",
  }));
  const publisher = new RealWordPress(
    { siteId: "not-numeric.wordpress.com", accessToken: ACCESS_TOKEN },
    { fetch: fetchImpl },
  );

  const result = await publisher.publish(request);

  assert.equal(captured.length, 0);
  assert.equal(result.status, "failed");
  assert.equal(result.mode, "real");
  assertNoSecret(result);
});
