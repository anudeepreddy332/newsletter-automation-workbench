# Integration Drill Demo Runbook

Screen-share checklist for the integration-hardening drill. This is **not**
the approved main-demo WordPress flow. Use `docs/DEMO_RUN.md` for that.

All commands run from the repository root:

`newsletter-automation-workbench`

Do not commit `.env` files, `local-drill-only.db`, or real credentials.

## A. First-time setup only

Do this once on a machine. Skip it on later demos if dependencies are already
installed.

```bash
npm install
python3 -m venv api/.venv
api/.venv/bin/pip install -r api/requirements-dev.txt
```

## B. Every demo / cold start

Assume the computer may have been restarted and all terminals closed. Start
Docker Desktop / the Docker engine first.

### Terminal 1 — Postgres preparation

```bash
cd /path/to/newsletter-automation-workbench
docker compose -f compose.integration.yml up -d --wait
export INTEGRATION_DATABASE_URL=postgres://integration:integration@127.0.0.1:5433/newsletter_integration
npm run integration:db:migrate
npm run integration:sync -- stories
npm run integration:sync -- offers
```

Compose starts Postgres. Migrations are repeatable. Sync commands are
idempotent. Running them before every demo guarantees the known 5-story /
10-offer state.

Expected:

```text
processed=5
stored=5
processed=10
stored=10
```

Keep this terminal open, or leave Postgres running in Docker.

### Terminal 2 — FastAPI

```bash
cd /path/to/newsletter-automation-workbench
export INTEGRATION_DATABASE_URL=postgres://integration:integration@127.0.0.1:5433/newsletter_integration
api/.venv/bin/uvicorn newsletter_integration_api.main:app --host 127.0.0.1 --port 8000 --app-dir api
```

Export `INTEGRATION_DATABASE_URL` again because environment variables belong
to this shell process, and FastAPI needs the Postgres connection string.

Health check (any extra terminal):

```bash
curl -s http://127.0.0.1:8000/health
```

Expected:

```json
{"status":"ok"}
```

### Terminal 3 — Next.js drill UI

```bash
cd /path/to/newsletter-automation-workbench
export NEWSLETTER_INTEGRATION_MODE=drill
export INTEGRATION_API_BASE_URL=http://127.0.0.1:8000
export NEWSLETTER_WORKBENCH_DB_PATH=./local-drill-only.db
npm run dev -- --port 3001
```

Browser:

http://localhost:3001

Use `local-drill-only.db` only. Do not point this at the approved demo
SQLite file.

## C. Port cheat sheet

| Host port | Service |
|---|---|
| **5433** | local Postgres (Compose maps host `5433` → container `5432`) |
| **8000** | FastAPI |
| **3001** | Next.js drill UI |

## D. Demo checklist

Do **not** publish to WordPress for this drill.

1. Open http://localhost:3001
2. Click **Fetch latest stories**
3. Confirm **5** stories are available
4. Click **Fetch advertiser links**
5. Confirm **9** selectable active offers (10 Postgres offers, 1 paused)
6. Add one or more stories
7. Add one or more advertiser links
8. Arrange the blocks
9. Generate a preview
10. Refresh the browser
11. Confirm stories, offers, layout, and preview are still there

Page load does not call FastAPI. Reload uses SQLite only.

## E. Failure demo

1. Go to the FastAPI terminal
2. Press **Ctrl+C**
3. Click **Fetch latest stories** or **Fetch advertiser links**
4. The request should fail after bounded retries (3 attempts, 8-second budget)
5. Previous local catalogs and selections remain
6. Restart FastAPI with the Terminal 2 command
7. Fetch again — it should succeed

## F. Shutdown

1. **Ctrl+C** in the Next.js terminal
2. **Ctrl+C** in the FastAPI terminal
3. Stop Postgres:

```bash
docker compose -f compose.integration.yml down
```

`docker compose down` stops and removes the container and network. The named
Postgres volume remains, so database data survives.

Do **not** run `docker compose down -v`. That deletes the volume.

## G. What must be repeated after reboot

Must repeat:

- start Docker Desktop / the Docker engine
- `docker compose -f compose.integration.yml up -d --wait`
- export the terminal environment variables
- start FastAPI
- start Next.js

Not normally required:

- recreate the Python virtualenv
- reinstall npm or Python dependencies
- re-seed the database

Migrations and sync are still included in the every-demo sequence because they
are safe, repeatable, and lock the demo to 5 stories and 10 offers.
