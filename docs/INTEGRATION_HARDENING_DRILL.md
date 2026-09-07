# Integration Hardening Drill

This is an educational integration drill. It does **not** change the approved
main demo architecture, and it is **not** production-ready.

## What stays the same

SQLite continues to own newsletter workflow state:

- newsletter drafts
- selected layout blocks
- generated newsletters
- approvals
- WordPress publication evidence
- Mock Iterable staging receipts

The existing workbench still runs without Postgres.

## What Postgres is for

Local Postgres stores integration/source data only. Phase 1 creates the
foundation tables (`content_feeds`, `stories`, `offers`) and a repeatable
migration path. It does not replace SQLite.

## Not implemented yet

- FastAPI
- story / RSS synchronization
- Everflow synchronization
- retries / backoff

## Local Postgres

Start the Compose service (Postgres only, loopback-bound, local credentials):

```bash
docker compose -f compose.integration.yml up -d
```

Apply integration migrations. This command requires `INTEGRATION_DATABASE_URL`
and does not run SQLite migrations:

```bash
export INTEGRATION_DATABASE_URL=postgres://integration:integration@127.0.0.1:5433/newsletter_integration
npm run integration:db:migrate
```

The URL above is a local placeholder. Do not commit real credentials.

Stop the service with:

```bash
docker compose -f compose.integration.yml down
```
