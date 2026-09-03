# Assumptions and Open Questions

## Verified stakeholder facts

- The current business workflow is staff-led: RSS review, WordPress
  publishing/resolution, manual newsletter preparation, offer-link selection,
  manual Iterable assembly, human review, and eventual Iterable delivery.
- The POC is a single modular application for one operator, not a production
  automation commitment.
- A real WordPress call uses server-side credentials only, returns normalized
  post ID/status/URL, and fails honestly without Mock fallback.
- Real Everflow, real Iterable, real email send, target-organization access,
  multi-site WordPress, and production infrastructure are excluded.

## POC ASSUMPTION

The assembled approved newsletter is published as one WordPress post before
Iterable staging.

This workflow is not yet stakeholder-confirmed. Benzinga -> WordPress ->
Iterable is a stakeholder-confirmed sequence, but the exact WordPress content
contract is not confirmed. This POC therefore publishes the complete approved
newsletter as one WordPress.com post. That is a prototype assumption, not a
claim about the stakeholder's exact production implementation.

Also true for this POC:

- RSS is fixture-based.
- WordPress is the one real integration.
- Everflow offers are mocked.
- Iterable is mocked.
- There is no email send.
- Exact production WordPress and Iterable contracts remain unvalidated.

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
- Generate uses the selected layout and fixture canonical URLs and does not
  write to WordPress.
- One newsletter draft maps to one stable WordPress.com post. The first
  current approval creates that post. The same approval does not create
  another write. A later approved revision updates the same post.
- Mock Iterable can stage an immutable approved snapshot, with the current
  WordPress post URL, without any real send.

## Unresolved questions

| Question | Why it matters | Required before |
| --- | --- | --- |
| What representative stakeholder RSS feed/sample is available and may it be retained as a fixture? | Confirms or changes the provisional source mapping. | Any live-source compatibility claim. |
| What exact WordPress content contract should production use? | The POC currently publishes the whole approved newsletter as one post. That is a prototype assumption. | Any production WordPress claim. |
| What newsletter brand/publication configurations can the operator select? | Defines the Milestone 2 publication boundary. | Milestone 2 implementation. |
| What story eligibility, editorial, and ordering rules apply? | Keeps decisions human-led and prevents invented automation. | Milestone 2 completion. |
| What mock offer fields and tracking URL form should the POC display? | Defines the deterministic Mock Everflow-style catalog. | Milestone 4 implementation. **Phase 4 decision:** each offer has `id`, `advertiserName`, `offerName`, and a mock `trackingUrl` on `offers-fixture.test`. |
| What subject, preheader, HTML, and plain-text content contract is required? | Defines deterministic rendering and exact preview. | Milestone 4 completion. **Later decision:** subject and preheader are the first Story block title and summary in layout order. HTML and plain text follow the exact mixed-block layout. A leading Sponsored block does not become the subject/preheader source. The production subject/preheader contract remains unvalidated. |
| Who can approve a preview and what change counts as an approval-invalidating edit? | Defines review protection. | Milestone 5 implementation. **Phase 5 decision:** the operator must approve explicitly. Approval is current only while it matches the exact current generated snapshot. Story, offer, layout, and regenerate-different-output changes invalidate approval. |
| What receipt fields prove mock staging and duplicate protection? | Defines Mock Iterable stage-only evidence. | Milestone 5 completion. **Phase 5 decision:** receipts include `provider`, status `staged`, deterministic `externalDraftId`, and `approvalFingerprint`. Identity is draft + approval fingerprint + provider. Staging also requires a current WordPress publication. |
| Which disposable WordPress.com test site, credential method, post type, cleanup policy, and one-post interpretation are approved? | Bounds real publishing. | Milestone 3B start. **Later POC decision:** one newsletter draft equals one WordPress.com post; later approved revisions update that post. |

## Baseline decision

Until the unresolved questions are answered in writing, implementation remains
fixture-backed, deterministic, human-controlled, and stage-only except for the
one real WordPress.com newsletter publication. It must not claim
stakeholder-feed compatibility, production WordPress/Iterable contracts, real
offer tracking, real Iterable staging, or email delivery.

## Phase 4 implementation decisions

- Mock offers are five fictional catalog records. Tracking URLs are mock
  `https://offers-fixture.test/...` values and are not live destinations.
- One draft contains one persisted mixed layout of Story and Sponsored blocks.
  New blocks append. Duplicate block identities are prevented. Removing a
  block removes it from this newsletter only.
- Generate renders normalized story title, summary, optional body, and the
  story canonical URL from the fixture. It does not write to WordPress.
- Advertisement placement remains unknown. This POC uses human placement in
  the unified layout. That is not the target production placement policy.

## Phase 5 implementation decisions

- Approval is a deliberate operator action and is never automatic.
- Approval binds to a deterministic fingerprint of the generated input
  fingerprint, subject, preheader, HTML, and plain text.
- Staging uses the persisted approved snapshot. It does not rebuild a
  newsletter from newer draft state.
- Story selection/order changes, offer changes, mixed-layout reorder, and a
  different generated snapshot all invalidate approval. WordPress publication
  then becomes stale until the new snapshot is approved and published/updated.
- If regeneration produces the exact same approved snapshot, that matching
  approval identity may be reused.
- `MockIterable` is the only staging destination. It makes no network request
  and does not send email. The real Iterable contract remains unvalidated.
- Staging receipts are keyed by draft + approval fingerprint + provider.
  Repeating Stage for the same approval returns the stored receipt.
- Staging is allowed only when the current WordPress publication fingerprint
  matches the current approved snapshot.

## Operator workflow

- Fetch latest stories is explicit. A clean database starts with zero stories.
  Reloading uses persisted stories and does not automatically read the source.
- Generate newsletter uses the selected layout and fixture URLs. It never
  writes to WordPress.
- The canonical happy path is fetch, choose stories, choose advertiser links,
  arrange, generate and preview, review and approve, publish the approved
  newsletter to WordPress, then stage to Mock Iterable.
