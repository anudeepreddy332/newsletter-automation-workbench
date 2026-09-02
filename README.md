# Newsletter Automation Workbench POC

## Problem being solved

The Newsletter Automation Workbench POC is intended to make a small, reviewable
path from an RSS item to a newsletter-ready item and a WordPress publication
result. Its purpose is to demonstrate the workflow safely and deterministically
before any production automation, publisher access, or broader platform work is
considered.

## Current stakeholder-reported workflow

The following is the high-level workflow reported for the stakeholder context;
it has not yet been independently verified against a live stakeholder feed or
WordPress site:

1. A person identifies relevant stories from an RSS source.
2. A person turns the selected material into newsletter content.
3. A person reviews the content and publishes it through WordPress.

The exact source feed, selection rules, draft format, approval owner, and
current WordPress publishing practice remain open questions. This POC must not
silently treat those unknowns as established requirements.

## Proposed POC workflow

1. An operator manually starts a run using a controlled RSS fixture.
2. The source adapter reads and normalizes the fixture into the provisional
   initial feed shape.
3. The workbench presents a reviewable newsletter item/draft payload; any
   editorial or generation rules must be explicit and reviewable.
4. After the POC's required review point, the publishing boundary is invoked.
5. By default, `MockWordPress` returns a deterministic normalized post result.
6. If explicitly configured after the Mock milestone passes, `RealWordPress`
   may create one controlled fixture-backed post on one disposable
   WordPress.com test site and return its normalized ID, status, and URL.
7. The result is shown as it occurred. A failed real call is a failed result;
   it does not fall back to Mock mode.

## POC scope

- One manually initiated, single-operator demonstration flow.
- Fixture-backed RSS intake and normalization.
- A reviewable intermediate newsletter payload rather than unattended
  publishing.
- A publisher adapter boundary with deterministic `MockWordPress` as the
  required default.
- Optional, post-Milestone-3A `RealWordPress` support for exactly one
  disposable WordPress.com test site.
- Normalized publishing results containing post ID, status, and URL.
- Honest reporting of mock and real outcomes.

## Explicit exclusions

- No production deployment or unattended/scheduled newsletter operation.
- No access to the target organization's WordPress instance.
- No multi-site WordPress support.
- No client-side WordPress credentials; real credentials, if used, are
  server-side only.
- No silent Mock fallback when a real publishing call fails.
- No guarantee that the initial RSS shape matches the target organization until a
  representative feed is available.
- No final decision on content-selection, editorial, generation, approval,
  authentication, analytics, audience delivery, or retention policy beyond
  what is necessary for this bounded demo.

## Demo success criteria

The POC demo is successful only if all applicable criteria are met:

1. A controlled fixture can be ingested and normalized reproducibly.
2. The operator can inspect the resulting newsletter payload before the
   publishing boundary is invoked.
3. `MockWordPress` works independently and returns the same normalized result
   for the same fixture-backed request.
4. The shown result identifies the adapter used and reports normalized post
   ID, status, and URL.
5. If `RealWordPress` is demonstrated, it uses server-side credentials, targets
   only the disposable test site, creates no more than one controlled
   fixture-backed post, and reports the real outcome without fallback.
6. If real publishing is not configured or fails, the demo states that fact
   clearly; Mock success is not presented as RealWordPress success.

See [the architecture contract](docs/ARCHITECTURE.md),
[assumptions register](docs/ASSUMPTIONS.md), and
[implementation plan](docs/IMPLEMENTATION_PLAN.md).
