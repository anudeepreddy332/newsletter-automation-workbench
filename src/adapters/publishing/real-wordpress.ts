import type { Story } from "@/src/domain/story";
import type {
  ContentPublisher,
  PublishingFailure,
  PublishingRequest,
  PublishingResult,
  PublishingUnknown,
} from "@/src/publishing/content-publisher";
import type { RealWordPressConfig } from "@/src/adapters/publishing/wordpress-config";
import {
  asPublishedPost,
  escapeHtml,
  formatClientRejection,
  isTimeoutError,
  readJsonPayload,
  sanitizeDiagnostic,
  WORDPRESS_REQUEST_TIMEOUT_MS,
  wordpressCreatePostUrl,
} from "@/src/adapters/publishing/wordpress-http";

export const REAL_WORDPRESS_PROVIDER = "WordPress.com";

export type RealWordPressDependencies = {
  fetch?: typeof fetch;
};

export class RealWordPress implements ContentPublisher {
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly config: RealWordPressConfig,
    dependencies: RealWordPressDependencies = {},
  ) {
    this.fetchImpl = dependencies.fetch ?? fetch;
  }

  async publish(request: PublishingRequest): Promise<PublishingResult> {
    if (!/^\d+$/.test(this.config.siteId) || this.config.accessToken.length === 0) {
      return this.failure(
        request.story.id,
        "WordPress.com is not configured with a numeric test-site ID and server-side access token.",
      );
    }

    const body = new URLSearchParams({
      title: request.story.title,
      content: buildControlledPostContent(request.story),
      status: "publish",
      publicize: "false",
    });

    let response: Response;
    try {
      response = await this.fetchImpl(wordpressCreatePostUrl(this.config.siteId), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
        signal: AbortSignal.timeout(WORDPRESS_REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      if (isTimeoutError(error)) {
        return this.unknown(
          request.story.id,
          "The WordPress.com request timed out; the post may or may not have been created.",
        );
      }
      return this.unknown(
        request.story.id,
        "A network error prevented confirming whether the WordPress.com post was created.",
      );
    }

    return this.normalizeResponse(request.story.id, response);
  }

  private async normalizeResponse(
    sourceStoryId: string,
    response: Response,
  ): Promise<PublishingResult> {
    const payload = await readJsonPayload(response);

    if (response.status >= 400 && response.status < 500) {
      return this.failure(
        sourceStoryId,
        formatClientRejection(response.status, payload),
      );
    }

    if (response.status >= 500) {
      return this.unknown(
        sourceStoryId,
        "WordPress.com returned a server error; the post may or may not have been created.",
      );
    }

    if (!response.ok) {
      return this.unknown(
        sourceStoryId,
        "WordPress.com returned an unexpected response; the post may or may not have been created.",
      );
    }

    const post = asPublishedPost(payload);
    if (!post) {
      return this.unknown(
        sourceStoryId,
        "WordPress.com returned an unexpected response; the post may or may not have been created.",
      );
    }

    if (post.status !== "publish") {
      return this.unknown(
        sourceStoryId,
        "WordPress.com created a post but did not return a published status.",
      );
    }

    return {
      sourceStoryId,
      provider: REAL_WORDPRESS_PROVIDER,
      mode: "real",
      status: "published",
      externalPostId: post.id,
      url: post.url,
    };
  }

  private failure(sourceStoryId: string, diagnostic: string): PublishingFailure {
    return {
      sourceStoryId,
      provider: REAL_WORDPRESS_PROVIDER,
      mode: "real",
      status: "failed",
      diagnostic: sanitizeDiagnostic(diagnostic, this.config.accessToken),
    };
  }

  private unknown(sourceStoryId: string, diagnostic: string): PublishingUnknown {
    return {
      sourceStoryId,
      provider: REAL_WORDPRESS_PROVIDER,
      mode: "real",
      status: "unknown",
      diagnostic: sanitizeDiagnostic(diagnostic, this.config.accessToken),
    };
  }
}

export function buildControlledPostContent(story: Story): string {
  const body = story.body?.trim() || story.summary;
  const paragraphs = body
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join("");

  return [
    "<p><strong>POC TEST POST</strong> — Created by the Newsletter Automation Workbench Phase 3B controlled integration test. This is not production content.</p>",
    paragraphs,
    "<p>Controlled fixture metadata:</p>",
    "<ul>",
    `<li>Source story ID: ${escapeHtml(story.id)}</li>`,
    `<li>Canonical URL: ${escapeHtml(story.canonicalUrl)}</li>`,
    `<li>Published at: ${escapeHtml(story.publishedAt)}</li>`,
    story.sourceAuthor
      ? `<li>Source author: ${escapeHtml(story.sourceAuthor)}</li>`
      : "",
    story.sourceItemId
      ? `<li>Source item ID: ${escapeHtml(story.sourceItemId)}</li>`
      : "",
    "</ul>",
  ]
    .filter(Boolean)
    .join("");
}

export { wordpressCreatePostUrl };
