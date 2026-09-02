import type { NewsletterAssemblyInput, RenderedNewsletter } from "@/src/domain/newsletter";
import {
  POC_SPONSORED_LINKS_HEADING,
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

function newsletterSubject(input: NewsletterAssemblyInput): string {
  const firstStory = input.stories[0];
  if (!firstStory) {
    throw new Error("Newsletter rendering requires at least one selected story.");
  }
  return firstStory.title;
}

function newsletterPreheader(input: NewsletterAssemblyInput): string {
  const firstStory = input.stories[0];
  if (!firstStory) {
    throw new Error("Newsletter rendering requires at least one selected story.");
  }
  return firstStory.summary;
}

function renderHtml(input: NewsletterAssemblyInput): string {
  const subject = newsletterSubject(input);
  const preheader = newsletterPreheader(input);
  const placement = placeNewsletterContent(input);

  const storyHtml = placement.stories
    .map((story) => {
      const paragraphs = bodyParagraphs(story.body)
        .map((paragraph) => `    <p>${escapeHtml(paragraph)}</p>`)
        .join("\n");
      const bodyHtml = paragraphs.length > 0 ? `\n${paragraphs}` : "";
      return `  <article>
    <h2>${escapeHtml(story.title)}</h2>
    <p>${escapeHtml(story.summary)}</p>${bodyHtml}
    <p>Read more: ${escapeHtml(story.url)}</p>
  </article>`;
    })
    .join("\n");

  const sponsoredHtml = placement.sponsoredOffers.length === 0
    ? ""
    : `
  <section>
    <h2>${escapeHtml(POC_SPONSORED_LINKS_HEADING)}</h2>
    <ul>
${placement.sponsoredOffers
    .map(
      (offer) =>
        `      <li>${escapeHtml(offer.advertiserName)} — ${escapeHtml(offer.offerName)}: ${escapeHtml(offer.trackingUrl)}</li>`,
    )
    .join("\n")}
    </ul>
  </section>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(subject)}</title>
</head>
<body>
  <h1>${escapeHtml(subject)}</h1>
  <p>${escapeHtml(preheader)}</p>
${storyHtml}${sponsoredHtml}
</body>
</html>
`;
}

function renderPlainText(input: NewsletterAssemblyInput): string {
  const subject = newsletterSubject(input);
  const preheader = newsletterPreheader(input);
  const placement = placeNewsletterContent(input);

  const storyText = placement.stories
    .map((story, index) => {
      const paragraphs = bodyParagraphs(story.body);
      const body = paragraphs.length > 0 ? `\n\n${paragraphs.join("\n\n")}` : "";
      return `${index + 1}. ${story.title}

${story.summary}${body}

Read more: ${story.url}`;
    })
    .join("\n\n");

  const sponsoredText = placement.sponsoredOffers.length === 0
    ? ""
    : `

${POC_SPONSORED_LINKS_HEADING}

${placement.sponsoredOffers
    .map((offer) => `• ${offer.advertiserName} — ${offer.offerName}\n  ${offer.trackingUrl}`)
    .join("\n")}`;

  return `Subject: ${subject}

${preheader}

${storyText}${sponsoredText}
`;
}

export function renderNewsletter(input: NewsletterAssemblyInput): RenderedNewsletter {
  if (input.stories.length === 0) {
    throw new Error("Newsletter rendering requires at least one selected story.");
  }

  return {
    subject: newsletterSubject(input),
    preheader: newsletterPreheader(input),
    html: renderHtml(input),
    plainText: renderPlainText(input),
  };
}
