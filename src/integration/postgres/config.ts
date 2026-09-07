export const INTEGRATION_DATABASE_URL_ENV = "INTEGRATION_DATABASE_URL";

const POSTGRES_PROTOCOLS = new Set(["postgres:", "postgresql:"]);

export class IntegrationDatabaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IntegrationDatabaseConfigError";
  }
}

export type IntegrationDatabaseConfig = {
  url: string;
};

export function readIntegrationDatabaseConfig(
  env: NodeJS.Dict<string> = process.env,
): IntegrationDatabaseConfig {
  const raw = env[INTEGRATION_DATABASE_URL_ENV];
  if (raw === undefined || raw.trim() === "") {
    throw new IntegrationDatabaseConfigError(
      "INTEGRATION_DATABASE_URL is required to run integration database commands. " +
        "The existing newsletter workbench does not need this variable and continues to use SQLite.",
    );
  }

  const url = raw.trim();
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new IntegrationDatabaseConfigError(
      "INTEGRATION_DATABASE_URL is malformed. Expected a postgres:// or postgresql:// connection URL.",
    );
  }

  if (!POSTGRES_PROTOCOLS.has(parsed.protocol)) {
    throw new IntegrationDatabaseConfigError(
      "INTEGRATION_DATABASE_URL must use postgres:// or postgresql://.",
    );
  }

  if (!parsed.hostname) {
    throw new IntegrationDatabaseConfigError(
      "INTEGRATION_DATABASE_URL is malformed. A hostname is required.",
    );
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, "")).trim();
  if (!databaseName) {
    throw new IntegrationDatabaseConfigError(
      "INTEGRATION_DATABASE_URL is malformed. A database name is required in the URL path.",
    );
  }

  return { url };
}

export function readIntegrationDatabaseUrl(
  env: NodeJS.Dict<string> = process.env,
): string {
  return readIntegrationDatabaseConfig(env).url;
}
