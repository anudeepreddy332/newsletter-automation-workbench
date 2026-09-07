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

## Story synchronization

Phase 2 writes the existing five-story Benzinga-shaped RSS fixture through the
existing TypeScript parser/normalizer into Postgres. It does not change Fetch
Stories, SQLite, or the operator workbench.

```bash
export INTEGRATION_DATABASE_URL=postgres://integration:integration@127.0.0.1:5433/newsletter_integration
npm run integration:db:migrate
npm run integration:sync -- stories
```

Repeated runs stay at five stories. The command requires
`INTEGRATION_DATABASE_URL`, writes the feed and stories in one transaction, and
does not print secrets.

## FastAPI catalog (drill mode)

Phase 3 adds a read-only FastAPI service that exposes already-normalized
Postgres stories. TypeScript remains the writer. FastAPI does not parse RSS.

```bash
python3 -m venv api/.venv
api/.venv/bin/pip install -r api/requirements-dev.txt
export INTEGRATION_DATABASE_URL=postgres://integration:integration@127.0.0.1:5433/newsletter_integration
api/.venv/bin/uvicorn newsletter_integration_api.main:app --host 127.0.0.1 --port 8000 --app-dir api
```

Drill mode Fetch Stories calls FastAPI, then stores the result in the existing
SQLite workbench copy. Default demo mode is unchanged and does not need
Postgres or FastAPI.

```bash
export NEWSLETTER_INTEGRATION_MODE=drill
export INTEGRATION_API_BASE_URL=http://127.0.0.1:8000
export NEWSLETTER_WORKBENCH_DB_PATH=./local-drill-only.db
npm run dev
```

Use a separate SQLite file for drill validation. Do not point tests at the
approved demo database.

## Mock advertiser offers

Phase 4 writes a controlled mocked Everflow-style fixture of 10 offers through
validation, normalization, and a transactional Postgres upsert. This is not
verified Everflow API compatibility.

```bash
export INTEGRATION_DATABASE_URL=postgres://integration:integration@127.0.0.1:5433/newsletter_integration
npm run integration:sync -- offers
```

Repeated runs stay at 10 offers. Story sync is unchanged:

```bash
npm run integration:sync -- stories
```

## Not implemented yet

- FastAPI GET /offers
- advertiser Fetch button
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
