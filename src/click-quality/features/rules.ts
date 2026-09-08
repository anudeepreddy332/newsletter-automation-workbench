import { readFile } from "node:fs/promises";
import path from "node:path";

import type { UaRuleClass } from "@/src/click-quality/features/versions";

export const CLICK_QUALITY_UA_RULES_PATH = path.join(
  process.cwd(),
  "tests/fixtures/click-quality/ua-rules.v1.json",
);

export const CLICK_QUALITY_ASN_RULES_PATH = path.join(
  process.cwd(),
  "tests/fixtures/click-quality/asn-rules.v1.json",
);

export type UaRule = {
  class: UaRuleClass;
  substring: string;
};

export type AsnRule = {
  asn: number;
  network_type: string;
  email_security: boolean;
};

type UaRulesFile = {
  schema_version: string;
  rules: UaRule[];
};

type AsnRulesFile = {
  schema_version: string;
  rules: AsnRule[];
};

export async function loadUaRules(filePath = CLICK_QUALITY_UA_RULES_PATH): Promise<UaRule[]> {
  const parsed = JSON.parse(await readFile(filePath, "utf8")) as UaRulesFile;
  if (parsed.schema_version !== "cq-ua-rules-v1" || !Array.isArray(parsed.rules)) {
    throw new Error("UA rules fixture is malformed.");
  }
  return parsed.rules;
}

export async function loadAsnRules(filePath = CLICK_QUALITY_ASN_RULES_PATH): Promise<AsnRule[]> {
  const parsed = JSON.parse(await readFile(filePath, "utf8")) as AsnRulesFile;
  if (parsed.schema_version !== "cq-asn-rules-v1" || !Array.isArray(parsed.rules)) {
    throw new Error("ASN rules fixture is malformed.");
  }
  return parsed.rules;
}
