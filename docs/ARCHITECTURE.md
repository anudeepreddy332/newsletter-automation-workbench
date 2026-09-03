# Architecture Contract

## Purpose and boundary

This document freezes a single-operator, modular POC architecture rather than
a production design. It makes a controlled newsletter workflow demonstrable
with deterministic fixtures, one real WordPress.com publication of the
approved newsletter, and mocked Everflow/Iterable adapters. Human decisions
remain explicit at fetch, story selection, offer selection, layout
arrangement, and approval; no stage sends email.

## POC ASSUMPTION

The operator assembles one newsletter from multiple Story and Sponsored
blocks. The complete approved newsletter is then published as one
WordPress.com post. Iterable staging occurs after that WordPress publication.

This is a prototype assumption. It is not a claim about the stakeholder's
exact production implementation, and it is not yet stakeholder-confirmed.

## Concise architecture

```text
RSS fixture -> explicit Fetch latest stories -> ContentSource.read()
             -> normalize -> upsert Story records -> SQLite
                                                |
                                                v
                                     Single Operator Workbench
                          choose stories / choose advertiser links
                          arrange one mixed Story/Sponsored layout
                                                |
                                                v
                         Generate newsletter (layout + fixture URLs)
                           zero WordPress writes
                                                |
                                                v
                      deterministic newsletter renderer -> HTML/text preview
                                                |
                                                v
                           human approval of that exact snapshot
                                                |
                                                v
                      NewsletterPublisher -> one WordPress.com post
                                                |
                                                v
                      Mock Iterable staging using the approved snapshot
                      and the current real WordPress post URL
```

RSS is fixture-based. WordPress is the one real integration. Everflow offers
are mocked. Iterable is mocked. There is no email send. Exact production
WordPress and Iterable contracts remain unvalidated.

## Components and responsibilities

| Component | Responsibility | Must not do |
| --- | --- | --- |
| Single Operator Workbench | Starts the manual flow; shows explicit fetch, story browsing, multi-select, mixed-block arrangement, preview, approval, WordPress publication, and Mock Iterable staging. | Make automatic editorial or approval decisions, auto-fetch on page load, or write to WordPress during Generate. |
| `ContentSource` adapter | Reads controlled RSS fixtures and normalizes provider-shaped items into domain `Story` records when Fetch latest stories is invoked. | Expose raw RSS/XML to the application domain, claim live-feed compatibility, or run on a scheduler. |
| Content persistence | Stores normalized content, draft state, approved snapshots, newsletter publication evidence, and staging receipts. | Create production data models outside the active milestone. |
| `ContentPublisher` contract | Historical story-page publisher used by remaining MockWordPress/RealWordPress regression tests. | Publish an assembled newsletter, or appear on the canonical operator happy path. |
| `MockWordPress` | Historical deterministic story-page publisher retained for regression. | Participate in Generate or the canonical UI. |
| `NewsletterPublisher` | Provider-neutral boundary for publishing an approved newsletter snapshot. | Treat a newsletter as a Story, accept browser credentials, or rebuild content from newer draft state. |
| `WordPressComNewsletterPublisher` | Real WordPress.com implementation: create one post for the first approved snapshot, update that same post for later approved revisions. | Create duplicate posts for layout revisions, or silently fall back to Mock mode. |
| Mock Everflow-style offer adapter | Provides a deterministic offer catalog and tracking URLs for operator choice of zero or more offers. | Call Everflow or select an offer automatically. |
| Newsletter renderer | Produces deterministic HTML and plain text from explicitly selected inputs. | Invent editorial content or perform a send. |
| Preview and approval boundary | Shows the exact render, records human approval bound to that snapshot, and invalidates approval when generated output changes. | Treat a draft as approved without an explicit human action, or publish/stage rebuilt content after approval. |
| `NewsletterStager` | Provider-neutral staging boundary for an approved snapshot plus current WordPress publication evidence. | Call Iterable, manage an audience, or send email. |
| `MockIterable` | Stages an approved immutable snapshot with the current WordPress URL and returns an idempotent receipt. | Call Iterable, manage an audience, or send email. |
| Configuration/secret boundary | Selects adapters and keeps WordPress credentials server-side. | Expose credentials to a browser/client or store them in fixtures. |

## Adapter boundaries

### ContentSource

