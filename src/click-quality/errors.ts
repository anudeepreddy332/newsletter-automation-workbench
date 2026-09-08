export class ClickQualityValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClickQualityValidationError";
  }
}

export class ClickQualityIdentityConflictError extends Error {
  readonly eventId: string;

  constructor(eventId: string, message: string) {
    super(message);
    this.name = "ClickQualityIdentityConflictError";
    this.eventId = eventId;
  }
}

export class ClickQualityFeatureConflictError extends Error {
  readonly eventId: string;

  constructor(eventId: string, message: string) {
    super(message);
    this.name = "ClickQualityFeatureConflictError";
    this.eventId = eventId;
  }
}
