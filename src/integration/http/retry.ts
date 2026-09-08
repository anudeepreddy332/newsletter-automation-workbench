export const INTEGRATION_RETRY_MAX_ATTEMPTS = 3;
export const INTEGRATION_RETRY_ATTEMPT_TIMEOUT_MS = 2000;
export const INTEGRATION_RETRY_BUDGET_MS = 8000;
export const INTEGRATION_RETRY_BASE_DELAY_MS = 250;
export const INTEGRATION_RETRY_MAX_DELAY_MS = 2000;

export const RETRYABLE_HTTP_STATUSES = [429, 502, 503, 504] as const;

const TRANSIENT_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ECONNABORTED",
  "EPIPE",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_SOCKET",
]);

const PERMANENT_ERROR_PATTERN =
  /CERT_|UNABLE_TO_VERIFY|ERR_TLS|ERR_SSL|SELF_SIGNED|DEPTH_ZERO_SELF_SIGNED|ERR_INVALID_URL|ERR_INVALID_PROTOCOL|ENOTFOUND|EPROTO/;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type IntegrationRetryOptions = {
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
};

export type IntegrationRetryDependencies = IntegrationRetryOptions & {
  fetch: FetchLike;
};

export class IntegrationAttemptTimeoutError extends Error {
  constructor() {
    super("The integration request timed out.");
    this.name = "IntegrationAttemptTimeoutError";
  }
}

export class IntegrationRequestCancelledError extends Error {
  constructor() {
    super("The integration request was cancelled.");
    this.name = "IntegrationRequestCancelledError";
  }
}

export function backoffCapMs(retryNumber: number): number {
  return Math.min(
    INTEGRATION_RETRY_MAX_DELAY_MS,
    INTEGRATION_RETRY_BASE_DELAY_MS * 2 ** (retryNumber - 1),
  );
}

export function jitteredBackoffMs(retryNumber: number, random: () => number): number {
  const unit = random();
  const capped = Number.isFinite(unit) ? Math.min(1, Math.max(0, unit)) : 0;
  return capped * backoffCapMs(retryNumber);
}

export function parseRetryAfterMs(value: string, nowMs: number): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed) * 1000;
  }

  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) {
    return null;
  }

  const delta = parsed - nowMs;
  if (delta < 0) {
    return null;
  }
  return delta;
}

export function isRetryableStatus(status: number): boolean {
  return (RETRYABLE_HTTP_STATUSES as readonly number[]).includes(status);
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  if ("code" in error && typeof error.code === "string") {
    return error.code;
  }

  if ("cause" in error && typeof error.cause === "object" && error.cause !== null && "code" in error.cause) {
    const causeCode = error.cause.code;
    return typeof causeCode === "string" ? causeCode : undefined;
  }

  return undefined;
}

function errorText(error: unknown): string {
  if (error instanceof Error) {
    const cause = error.cause instanceof Error ? ` ${error.cause.message}` : "";
    return `${error.name} ${error.message}${cause}`;
  }
  return String(error);
}

export function isRetryableTransportError(error: unknown): boolean {
  if (error instanceof IntegrationRequestCancelledError) {
    return false;
  }
  if (error instanceof IntegrationAttemptTimeoutError) {
    return true;
  }

  const code = errorCode(error);
  if (code && PERMANENT_ERROR_PATTERN.test(code)) {
    return false;
  }
  if (code && TRANSIENT_ERROR_CODES.has(code)) {
    return true;
  }

  const text = errorText(error);
  if (PERMANENT_ERROR_PATTERN.test(text)) {
    return false;
  }

  if (
    /ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|other side closed|fetch failed|network/i.test(
      text,
    )
  ) {
    return true;
  }

  return false;
}

export async function defaultSleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return;
  }
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function remainingBudgetMs(startedAt: number, now: () => number): number {
  return INTEGRATION_RETRY_BUDGET_MS - (now() - startedAt);
}

