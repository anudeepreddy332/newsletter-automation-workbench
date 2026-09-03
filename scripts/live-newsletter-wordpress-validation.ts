// Live WordPress CREATE/UPDATE helper. Not the demo path.
// Loads the token from the process environment or `.wordpress-demo-token`.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { mockEverflowOfferCatalog } from "@/src/adapters/offers/mock-everflow";
import { MockWordPress } from "@/src/adapters/publishing/mock-wordpress";
import { WordPressComNewsletterPublisher } from "@/src/adapters/publishing/wordpress-com-newsletter";
import { readRealWordPressConfig } from "@/src/adapters/publishing/wordpress-config";
import { BenzingaShapedFixtureSource } from "@/src/adapters/rss/benzinga-shaped-rss";
import { MockIterable } from "@/src/adapters/staging/mock-iterable";
import { openContentDatabase } from "@/src/db/database";
import { applyContentFoundationMigrations } from "@/src/db/migrate";
import { layoutBlockKey } from "@/src/domain/layout";
import { ContentRepository } from "@/src/repositories/content-repository";
import { WorkbenchRepository } from "@/src/repositories/workbench-repository";
import { WorkbenchService } from "@/src/workbench/workbench-service";
import { wordpressGetPostUrl } from "@/src/adapters/publishing/wordpress-http";
import { NEWSLETTER_WORDPRESS_PROVIDER } from "@/src/publishing/newsletter-publisher";

const firstStoryId = "story_6c43c8a1944281017858d68b";
const secondStoryId = "story_5c6a67b4a9b7cb360ddc7877";
const firstOfferId = "offer_harborline_savings";

