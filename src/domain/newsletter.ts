export type NewsletterStoryInput = {
  title: string;
  summary: string;
  body?: string;
  url: string;
};

export type NewsletterOfferInput = {
  advertiserName: string;
  offerName: string;
  trackingUrl: string;
};

export type NewsletterAssemblyInput = {
  stories: NewsletterStoryInput[];
  offers: NewsletterOfferInput[];
};

export type RenderedNewsletter = {
  subject: string;
  preheader: string;
  html: string;
  plainText: string;
};

export type GeneratedNewsletter = RenderedNewsletter & {
  inputFingerprint: string;
};
