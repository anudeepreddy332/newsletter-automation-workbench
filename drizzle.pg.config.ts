import type { Config } from "drizzle-kit";

export default {
  schema: [
    "./src/integration/postgres/schema.ts",
    "./src/click-quality/postgres/schema.ts",
  ],
  out: "./drizzle-postgres",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.INTEGRATION_DATABASE_URL ??
      "postgres://integration:integration@127.0.0.1:5433/newsletter_integration",
  },
} satisfies Config;
