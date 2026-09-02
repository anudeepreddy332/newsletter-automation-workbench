# Assumptions and Open Questions

## Verified stakeholder facts

- The current business workflow is staff-led: RSS review, WordPress
  publishing/resolution, manual newsletter preparation, offer-link selection,
  manual Iterable assembly, human review, and eventual Iterable delivery.
- The POC is a single modular application for one operator, not a production
  automation commitment.
- `MockWordPress` is required/default; optional `RealWordPress` comes only
  after Mock validation and can use one disposable WordPress.com test site.
- A real WordPress call uses server-side credentials only, returns normalized
  post ID/status/URL, and fails honestly without Mock fallback.
- The POC includes Mock Everflow-style offer selection, deterministic
  newsletter rendering, exact preview, human approval, and stage-only Mock
  Iterable receipts.
- Real Everflow, real Iterable, real email send, target-organization access,
  multi-site WordPress, and production infrastructure are excluded.

## POC assumptions

- One operator manually initiates and observes every POC run.
- Controlled RSS fixtures stand in for live source data.
- The initial **Benzinga-shaped RSS schema is provisional until a
  representative stakeholder feed is available**. It is fictional test data,
  not a copy of proprietary feed content or a compatibility claim.
- The operator, rather than automation, selects and orders stories and chooses
  the mock offer.
- `ContentFeed` identifies a source feed. `Publication` is reserved for the
  future newsletter brand/publication selection, not source-feed identity.
- Draft rendering can be deterministic once the selected inputs and future
  payload contract are explicit.
- Mock Iterable can stage an immutable approved snapshot without any real send.

## Unresolved questions

| Question | Why it matters | Required before |
| --- | --- | --- |
| What representative stakeholder RSS feed/sample is available and may it be retained as a fixture? | Confirms or changes the provisional source mapping. | Any live-source compatibility claim. |
| What exact WordPress-to-newsletter payload is available: URL, excerpt, full content, image, formatting, metadata, or a combination? | Defines renderer inputs without invention. | Milestone 4 implementation. |
| What newsletter brand/publication configurations can the operator select? | Defines the Milestone 2 publication boundary. | Milestone 2 implementation. |
| What story eligibility, editorial, and ordering rules apply? | Keeps decisions human-led and prevents invented automation. | Milestone 2 completion. |
| What mock offer fields and tracking URL form should the POC display? | Defines the deterministic Mock Everflow-style catalog. | Milestone 4 implementation. |
| What subject, preheader, HTML, and plain-text content contract is required? | Defines deterministic rendering and exact preview. | Milestone 4 completion. |
| Who can approve a preview and what change counts as an approval-invalidating edit? | Defines review protection. | Milestone 5 implementation. |
| What receipt fields prove mock staging and duplicate protection? | Defines Mock Iterable stage-only evidence. | Milestone 5 completion. |
| Which disposable WordPress.com test site, credential method, post type, cleanup policy, and one-post interpretation are approved? | Bounds optional real publishing. | Milestone 3B start. |

## Baseline decision

Until the unresolved questions are answered in writing, implementation remains
fixture-backed, deterministic, mock-first, human-controlled, and stage-only.
It must not claim stakeholder-feed compatibility, live WordPress success, real
offer tracking, real Iterable staging, or email delivery.
