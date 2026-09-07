export const NEWSLETTER_INTEGRATION_MODE_ENV = "NEWSLETTER_INTEGRATION_MODE";
export const INTEGRATION_API_BASE_URL_ENV = "INTEGRATION_API_BASE_URL";

export type NewsletterIntegrationMode = "demo" | "drill";

export class IntegrationApiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IntegrationApiConfigError";
  }
}

export function readNewsletterIntegrationMode(
  env: NodeJS.Dict<string> = process.env,
): NewsletterIntegrationMode {
  const value = env[NEWSLETTER_INTEGRATION_MODE_ENV]?.trim() || "demo";
  if (value === "demo") {
    return "demo";
  }
  if (value === "drill") {
    return "drill";
  }
  throw new IntegrationApiConfigError(
    "NEWSLETTER_INTEGRATION_MODE must be demo or drill. The default is demo.",
  );
}

export function readIntegrationApiBaseUrl(
  env: NodeJS.Dict<string> = process.env,
): string {
  const raw = env[INTEGRATION_API_BASE_URL_ENV];
  if (raw === undefined || raw.trim() === "") {
    throw new IntegrationApiConfigError(
      "INTEGRATION_API_BASE_URL is required in drill mode. The default demo workbench does not need this variable.",
    );
  }

  const value = raw.trim();
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new IntegrationApiConfigError(
      "INTEGRATION_API_BASE_URL is malformed. Expected an http:// or https:// URL.",
    );
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new IntegrationApiConfigError(
      "INTEGRATION_API_BASE_URL must use http:// or https://.",
    );
  }

  if (!parsed.hostname) {
    throw new IntegrationApiConfigError(
      "INTEGRATION_API_BASE_URL is malformed. A hostname is required.",
    );
  }

  return value.replace(/\/+$/, "");
}
