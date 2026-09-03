import type { ApprovedNewsletterSnapshot } from "@/src/domain/approval";
import type { RealWordPressConfig } from "@/src/adapters/publishing/wordpress-config";
import {
  asPublishedPost,
  formatClientRejection,
  isTimeoutError,
  readJsonPayload,
  sanitizeDiagnostic,
  WORDPRESS_REQUEST_TIMEOUT_MS,
  wordpressCreatePostUrl,
  wordpressGetPostUrl,
  wordpressUpdatePostUrl,
} from "@/src/adapters/publishing/wordpress-http";
import {
  NEWSLETTER_WORDPRESS_PROVIDER,
  type NewsletterPublicationResult,
  type NewsletterPublisher,
} from "@/src/publishing/newsletter-publisher";

export const NEWSLETTER_POC_TAG = "poc-newsletter";
export const NEWSLETTER_APPROVAL_MARKER_PREFIX = "newsletter-approval-fingerprint:";

export type WordPressComNewsletterDependencies = {
  fetch?: typeof fetch;
};

export class WordPressComNewsletterPublisher implements NewsletterPublisher {
  readonly provider = NEWSLETTER_WORDPRESS_PROVIDER;
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly config: RealWordPressConfig,
    dependencies: WordPressComNewsletterDependencies = {},
  ) {
    this.fetchImpl = dependencies.fetch ?? fetch;
  }

  async publish(approvedSnapshot: ApprovedNewsletterSnapshot): Promise<NewsletterPublicationResult> {
    return this.write("create", approvedSnapshot);
  }

  async update(
    externalPostId: string,
    approvedSnapshot: ApprovedNewsletterSnapshot,
  ): Promise<NewsletterPublicationResult> {
    return this.write("update", approvedSnapshot, externalPostId);
  }

  async readExisting(externalPostId: string): Promise<NewsletterPublicationResult> {
    if (!this.isConfigured() || !externalPostId.trim()) {
      return this.failure(
        "WordPress.com is not configured with a numeric test-site ID and server-side access token.",
        "",
      );
    }

    let response: Response;
    try {
      response = await this.fetchImpl(
        `${wordpressGetPostUrl(this.config.siteId, externalPostId)}?context=edit`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${this.config.accessToken}`,
          },
          signal: AbortSignal.timeout(WORDPRESS_REQUEST_TIMEOUT_MS),
        },
      );
    } catch (error) {
      if (isTimeoutError(error)) {
        return this.unknown(
          "The WordPress.com read timed out; the existing post was not modified.",
          "",
          externalPostId,
        );
      }
      return this.unknown(
        "A network error prevented confirming the existing WordPress.com post.",
        "",
        externalPostId,
      );
    }

    return this.normalizeResponse(response, "", externalPostId, "read");
  }

  private async write(
    operation: "create" | "update",
    approvedSnapshot: ApprovedNewsletterSnapshot,
    externalPostId?: string,
  ): Promise<NewsletterPublicationResult> {
    if (!this.isConfigured()) {
      return this.failure(
        "WordPress.com is not configured with a numeric test-site ID and server-side access token.",
        approvedSnapshot.approvalFingerprint,
        externalPostId,
      );
    }

    const url =
      operation === "create"
        ? wordpressCreatePostUrl(this.config.siteId)
        : wordpressUpdatePostUrl(this.config.siteId, externalPostId ?? "");
    const body = new URLSearchParams({
      title: wordpressNewsletterTitle(approvedSnapshot),
      content: wordpressNewsletterContent(approvedSnapshot),
      status: "publish",
      publicize: "false",
      tags: NEWSLETTER_POC_TAG,
    });

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
        signal: AbortSignal.timeout(WORDPRESS_REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const action = operation === "create" ? "created" : "updated";
      if (isTimeoutError(error)) {
        return this.unknown(
          `The WordPress.com request timed out; the newsletter post may or may not have been ${action}.`,
          approvedSnapshot.approvalFingerprint,
          externalPostId,
        );
      }
      return this.unknown(
        `A network error prevented confirming whether the WordPress.com newsletter post was ${action}.`,
        approvedSnapshot.approvalFingerprint,
        externalPostId,
      );
    }

    return this.normalizeResponse(
      response,
      approvedSnapshot.approvalFingerprint,
      externalPostId,
      operation,
    );
  }

  private async normalizeResponse(
    response: Response,
    approvalFingerprint: string,
    fallbackPostId: string | undefined,
    operation: "create" | "update" | "read",
  ): Promise<NewsletterPublicationResult> {
    const payload = await readJsonPayload(response);
    const action = operation === "read" ? "read request" : "publishing request";

    if (response.status >= 400 && response.status < 500) {
      return this.failure(
        formatClientRejection(response.status, payload, action),
        approvalFingerprint,
        fallbackPostId,
      );
    }

    if (response.status >= 500) {
      return this.unknown(
        operation === "read"
          ? "WordPress.com returned a server error; the existing post was not modified."
          : "WordPress.com returned a server error; the newsletter post may or may not have been written.",
        approvalFingerprint,
        fallbackPostId,
      );
    }

    if (!response.ok) {
      return this.unknown(
        operation === "read"
          ? "WordPress.com returned an unexpected response; the existing post was not modified."
          : "WordPress.com returned an unexpected response; the newsletter post may or may not have been written.",
        approvalFingerprint,
        fallbackPostId,
      );
    }

    const post = asPublishedPost(payload);
    if (!post) {
      return this.unknown(
        operation === "read"
          ? "WordPress.com returned an unexpected post representation; the existing post was not modified."
          : "WordPress.com returned an unexpected response; the newsletter post may or may not have been written.",
        approvalFingerprint,
        fallbackPostId,
      );
    }

    if (post.status !== "publish") {
      return this.unknown(
        operation === "read"
          ? "WordPress.com returned a post that is not published; no additional write was attempted."
          : "WordPress.com wrote a post but did not return a published status.",
        approvalFingerprint,
        post.id,
        post.url,
      );
    }

    return {
      status: "published",
      provider: NEWSLETTER_WORDPRESS_PROVIDER,
      externalPostId: post.id,
      url: post.url,
      approvalFingerprint,
    };
  }

  private isConfigured(): boolean {
    return /^\d+$/.test(this.config.siteId) && this.config.accessToken.length > 0;
  }

  private failure(
    diagnostic: string,
    approvalFingerprint: string,
    externalPostId?: string,
    url?: string,
  ): NewsletterPublicationResult {
    return {
      status: "failed",
      provider: NEWSLETTER_WORDPRESS_PROVIDER,
      diagnostic: sanitizeDiagnostic(diagnostic, this.config.accessToken),
      approvalFingerprint,
      ...(externalPostId ? { externalPostId } : {}),
      ...(url ? { url } : {}),
    };
  }

  private unknown(
    diagnostic: string,
    approvalFingerprint: string,
    externalPostId?: string,
    url?: string,
  ): NewsletterPublicationResult {
    return {
      status: "unknown",
      provider: NEWSLETTER_WORDPRESS_PROVIDER,
      diagnostic: sanitizeDiagnostic(diagnostic, this.config.accessToken),
      approvalFingerprint,
      ...(externalPostId ? { externalPostId } : {}),
      ...(url ? { url } : {}),
    };
  }
}

export function wordpressNewsletterTitle(snapshot: ApprovedNewsletterSnapshot): string {
  return `[POC] ${snapshot.subject}`;
}

export function wordpressNewsletterContent(snapshot: ApprovedNewsletterSnapshot): string {
  return [
    "<p><strong>POC TEST POST</strong> — Approved newsletter published by the Newsletter Automation Workbench. This is not production content.</p>",
    `<!-- ${NEWSLETTER_APPROVAL_MARKER_PREFIX} ${snapshot.approvalFingerprint} -->`,
    snapshot.html,
  ].join("");
}

export {
  wordpressCreatePostUrl,
  wordpressGetPostUrl,
  wordpressUpdatePostUrl,
};
