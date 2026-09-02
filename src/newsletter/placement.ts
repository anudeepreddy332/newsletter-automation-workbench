import type {
  NewsletterAssemblyInput,
  NewsletterOfferInput,
  NewsletterStoryInput,
} from "@/src/domain/newsletter";

export const POC_SPONSORED_LINKS_HEADING = "Sponsored links";

export type NewsletterPlacement = {
  stories: readonly NewsletterStoryInput[];
  sponsoredOffers: readonly NewsletterOfferInput[];
};

/**
 * This is a deterministic POC placement convention, not the target production placement policy.
 * Selected offers stay separate from editorial stories and appear only as a final
 * sponsored-links list in selection order.
 */
export function placeNewsletterContent(input: NewsletterAssemblyInput): NewsletterPlacement {
  return {
    stories: input.stories,
    sponsoredOffers: input.offers,
  };
}
