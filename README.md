# Newsletter Automation Workbench POC

## Problem being solved

The Newsletter Automation Workbench POC makes a stakeholder-reported,
multi-step newsletter workflow deterministic, inspectable, and safe to demo.
It connects controlled story intake, manual editorial choices, mock publishing,
offer-link selection, deterministic rendering, approval, and staging without
claiming production automation or sending email.

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
  -> ContentSource adapter
  -> Single Operator Workbench
  -> operator selects and orders stories
  -> WordPress publishing/resolution
       MockWordPress required/default
       RealWordPress optional later
  -> operator selects a Mock Everflow-style offer
  -> offer adapter provides tracking URL
  -> deterministic newsletter renderer
  -> exact HTML and plain-text preview
  -> human approval
  -> stage approved snapshot to Mock Iterable
  -> display receipt
```

The POC ends at staging. It performs **no real email send**.

## POC scope

- One modular application and one operator.
- Deterministic, fixture-backed RSS intake through a `ContentSource` adapter.
- Manual story selection and ordering.
- `MockWordPress` as the required/default deterministic publisher; optional
  `RealWordPress` only after Milestone 3A passes.
- A mock Everflow-style offer catalog and tracking URL.
- Deterministic newsletter HTML and plain-text rendering.
- Exact preview, human approval, lightweight revision/approval protection, and
  duplicate-staging protection.
- Stage-only `MockIterable` destination with a visible delivery receipt.
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

1. The same controlled fixture yields the same normalized stories.
2. The single operator can select and order stories and select a mock offer.
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
