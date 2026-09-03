# Newsletter Automation Workbench POC

## Problem being solved

The Newsletter Automation Workbench POC makes a stakeholder-reported,
multi-step newsletter workflow deterministic, inspectable, and safe to demo.
It connects an explicit local story fetch, manual editorial choices, a unified
mixed-block layout, deterministic rendering, exact preview, human approval,
publication of that approved newsletter as one WordPress.com post, and Mock
Iterable staging. It does not claim production automation or send email.

## POC ASSUMPTION

The assembled approved newsletter is published as one WordPress post before
Iterable staging.

This workflow is not yet stakeholder-confirmed. It is a prototype assumption
for this POC, not a claim about the stakeholder's exact production
implementation.

## Current stakeholder-reported workflow

At the current level of understanding, the business workflow is:

1. Benzinga RSS is reviewed and stories are selected by staff.
2. Selected stories are published or resolved through WordPress.
3. Staff manually move relevant WordPress content or links into newsletter
   preparation.
4. Staff select or copy advertiser/offer links associated with Everflow.
5. Staff manually assemble and format the newsletter in Iterable.
6. A person reviews the newsletter before Iterable eventually sends it.

The exact WordPress content contract is not confirmed. The exact
WordPress-to-Iterable payload remains unvalidated. The POC must not invent
those production contracts.

## Frozen POC workflow

```text
Benzinga-shaped RSS fixtures
  -> 1. explicit Fetch latest stories
  -> 2. choose stories
  -> 3. choose advertiser links
  -> 4. arrange one mixed Story/Sponsored layout
  -> 5. Generate and preview
       uses selected layout and fixture canonical URLs
       no WordPress writes
  -> 6. Review and approve the exact generated snapshot
  -> 7. Publish the approved newsletter as ONE WordPress.com post
  -> 8. Stage the approved snapshot plus the current WordPress URL to Mock Iterable
```

RSS is fixture-based. WordPress.com is the one real integration. Everflow
offers are mocked. Iterable is mocked. There is no email send. Exact
production WordPress and Iterable contracts remain unvalidated.

## WordPress.com configuration

Publishing the approved newsletter to WordPress.com is optional until both of
these server-side environment variables are set:

- `WORDPRESS_SITE_ID` — numeric WordPress.com site ID
- `WORDPRESS_ACCESS_TOKEN` — OAuth2 bearer token

Put real values only in a local gitignored `.env` or `.env.local` file. Do not
commit tokens, paste them into the browser, or store them in SQLite. See
`.env.example` for variable names only.

Creating a post uses `POST /rest/v1.1/sites/$site/posts/new`. Updating the
same newsletter post uses `POST /rest/v1.1/sites/$site/posts/$post_ID`. Both
use `Authorization: Bearer <token>` and `application/x-www-form-urlencoded`
`title`, `content`, and `status=publish`.

## POC scope

- One modular application and one operator.
- Deterministic, fixture-backed RSS intake through a `ContentSource` adapter.
  The operator must fetch explicitly. Page load does not read the source, and
  no scheduler is implemented.
- Manual story and advertiser multi-select, plus one persisted mixed-block
  layout. Human placement is the advertisement placement policy for this POC.
- Generate renders from the selected layout and fixture story URLs. It does
  not write to WordPress.
- One real integration: publishing the approved newsletter snapshot as one
  WordPress.com post. Later approved revisions update that same post.
- A mock Everflow-style offer catalog and tracking URLs.
- Deterministic newsletter HTML and plain-text rendering.
- Exact preview, human approval of that exact snapshot, and approval
  invalidation when generated output changes.
- Stage-only `MockIterable` destination after the current WordPress
  publication matches the current approval. Staging prepares a mock draft; it
  does not send email.
- SQLite persistence.

## Explicit exclusions

- No AI/LLM dependency or automatic editorial decisions.
- No real Everflow or Iterable integration, real email send, audience
  management, production authentication, analytics platform, queues,
  microservices, workflow engines, or production deployment.
- No target-organization credentials, target-organization WordPress access, or
  multi-site/40-site WordPress fan-out.
- No client-side credentials; WordPress credentials are server-side only.
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
3. Generate produces exact, deterministic HTML and plain-text previews from the
   current layout without writing to WordPress.
4. A human approval is required before WordPress publication; editing
   invalidates that approval.
5. The approved newsletter is published as one WordPress.com post; repeating
   the same approval does not create another post; a later approved revision
   updates the same post.
6. Staging creates a visible Mock Iterable receipt only after that WordPress
   publication matches the current approval, and does not send email.

See [the architecture contract](docs/ARCHITECTURE.md),
[assumptions register](docs/ASSUMPTIONS.md), and
[implementation plan](docs/IMPLEMENTATION_PLAN.md).
