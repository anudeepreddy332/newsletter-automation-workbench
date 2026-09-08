import type { UaRule } from "@/src/click-quality/features/rules";
import { UA_CLASS_PRECEDENCE, type DerivedUaClass } from "@/src/click-quality/features/versions";

export function classifyUserAgent(userAgent: string | null, rules: readonly UaRule[]): DerivedUaClass | null {
  if (userAgent === null) {
    return null;
  }
  const matched = new Set<string>();
  for (const rule of rules) {
    if (userAgent.includes(rule.substring)) {
      matched.add(rule.class);
    }
  }
  for (const uaClass of UA_CLASS_PRECEDENCE) {
    if (matched.has(uaClass)) {
      return uaClass;
    }
  }
  return "unmatched";
}

export function isAutomationShapedUaClass(uaClass: DerivedUaClass | null): boolean {
  return uaClass === "known_scanner" || uaClass === "http_library" || uaClass === "headless_browser";
}
