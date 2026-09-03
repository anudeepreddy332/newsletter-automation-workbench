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

export type NewsletterStoryBlockInput = {
  kind: "story";
  story: NewsletterStoryInput;
};

export type NewsletterSponsoredBlockInput = {
  kind: "sponsored";
  offer: NewsletterOfferInput;
};

export type NewsletterBlockInput = NewsletterStoryBlockInput | NewsletterSponsoredBlockInput;

export type NewsletterAssemblyInput = {
  blocks: NewsletterBlockInput[];
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