function retryAfterFromResponse(response: Response, nowMs: number): number | null {
  const header = response.headers.get("retry-after");
  if (header === null) {
    return null;
  }
  return parseRetryAfterMs(header, nowMs);
}

function delayBeforeRetry(options: {
  retryNumber: number;
  response: Response | undefined;
  random: () => number;
  nowMs: number;
}): number {
  if (options.response) {
    const retryAfterMs = retryAfterFromResponse(options.response, options.nowMs);
    if (retryAfterMs !== null) {
      return retryAfterMs;
    }
  }
  return jitteredBackoffMs(options.retryNumber, options.random);
}

async function fetchOnce(
  fetchImpl: FetchLike,
  input: string,
  init: RequestInit | undefined,
  timeoutMs: number,
): Promise<Response> {
  const callerSignal = init?.signal;
  if (callerSignal?.aborted) {
    throw new IntegrationRequestCancelledError();
  }

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new IntegrationAttemptTimeoutError());
  }, timeoutMs);

  const onCallerAbort = () => {
    controller.abort(callerSignal?.reason);
  };
  callerSignal?.addEventListener("abort", onCallerAbort, { once: true });

  try {
    return await fetchImpl(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (callerSignal?.aborted) {
      throw new IntegrationRequestCancelledError();
    }
    if (
      controller.signal.aborted &&
      (controller.signal.reason instanceof IntegrationAttemptTimeoutError ||
        (error instanceof DOMException && error.name === "AbortError") ||
        (error instanceof Error && error.name === "AbortError"))
    ) {
      throw new IntegrationAttemptTimeoutError();
    }
    throw error;
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", onCallerAbort);
  }
}

export async function fetchWithRetry(
  input: string,
  init: RequestInit | undefined,
  deps: IntegrationRetryDependencies,
): Promise<Response> {
  const sleep = deps.sleep ?? defaultSleep;
  const random = deps.random ?? Math.random;
  const now = deps.now ?? Date.now;
  const startedAt = now();

  let lastTransportError: unknown;
  let lastResponse: Response | undefined;

  for (let attempt = 1; attempt <= INTEGRATION_RETRY_MAX_ATTEMPTS; attempt += 1) {
    const remaining = remainingBudgetMs(startedAt, now);
    if (remaining <= 0) {
      break;
    }

    try {
      const response = await fetchOnce(
        deps.fetch,
        input,
        init,
        Math.min(INTEGRATION_RETRY_ATTEMPT_TIMEOUT_MS, remaining),
      );
      lastResponse = response;
      lastTransportError = undefined;

      if (response.ok || !isRetryableStatus(response.status)) {
        return response;
      }

      if (attempt === INTEGRATION_RETRY_MAX_ATTEMPTS) {
        return response;
      }

      const delayMs = delayBeforeRetry({
        retryNumber: attempt,
        response,
        random,
        nowMs: now(),
      });
      const remainingAfterDecision = remainingBudgetMs(startedAt, now);
      if (delayMs > remainingAfterDecision) {
        return response;
      }

      await sleep(delayMs);
    } catch (error) {
      if (error instanceof IntegrationRequestCancelledError) {
        throw error;
      }
      if (!isRetryableTransportError(error)) {
        throw error;
      }

      lastTransportError = error;
      lastResponse = undefined;

      if (attempt === INTEGRATION_RETRY_MAX_ATTEMPTS) {
        throw error;
      }

      const delayMs = delayBeforeRetry({
        retryNumber: attempt,
        response: undefined,
        random,
        nowMs: now(),
      });
      const remainingAfterDecision = remainingBudgetMs(startedAt, now);
      if (delayMs > remainingAfterDecision) {
        throw error;
      }

      await sleep(delayMs);
    }
  }

  if (lastResponse) {
    return lastResponse;
  }
  throw lastTransportError instanceof Error
    ? lastTransportError
    : new IntegrationAttemptTimeoutError();
}
