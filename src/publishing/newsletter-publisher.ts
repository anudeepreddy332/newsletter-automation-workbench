import type { ApprovedNewsletterSnapshot } from "@/src/domain/approval";

export const NEWSLETTER_WORDPRESS_PROVIDER = "WordPress.com";

export type NewsletterPublicationStatus = "published" | "failed" | "unknown";

export type NewsletterPublication = {
  draftId: string;
  provider: string;
  status: NewsletterPublicationStatus;
  externalPostId: string | null;
  url: string | null;
  approvalFingerprint: string;
  diagnostic: string | null;
};

export type NewsletterPublicationSuccess = {
  status: "published";
  provider: string;
  externalPostId: string;
  url: string;
  approvalFingerprint: string;
};

export type NewsletterPublicationFailure = {
  status: "failed";
  provider: string;
  diagnostic: string;
  approvalFingerprint: string;
  externalPostId?: string;
  url?: string;
};

export type NewsletterPublicationUnknown = {
  status: "unknown";
  provider: string;
  diagnostic: string;
  approvalFingerprint: string;
  externalPostId?: string;
  url?: string;
};

export type NewsletterPublicationResult =
  | NewsletterPublicationSuccess
  | NewsletterPublicationFailure
  | NewsletterPublicationUnknown;

export interface NewsletterPublisher {
  readonly provider: string;
  publish(approvedSnapshot: ApprovedNewsletterSnapshot): Promise<NewsletterPublicationResult>;
  update(
    externalPostId: string,
    approvedSnapshot: ApprovedNewsletterSnapshot,
  ): Promise<NewsletterPublicationResult>;
  readExisting(externalPostId: string): Promise<NewsletterPublicationResult>;
}

export function isPublishedNewsletter(
  result: NewsletterPublication | NewsletterPublicationResult | null | undefined,
): result is NewsletterPublicationSuccess | (NewsletterPublication & { status: "published"; externalPostId: string; url: string }) {
  return (
    result?.status === "published" &&
    typeof result.externalPostId === "string" &&
    result.externalPostId.length > 0 &&
    typeof result.url === "string" &&
    result.url.length > 0
  );
}
