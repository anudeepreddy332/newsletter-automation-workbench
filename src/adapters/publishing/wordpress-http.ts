export const WORDPRESS_REQUEST_TIMEOUT_MS = 20_000;

const MAX_PROVIDER_MESSAGE_LENGTH = 160;
const PROVIDER_ERROR_CODE_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

export type WordPressPublishedPost = {
  id: string;
  status: string;
  url: string;
  content?: string;
};

export function wordpressCreatePostUrl(siteId: string): string {
  return `https://public-api.wordpress.com/rest/v1.1/sites/${siteId}/posts/new`;
}

export function wordpressUpdatePostUrl(siteId: string, postId: string): string {
  return `https://public-api.wordpress.com/rest/v1.1/sites/${siteId}/posts/${postId}`;
}

export function wordpressGetPostUrl(siteId: string, postId: string): string {
  return `https://public-api.wordpress.com/rest/v1.1/sites/${siteId}/posts/${postId}`;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

export async function readJsonPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export function asPublishedPost(payload: unknown): WordPressPublishedPost | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  if (typeof record.error === "string" && record.error.length > 0) {
    return null;
  }

  const id = record.ID;
  const status = record.status;
  const url = record.URL;
  const idText = typeof id === "number" || typeof id === "string" ? String(id).trim() : "";
  if (!idText || idText === "0" || typeof status !== "string" || typeof url !== "string") {
    return null;
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    const content = typeof record.content === "string" ? record.content : undefined;
    return { id: idText, status, url: parsed.toString(), content };
  } catch {
    return null;
  }
}

export function formatClientRejection(
  status: number,
  payload: unknown,
  action = "publishing request",
): string {
  const prefix =
    status === 401 || status === 403
      ? "WordPress.com rejected the request because authentication or authorization failed"
      : `WordPress.com rejected the ${action}`;
  const details = [`HTTP ${status}`];
  const code = providerErrorCode(payload);
  if (code) {
    details.push(`code=${code}`);
  }
  const message = providerErrorMessage(payload);
  if (message) {
    details.push(message);
  }
  return `${prefix} (${details.join("; ")}).`;
}

export function sanitizeDiagnostic(diagnostic: string, accessToken: string): string {
  let sanitized = diagnostic;
  if (accessToken.length > 0) {
    sanitized = sanitized.split(accessToken).join("[redacted]");
  }
  return sanitized
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/[?&](access_token|token|password|client_secret)=[^&\s]+/gi, "[redacted]");
}

function providerErrorCode(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  const record = payload as Record<string, unknown>;
  for (const key of ["error", "code"] as const) {
    const value = record[key];
    if (typeof value === "string" && PROVIDER_ERROR_CODE_PATTERN.test(value)) {
      return value;
    }
  }
  return undefined;
}

function providerErrorMessage(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  const value = (payload as Record<string, unknown>).message;
  if (typeof value !== "string") {
    return undefined;
  }
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (!collapsed) {
    return undefined;
  }
  return collapsed.slice(0, MAX_PROVIDER_MESSAGE_LENGTH);
}
