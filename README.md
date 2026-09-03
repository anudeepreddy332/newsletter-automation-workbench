# Newsletter Automation Workbench POC

## Problem being solved

The Newsletter Automation Workbench POC makes a stakeholder-reported,
multi-step newsletter workflow deterministic, inspectable, and safe to demo.
It connects an explicit local story fetch, manual editorial choices, a unified
mixed-block layout, automatic Mock WordPress story-page resolution, deterministic
rendering, exact preview, approval, and staging without claiming production
automation or sending email.

## Current stakeholder-reported workflow

At the current level of understanding, the business workflow is:

1. Benzinga RSS is reviewed and stories are selected by staff.
2. Selected stories are published or resolved through WordPress.
3. Staff manually move relevant WordPress content or links into newsletter
   preparation.
4. Staff select or copy advertiser/offer links associated with Everflow.
5. Staff manually assemble and format the newsletter in Iterable.
6. A person reviews the newsletter before Iterable eventually sends it.

The exact WordPress-to-Iterable payload is unresolved. It may include a URL,
excerpt, full content, image, formatting, metadata, or a combination. The POC
must not invent that contract.

## Frozen POC workflow

```text
Benzinga-shaped RSS fixtures
  -> explicit Fetch latest stories
       ContentSource.read() -> normalize -> upsert
  -> Single Operator Workbench
  -> operator chooses stories and optional advertiser links
  -> operator arranges one mixed Story/Sponsored layout
  -> Generate newsletter
       MockWordPress resolves story pages automatically
       RealWordPress is never called by Generate
  -> exact HTML and plain-text preview
  -> human approval of that exact snapshot
  -> stage approved snapshot to Mock Iterable
  -> display receipt
```

The POC ends at staging. It performs **no real email send**.

## Optional Real WordPress.com configuration

Mock WordPress remains the default and works with no credentials. Real
WordPress.com test publishing is optional, server-side only, and disabled until
both of these environment variables are set:

- `WORDPRESS_SITE_ID` — numeric WordPress.com site ID
- `WORDPRESS_ACCESS_TOKEN` — OAuth2 bearer token

Put real values only in a local gitignored `.env` or `.env.local` file. Do not
commit tokens, paste them into the browser, or store them in SQLite. See
`.env.example` for variable names only.

The numeric site ID comes from the authenticated
`GET /rest/v1.1/me/sites` response `ID` field. Creating a post uses
`POST /rest/v1.1/sites/$site/posts/new` with
`Authorization: Bearer <token>`.

## POC scope

- One modular application and one operator.
- Deterministic, fixture-backed RSS intake through a `ContentSource` adapter.
  The operator must fetch explicitly. Page load does not read the source, and
  no scheduler is implemented. The explicit refresh operation could later be
  invoked by a scheduler.
- Manual story and advertiser multi-select, plus one persisted mixed-block
  layout. Human placement is the advertisement placement policy for this POC.
- `MockWordPress` as the required/default deterministic publisher. Generate
  resolves story pages through Mock WordPress automatically. Optional
  `RealWordPress` remains a collapsed test control for one disposable
  WordPress.com test site after Milestone 3A.
- A mock Everflow-style offer catalog and tracking URLs.
- Deterministic newsletter HTML and plain-text rendering.
- Exact preview, human approval of that exact snapshot, approval invalidation
  when generated output changes, and duplicate-staging protection.
- Stage-only `MockIterable` destination with a visible delivery receipt. Staging
  prepares a mock draft; it does not send email.
- SQLite persistence.

## Explicit exclusions

- No AI/LLM dependency or automatic editorial decisions.
- No real Everflow or Iterable integration, real email send, audience
  management, production authentication, analytics platform, queues,
  microservices, workflow engines, or production deployment.
- No target-organization credentials, target-organization WordPress access, or
  multi-site/40-site WordPress fan-out.
- No client-side credentials; any optional real WordPress credentials are
  server-side only.
- No silent fallback from a failed real WordPress call to Mock mode.
- No live-feed compatibility claim until a representative stakeholder feed is
  available and compared with the provisional fixture contract.

## Demo success criteria

The POC demo succeeds only when it proves all applicable steps with visible,
honest results:

1. The same controlled fixture yields the same normalized stories after an
   explicit fetch.
2. The single operator can choose stories and mock offers, then arrange a mixed
   Story/Sponsored layout.
3. Mock WordPress, Mock Everflow, and Mock Iterable each work independently
   and identify their own deterministic result.
4. The renderer produces exact, deterministic HTML and plain-text previews.
5. A human approval is required before staging; editing invalidates that
   approval and duplicate staging is prevented.
6. Staging creates a visible Mock Iterable receipt and does not send email.
7. If RealWordPress is demonstrated, it targets only the approved disposable
   WordPress.com site, uses server-side credentials, reports the actual
   post ID/status/URL, and never falls back silently to Mock mode.

See [the architecture contract](docs/ARCHITECTURE.md),
[assumptions register](docs/ASSUMPTIONS.md), and
[implementation plan](docs/IMPLEMENTATION_PLAN.md).
