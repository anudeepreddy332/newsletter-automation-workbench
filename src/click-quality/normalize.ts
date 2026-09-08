import type { ClickQualityEvent } from "@/src/click-quality/contract";
import { validateClickQualityEvent, validateClickQualityEventBatch } from "@/src/click-quality/validate";

export function normalizeClickQualityEvent(payload: unknown, index = 0): ClickQualityEvent {
  return validateClickQualityEvent(payload, index);
}

export function normalizeClickQualityEventBatch(payload: unknown): ClickQualityEvent[] {
  return validateClickQualityEventBatch(payload);
}