function loadDemoAccessToken(): void {
  if (process.env.WORDPRESS_ACCESS_TOKEN) {
    return;
  }

  const tokenPath = path.join(process.cwd(), ".wordpress-demo-token");
  const token = readFileSync(tokenPath, "utf8").replace(/\r?\n$/, "");
  if (token.length === 0) {
    throw new Error("`.wordpress-demo-token` is empty. See docs/DEMO_RUN.md.");
  }
  process.env.WORDPRESS_ACCESS_TOKEN = token;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertOrder(haystack: string, needles: readonly string[], label: string): void {
  let from = 0;
  for (const needle of needles) {
    const index = haystack.indexOf(needle, from);
    assert(index >= 0, `${label} is missing ${needle}.`);
    from = index + needle.length;
  }
}

type ListedPost = { ID?: number; URL?: string; status?: string; title?: string };

async function listRecentPosts(siteId: string, accessToken: string): Promise<ListedPost[]> {
  const url = `https://public-api.wordpress.com/rest/v1.1/sites/${siteId}/posts?number=100&fields=ID,URL,status,title`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = (await response.json()) as { posts?: ListedPost[] };
  assert(response.ok, "Could not list WordPress.com posts for duplicate checks.");
  return payload.posts ?? [];
}

async function readPostContent(
  siteId: string,
  accessToken: string,
  postId: string,
): Promise<{ id: string; url: string; title: string; content: string }> {
  const response = await fetch(`${wordpressGetPostUrl(siteId, postId)}?context=edit`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = (await response.json()) as {
    ID?: number | string;
    URL?: string;
    title?: string;
    content?: string;
  };
  assert(response.ok, `Could not read WordPress.com post ${postId}.`);
  assert(payload.ID && payload.URL && payload.content, "WordPress.com post content was incomplete.");
  return {
    id: String(payload.ID),
    url: payload.URL,
    title: payload.title ?? "",
    content: payload.content,
  };
}

async function readPublicHtml(url: string): Promise<string> {
  const response = await fetch(url);
  assert(response.ok, `Public WordPress URL did not open: ${url}`);
  return response.text();
}

function contentMarkers(html: string): string[] {
  return [
    "Northline Retail Updates Its Seasonal Outlook",
    "Aurora Grid Reports Higher Storage Orders",
    "Harborline Savings",
  ]
    .map((needle) => ({ needle, index: html.indexOf(needle) }))
    .filter((item) => item.index >= 0)
    .sort((left, right) => left.index - right.index)
    .map((item) => item.needle);
}

async function main(): Promise<void> {
  loadDemoAccessToken();
  const config = readRealWordPressConfig();
  assert(config, "WORDPRESS_SITE_ID and WORDPRESS_ACCESS_TOKEN must be configured locally. See docs/DEMO_RUN.md.");

  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "newsletter-live-wp-"));
  const databasePath = path.join(temporaryDirectory, "workbench.db");
  const { client, db } = openContentDatabase(databasePath);
  applyContentFoundationMigrations(db);
  const service = new WorkbenchService(
    new BenzingaShapedFixtureSource(
      path.join(process.cwd(), "tests/fixtures/benzinga-shaped-financial-news.xml"),
    ),
    new ContentRepository(db),
    new WorkbenchRepository(db),
    new MockWordPress(),
    null,
    mockEverflowOfferCatalog,
    new MockIterable(),
    new WordPressComNewsletterPublisher(config),
  );

  try {
    const before = await listRecentPosts(config.siteId, config.accessToken);
    await service.fetchLatestStories();
    await service.addStories([firstStoryId, secondStoryId]);
    await service.addOffer(firstOfferId);
    await service.generateNewsletter();
    await service.approveNewsletter();
    const approved = (await service.load()).approvedNewsletter;
    assert(approved, "Approval did not persist.");
    const markers = contentMarkers(approved.html);
    assert(markers.length === 3, "Approved newsletter is missing expected Story and Sponsored evidence.");

    const existingPostId = process.env.LIVE_WORDPRESS_POST_ID?.trim();
    const existingPostUrl = process.env.LIVE_WORDPRESS_POST_URL?.trim();
    let created;
    if (existingPostId && existingPostUrl) {
      const observed = await readPostContent(config.siteId, config.accessToken, existingPostId);
      assert(observed.url === existingPostUrl, "Existing WordPress URL did not match the known CREATE result.");
      assertOrder(observed.content, markers, "Existing CREATE content");
      assert(observed.content.includes(approved.approvalFingerprint), "Existing WordPress post does not match this approved snapshot.");
      new WorkbenchRepository(db).saveNewsletterPublication(approved.draftId, {
        status: "published",
        provider: NEWSLETTER_WORDPRESS_PROVIDER,
        externalPostId: existingPostId,
        url: existingPostUrl,
        approvalFingerprint: approved.approvalFingerprint,
      });
      created = await service.publishApprovedNewsletter();
    } else {
      created = await service.publishApprovedNewsletter();
    }

    assert(created.status === "published", "CREATE did not publish.");
    assert(created.externalPostId, "CREATE did not return a post ID.");
    assert(created.url?.startsWith("https://"), "CREATE did not return a public HTTPS URL.");

    const afterCreate = await listRecentPosts(config.siteId, config.accessToken);
    const createContent = await readPostContent(config.siteId, config.accessToken, created.externalPostId!);
    const createHtml = await readPublicHtml(created.url!);
    assertOrder(createContent.content, markers, "CREATE API content");
    assert(createContent.content.includes("POC TEST POST"), "CREATE content is missing the POC safety label.");
    assert(createHtml.includes("Harborline Savings"), "Public CREATE URL did not include the approved newsletter body.");
    if (!existingPostId) {
      const beforeIds = new Set(before.map((post) => String(post.ID)));
      const newIds = afterCreate
        .map((post) => String(post.ID))
        .filter((id) => !beforeIds.has(id));
      assert(
        newIds.length === 1 && newIds[0] === created.externalPostId,
        "CREATE did not produce exactly one new newsletter WordPress post.",
      );
    }

    const repeated = await service.publishApprovedNewsletter();
    const afterRepeat = await listRecentPosts(config.siteId, config.accessToken);
    assert(repeated.externalPostId === created.externalPostId, "Idempotent publish changed the post ID.");
    assert(repeated.url === created.url, "Idempotent publish changed the public URL.");
    assert(
      afterRepeat.filter((post) => String(post.ID) === created.externalPostId).length === 1,
      "Idempotent publish created another WordPress post.",
    );

    await service.reorderLayout([
      layoutBlockKey({ kind: "sponsored", offerId: firstOfferId }),
      layoutBlockKey({ kind: "story", storyId: firstStoryId }),
      layoutBlockKey({ kind: "story", storyId: secondStoryId }),
    ]);
    const stale = await service.load();
    assert(!stale.generatedNewsletterIsCurrent, "Layout change did not stale generated output.");
    assert(!stale.approvalIsCurrent, "Layout change did not stale approval.");
    assert(!stale.newsletterPublicationIsCurrent, "Layout change did not stale WordPress publication.");

    await service.generateNewsletter();
    await service.approveNewsletter();
    const updatedApproved = (await service.load()).approvedNewsletter;
    assert(updatedApproved, "Updated approval did not persist.");
    const updated = await service.publishApprovedNewsletter();
    assert(updated.status === "published", "UPDATE did not publish.");
    assert(updated.externalPostId === created.externalPostId, "UPDATE changed the WordPress post ID.");
    assert(updated.url === created.url, "UPDATE changed the public WordPress URL.");

    const afterUpdate = await listRecentPosts(config.siteId, config.accessToken);
    const updateContent = await readPostContent(config.siteId, config.accessToken, updated.externalPostId!);
    const updateHtml = await readPublicHtml(updated.url!);
    assertOrder(
      updateContent.content,
      contentMarkers(updatedApproved.html),
      "UPDATE API content",
    );
    assert(updateHtml.includes("Harborline Savings"), "Public UPDATE URL did not include the approved newsletter body.");
    assert(
      afterUpdate.filter((post) => String(post.ID) === created.externalPostId).length === 1,
      "UPDATE created a second newsletter WordPress post.",
    );
    assert(
      !afterUpdate.some((post) => String(post.ID) !== created.externalPostId && (post.title ?? "").startsWith("[POC]")),
      "UPDATE created another POC newsletter WordPress post.",
    );

    process.stdout.write(
      [
        "LIVE_VALIDATION_OK",
        `postId=${created.externalPostId}`,
        `url=${created.url}`,
        `updatePostId=${updated.externalPostId}`,
        `updateUrl=${updated.url}`,
        `resumedExistingCreate=${Boolean(existingPostId)}`,
      ].join("\n") + "\n",
    );
  } finally {
    client.close();
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Live WordPress validation failed.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
