import type {
  NewsletterAssemblyInput,
  NewsletterOfferInput,
  NewsletterStoryInput,
  RenderedNewsletter,
} from "@/src/domain/newsletter";
import {
  POC_SPONSORED_LABEL,
  placeNewsletterContent,
} from "@/src/newsletter/placement";

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function bodyParagraphs(body: string | undefined): string[] {
  return body?.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean) ?? [];
}

function firstStoryInput(input: NewsletterAssemblyInput): NewsletterStoryInput {
  const firstStory = input.blocks.find((block) => block.kind === "story");
  if (!firstStory || firstStory.kind !== "story") {
    throw new Error("Newsletter rendering requires at least one story block.");
  }
  return firstStory.story;
}

function newsletterSubject(input: NewsletterAssemblyInput): string {
  return firstStoryInput(input).title;
}

function newsletterPreheader(input: NewsletterAssemblyInput): string {
  return firstStoryInput(input).summary;
}

function renderStoryHtml(story: NewsletterStoryInput): string {
  const paragraphs = bodyParagraphs(story.body)
    .map((paragraph) => `    <p>${escapeHtml(paragraph)}</p>`)
    .join("\n");
  const bodyHtml = paragraphs.length > 0 ? `\n${paragraphs}` : "";
  return `  <article>
    <h2>${escapeHtml(story.title)}</h2>
    <p>${escapeHtml(story.summary)}</p>${bodyHtml}
    <p>Read more: ${escapeHtml(story.url)}</p>
  </article>`;
}

function renderSponsoredHtml(offer: NewsletterOfferInput): string {
  return `  <aside>
    <p>${escapeHtml(POC_SPONSORED_LABEL)}</p>
    <h2>${escapeHtml(offer.advertiserName)}</h2>
    <p>${escapeHtml(offer.offerName)}</p>
    <p>${escapeHtml(offer.trackingUrl)}</p>
  </aside>`;
}

function renderHtml(input: NewsletterAssemblyInput): string {
  const subject = newsletterSubject(input);
  const preheader = newsletterPreheader(input);
  const placement = placeNewsletterContent(input);
  const blocksHtml = placement.blocks
    .map((block) =>
      block.kind === "story" ? renderStoryHtml(block.story) : renderSponsoredHtml(block.offer),
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(subject)}</title>
</head>
<body>
  <h1>${escapeHtml(subject)}</h1>
  <p>${escapeHtml(preheader)}</p>
${blocksHtml}
</body>
</html>
`;
}

function renderStoryPlainText(story: NewsletterStoryInput): string {
  const paragraphs = bodyParagraphs(story.body);
  const body = paragraphs.length > 0 ? `\n\n${paragraphs.join("\n\n")}` : "";
  return `${story.title}

${story.summary}${body}

Read more: ${story.url}`;
}

function renderSponsoredPlainText(offer: NewsletterOfferInput): string {
  return `${POC_SPONSORED_LABEL}

${offer.advertiserName}
${offer.offerName}
${offer.trackingUrl}`;
}

function renderPlainText(input: NewsletterAssemblyInput): string {
  const subject = newsletterSubject(input);
  const preheader = newsletterPreheader(input);
  const placement = placeNewsletterContent(input);
  const blocksText = placement.blocks
    .map((block) =>
      block.kind === "story"
        ? renderStoryPlainText(block.story)
        : renderSponsoredPlainText(block.offer),
    )
    .join("\n\n");

  return `Subject: ${subject}

${preheader}

${blocksText}
`;
}

export function renderNewsletter(input: NewsletterAssemblyInput): RenderedNewsletter {
  if (!input.blocks.some((block) => block.kind === "story")) {
    throw new Error("Newsletter rendering requires at least one story block.");
  }

  return {
    subject: newsletterSubject(input),
    preheader: newsletterPreheader(input),
    html: renderHtml(input),
    plainText: renderPlainText(input),
  };
}
