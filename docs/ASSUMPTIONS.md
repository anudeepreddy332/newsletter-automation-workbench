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

- One operator manually initiates and observes every POC run, including the
  explicit Fetch latest stories action.
- Controlled RSS fixtures stand in for live source data. There is no live
  Benzinga integration and no scheduler yet.
- The initial **Benzinga-shaped RSS schema is provisional until a
  representative stakeholder feed is available**. It is fictional test data,
  not a copy of proprietary feed content or a compatibility claim.
- The operator, rather than automation, selects stories and mock offers and
  arranges the mixed Story/Sponsored layout. Human placement is the
  advertisement placement policy for this POC.
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
| What mock offer fields and tracking URL form should the POC display? | Defines the deterministic Mock Everflow-style catalog. | Milestone 4 implementation. **Phase 4 decision:** each offer has `id`, `advertiserName`, `offerName`, and a mock `trackingUrl` on `offers-fixture.test`. |
| What subject, preheader, HTML, and plain-text content contract is required? | Defines deterministic rendering and exact preview. | Milestone 4 completion. **Later decision:** subject and preheader are the first Story block title and summary in layout order. HTML and plain text follow the exact mixed-block layout. A leading Sponsored block does not become the subject/preheader source. The production subject/preheader contract remains unvalidated. |
| Who can approve a preview and what change counts as an approval-invalidating edit? | Defines review protection. | Milestone 5 implementation. **Phase 5 decision:** the operator must approve explicitly. Approval is current only while it matches the exact current generated snapshot. Story, offer, publishing-URL, and regenerate-different-output changes invalidate approval. |
| What receipt fields prove mock staging and duplicate protection? | Defines Mock Iterable stage-only evidence. | Milestone 5 completion. **Phase 5 decision:** receipts include `provider`, `status` `staged`, deterministic `externalDraftId`, and `approvalFingerprint`. Identity is draft + approval fingerprint + provider. |
| Which disposable WordPress.com test site, credential method, post type, cleanup policy, and one-post interpretation are approved? | Bounds optional real publishing. | Milestone 3B start. |

## Baseline decision

Until the unresolved questions are answered in writing, implementation remains
fixture-backed, deterministic, mock-first, human-controlled, and stage-only.
It must not claim stakeholder-feed compatibility, live WordPress success, real
offer tracking, real Iterable staging, or email delivery.

## Phase 4 implementation decisions

- Mock offers are five fictional catalog records. Tracking URLs are mock
  `https://offers-fixture.test/...` values and are not live destinations.
- One draft contains one persisted mixed layout of Story and Sponsored blocks.
  New blocks append. Duplicate block identities are prevented. Removing a
  block removes it from this newsletter only.
- The WordPress-to-newsletter payload remains unresolved. Rendering uses
  normalized story title, summary, optional body, and a URL that prefers a
  successful publishing result when one exists, otherwise the story canonical
  URL. Generate resolves missing published URLs through MockWordPress and never
  calls RealWordPress.
- Advertisement placement remains unknown. This POC uses human placement in
  the unified layout. That is not the target production placement policy.

## Phase 5 implementation decisions

- Approval is a deliberate operator action and is never automatic.
- Approval binds to a deterministic fingerprint of the generated input
  fingerprint, subject, preheader, HTML, and plain text.
- Staging uses the persisted approved snapshot. It does not rebuild a
  newsletter from newer draft state.
- Story selection/order changes, offer changes, mixed-layout reorder, publishing
  URL resolution changes, and a different generated snapshot all invalidate
  approval for staging. The operator must generate, review, and approve again.
- If regeneration produces the exact same approved snapshot, that matching
  approval identity may be reused.
- `MockIterable` is the only staging destination. It makes no network request
  and does not send email. The real Iterable contract remains unvalidated.
- Staging receipts are keyed by draft + approval fingerprint + provider.
  Repeating Stage for the same approval returns the stored receipt.

## Operator workflow correction

- Fetch latest stories is explicit. A clean database starts with zero stories.
  Reloading uses persisted stories and does not automatically read the source.
- Generate newsletter automatically creates or reuses MockWordPress story-page
  results. It never calls RealWordPress. WordPress evidence is optional and
  collapsed after staging.
- The canonical happy path is fetch, choose stories, choose advertiser links,
  arrange, generate and preview, review and approve, then stage to Mock Iterable.