The initial source contract is **Benzinga-shaped RSS** and is deliberately
provisional. It exists only as fictional, controlled fixture data until a
representative stakeholder feed is available. The domain consumes normalized
`Story` records; it does not depend on raw provider XML structures. Fetch
latest stories is an explicit provider-neutral refresh:
`ContentSource.read()` -> normalize -> upsert content feed/stories. Page load
does not read the source. Repeated fetch is idempotent and does not delete
persisted or selected stories. No scheduler, cron, background worker, queue, or
polling is implemented.

`ContentFeed` identifies that source. `Publication` is deliberately reserved
for the future newsletter brand/publication configuration selected by the
operator in Milestone 2; it is not a synonym for a content feed.

### WordPress

For this POC, WordPress.com publishes the assembled approved newsletter as one
post. That interpretation is a prototype assumption, not a confirmed
production contract.

`NewsletterPublisher.publish(approvedNewsletterSnapshot)` creates or, for a
later current approval of the same draft, updates one WordPress.com post.
Repeating the same approval returns the stored publication and does not write
again. Credentials stay server-side. Failed writes are visible and do not fall
back to MockWordPress. Unknown writes are not retried blindly; a read-only
reconcile is used when a post ID already exists.

Historical `ContentPublisher` / `MockWordPress` / story `RealWordPress`
adapters may remain for regression. They are not part of the canonical
operator flow.

### Offers and rendering

The POC uses a Mock Everflow-style adapter only. The operator may choose zero or
more offers; the adapter supplies each tracking URL. Selected stories and offers
become blocks in one persisted mixed layout. That layout is the authoritative
source of newsletter order. Human placement is the advertisement placement
policy for this POC. There is no automatic advertisement placement and no
trailing Sponsored links regrouping.

Generate uses the selected layout and fixture canonical URLs. It does not
write to WordPress. Subject and preheader use the first Story block in layout
order, even if a Sponsored block appears first. The production
subject/preheader contract remains unvalidated.

### Preview, approval, publication, and staging

The exact rendered HTML and plain text must be previewed before a human
approves a snapshot. Approval is a deliberate operator action and binds to the
exact generated subject, preheader, HTML, plain text, and input fingerprint.
The unified layout order participates in that identity. Any later block
reorder, add, removal, or relevant story/offer input change makes generated
output stale and invalidates approval, WordPress publication currency, and
Iterable staging.

WordPress publication is current only while its stored approval fingerprint
matches the current approved snapshot. Staging requires both a current
approval and a current WordPress publication. `MockIterable` stages only that
approved snapshot plus the current WordPress post URL, guards against
duplicate staging, and returns a visible receipt. It never sends email. The
real Iterable contract remains unvalidated.

## Data flow and known boundary

1. The operator explicitly fetches the controlled fixture; `ContentSource`
   returns normalized stories and they are upserted.
2. The single operator chooses stories, optional Mock Everflow-style offers,
   and a mixed layout order.
3. Generate newsletter renders from the current layout and fixture canonical
   URLs. It performs no WordPress writes.
4. The workbench previews the output and records human approval of that exact
   snapshot.
5. The approved snapshot is published as one WordPress.com post. Later
   approved revisions update that same post.
6. Mock Iterable receives the approved snapshot and current WordPress URL and
   returns a receipt; the POC stops. No email is sent.

The precise production WordPress-to-newsletter and WordPress-to-Iterable
payloads remain unresolved. No implementation may claim those contracts.

## Mocked versus genuine behavior

| Behavior | POC mock behavior | Genuine behavior in this POC |
| --- | --- | --- |
| RSS | Controlled Benzinga-shaped fixture, explicit fetch only | No live compatibility claim and no scheduler |
| WordPress | Historical MockWordPress story-page adapter is off the happy path | One disposable WordPress.com test site publishes the approved newsletter as one post |
| Offers | Deterministic Mock Everflow-style catalog | No real Everflow integration |
| Delivery | Mock Iterable stage-only receipt | No real Iterable integration or email send |
| Credentials | None for mocks | Server-side only for WordPress.com |

## WordPress assumptions

- The only permissible live target is one disposable WordPress.com test site.
- Target-organization access, target-organization credentials, multi-site
  support, and 40-site fan-out are excluded.
- One newsletter draft maps to one stable WordPress post. Layout revisions
  update that post after a new approval; they do not create another post.
- Publishing uses the immutable approved snapshot, not newer draft state.
