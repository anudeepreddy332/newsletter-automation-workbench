import { createHash } from "node:crypto";

import type { NewsletterAssemblyInput } from "@/src/domain/newsletter";

export function fingerprintNewsletterInput(input: NewsletterAssemblyInput): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}
