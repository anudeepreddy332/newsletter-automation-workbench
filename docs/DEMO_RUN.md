# Demo run

Operator runbook for a repeatable local demo of the Newsletter Automation
Workbench POC. This is not a production runbook.

## 1. One-time local setup

1. From the project directory, save the valid WordPress.com OAuth access token
   into `.wordpress-demo-token`.
   - Put **only** the raw token in that file.
   - No quotes.
   - One line.
   - Do not put the token in `.env`, `.env.local`, or any Next.js env file.

2. Protect the file:

   ```bash
   chmod 600 .wordpress-demo-token
   ```

3. Confirm Git ignores it:

   ```bash
   git check-ignore .wordpress-demo-token
   ```

   Expected: `.wordpress-demo-token`

4. Confirm local secrets and demo data are not tracked:

   ```bash
   git check-ignore .env.local .env.local.bak .wordpress-demo-token local-development-only.db
   git status --short
   ```

Do not commit `.wordpress-demo-token`, `.env.local`, database files, or any
token, client secret, or application password.

## 2. Every demo run

Use a **new terminal**. Do not `source .env.local`. Do not reuse an old
`npm run dev` process.

Set the disposable WordPress.com test-site ID, load the token with `cat`,
print only non-secret checks, then run a **read-only** preflight. Start the
app from **that same terminal**.

```bash
export WORDPRESS_SITE_ID='<WORDPRESS_TEST_SITE_ID>'
export WORDPRESS_ACCESS_TOKEN="$(cat .wordpress-demo-token)"

echo "SITE=$WORDPRESS_SITE_ID"
echo "TOKEN_LENGTH=${#WORDPRESS_ACCESS_TOKEN}"
printf '%s' "$WORDPRESS_ACCESS_TOKEN" | shasum -a 256 | cut -c1-12

curl -sS \
  -o /tmp/wp-sites.json \
  -w "HTTP %{http_code}\n" \
  "https://public-api.wordpress.com/rest/v1.1/me/sites" \
  -H "Authorization: Bearer ${WORDPRESS_ACCESS_TOKEN}"
```

Expected preflight: `HTTP 200`.

Do not print the token. If the preflight is not HTTP 200, stop. Do not
continue to live WordPress publishing.

Then start the app from the same terminal:

```bash
npm run dev -- -p 3041
```

Shortcut that performs the same token load, length check, read-only
preflight, and start:

```bash
export WORDPRESS_SITE_ID='<WORDPRESS_TEST_SITE_ID>'
./scripts/start-demo.sh
```

Or pass the site ID as the first argument: `./scripts/start-demo.sh '<WORDPRESS_TEST_SITE_ID>'`.
Optional port: `PORT=3042 ./scripts/start-demo.sh`.

Open [http://localhost:3041](http://localhost:3041).

## 3. Demo click path

1. Open localhost.
2. Fetch stories.
3. Choose 2–3 stories in one batch.
4. Choose 1–2 advertiser links in one batch.
5. Drag Story/Sponsored blocks into a mixed order.
6. Generate newsletter.
7. Show the exact preview.
8. Approve newsletter.
9. Publish the approved newsletter to WordPress **exactly once**.
10. Open View live newsletter.
11. Return to the workbench.
12. Stage the approved newsletter to Mock Iterable.
13. Show the staging receipt.
14. Stop.

Say this during the WordPress step:

> This WordPress placement is a prototype assumption based on my current
> understanding of the workflow and can be adjusted once the exact production
> contract is confirmed.

Do not send email. Iterable is mocked.

## 4. Shutdown

Stop the dev server with Ctrl+C in the same terminal. Leave the WordPress.com
test site as-is unless you have a separate, explicit cleanup task. Shutdown
does not delete live posts.

## 5. Troubleshooting

- **Do not `source .env.local`.** Shell and env-file loading can transform
  token characters and produce a shorter invalid token.
- **Do not start from an old terminal or leftover server.** Export a fresh
  token in a new terminal, pass preflight, then start `npm run dev` there.
- **Port 3041 is occupied.** Stop the old project server, or choose another
  clean port with `npm run dev -- -p <port>` / `PORT=<port> ./scripts/start-demo.sh`.
- **Preflight is not HTTP 200.** Fix credentials first. Never continue to live
  WordPress publishing.
- **Publish stays unavailable.** Confirm you exported `WORDPRESS_SITE_ID` and
  `WORDPRESS_ACCESS_TOKEN` in the same terminal that started the server, and
  that an old `.env.local` `WORDPRESS_ACCESS_TOKEN` is not your launch method.
- **Token length looks wrong.** Recreate `.wordpress-demo-token` with the raw
  token only: no quotes, no extra spaces, one line.

## 6. Reset / fresh demo

The workbench SQLite file defaults to `local-development-only.db` in the
project directory. Override with `NEWSLETTER_WORKBENCH_DB_PATH` if needed.

This POC has only local demo data. It is not a production database. Resetting
the local DB does **not** wipe the live WordPress site. Do not delete
WordPress.com posts as part of a demo reset.

To start from a clean local workbench:

1. Stop the demo server.
2. From the project directory, remove only the known local POC database:

   ```bash
   rm -f local-development-only.db local-development-only.db-wal local-development-only.db-shm
   ```

3. If you set `NEWSLETTER_WORKBENCH_DB_PATH`, remove that file instead. Do not
   delete unknown `.db` files.
4. Restart with the Every demo run commands above.

Fetched stories, layout, approval, local publication evidence, and Mock
Iterable receipts are cleared. Existing WordPress.com posts remain.
