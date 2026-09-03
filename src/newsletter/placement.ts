import type { NewsletterAssemblyInput, NewsletterBlockInput } from "@/src/domain/newsletter";

export const POC_SPONSORED_LABEL = "Sponsored";

export type NewsletterPlacement = {
  blocks: readonly NewsletterBlockInput[];
};

/**
 * Human layout order is the placement policy for this POC. The renderer consumes
 * the unified mixed-block layout as-is and does not regroup, insert, or
 * automatically place advertisements. This is not the target production placement policy.
 */
export function placeNewsletterContent(input: NewsletterAssemblyInput): NewsletterPlacement {
  return {
    blocks: input.blocks,
  };
}
