# Architecture Contract

## Purpose and boundary

This document freezes a single-operator, modular POC architecture rather than
a production design. It makes a controlled newsletter workflow demonstrable
offline with deterministic fixtures and mocks. Human decisions remain explicit
at fetch, story selection, offer selection, layout arrangement, and approval;
no stage sends email.

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
                         Generate newsletter (MockWordPress story pages)
                           RealWordPress never called by Generate
                                                |
                                                v
                      deterministic newsletter renderer -> HTML/text preview
                                                |
                                                v
                           human approval -> Mock Iterable staging -> receipt
```

The POC ends after Mock Iterable staging. There is no real Iterable call or
email send.

## Components and responsibilities

| Component | Responsibility | Must not do |
| --- | --- | --- |
| Single Operator Workbench | Starts the manual flow; shows explicit fetch, story browsing, multi-select, mixed-block arrangement, preview, approval, and outcome. | Make automatic editorial or approval decisions, auto-fetch on page load, or call RealWordPress during Generate. |
| `ContentSource` adapter | Reads controlled RSS fixtures and normalizes provider-shaped items into domain `Story` records when Fetch latest stories is invoked. | Expose raw RSS/XML to the application domain, claim live-feed compatibility, or run on a scheduler. |
| Content persistence | Stores normalized content, future draft state, and the minimum state needed for deterministic POC behavior. | Create production data models outside the active milestone. |
| `ContentPublisher` contract | Defines a shared publishing/resolution request and normalized result. | Hide adapter failures or choose a fallback adapter. |
| `MockWordPress` | Required/default deterministic publisher with visible status, post ID, and URL. | Use a network connection or credentials. |
| `RealWordPress` | Optional Milestone 3B adapter for one disposable WordPress.com test site using server-side credentials. | Access the target organization, support multiple sites, or silently fall back to Mock mode. |
| Mock Everflow-style offer adapter | Provides a deterministic offer catalog and tracking URLs for operator choice of zero or more offers. | Call Everflow or select an offer automatically. |
| Newsletter renderer | Produces deterministic HTML and plain text from explicitly selected inputs. | Invent editorial content or perform a send. |
| Preview and approval boundary | Shows the exact render, records human approval bound to that snapshot, invalidates approval when generated output changes, and prevents duplicate staging. | Treat a draft as approved without an explicit human action, or stage rebuilt content after approval. |
| `NewsletterStager` | Provider-neutral staging boundary for an approved snapshot. | Call Iterable, manage an audience, or send email. |
| `MockIterable` | Stages an approved immutable snapshot and returns an idempotent receipt. | Call Iterable, manage an audience, or send email. |
| Configuration/secret boundary | Selects adapters and keeps optional real WordPress credentials server-side. | Expose credentials to a browser/client or store them in fixtures. |

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
polling is implemented. The same refresh operation could later be invoked by a
scheduler.

`ContentFeed` identifies that source. `Publication` is deliberately reserved
for the future newsletter brand/publication configuration selected by the
operator in Milestone 2; it is not a synonym for a content feed.

### WordPress

`MockWordPress` is required and must be deterministic and independently usable.
`RealWordPress` is optional and may be added only after Milestone 3A passes. A
real call may target one disposable WordPress.com test site, use server-side
credentials only, create one controlled fixture-backed post within the approved
scope, and return the observed normalized post ID, status, and URL.

Real failures are first-class results. A failed real call must be visible and
must not retry through, or be represented as, MockWordPress.

### Offers and rendering

The POC uses a Mock Everflow-style adapter only. The operator may choose zero or
more offers; the adapter supplies each tracking URL. Selected stories and offers
become blocks in one persisted mixed layout. That layout is the authoritative
source of newsletter order. Human placement is the advertisement placement
policy for this POC. There is no automatic advertisement placement and no
trailing Sponsored links regrouping.

The renderer then creates exact HTML and plain text from the ordered layout,
resolved publishing data when present, and selected offers. It is deterministic
and does not make editorial decisions. Subject and preheader use the first Story
block in layout order, even if a Sponsored block appears first. The production
subject/preheader contract remains unvalidated.

### Preview, approval, and staging

The exact rendered HTML and plain text must be previewed before a human
approves a snapshot. Approval is a deliberate operator action and binds to the
exact generated subject, preheader, HTML, plain text, and input fingerprint.
The unified layout order participates in that identity. Any later block
reorder, add, removal, resolved story URL change, or relevant story/offer
input change makes generated output stale and invalidates approval for
staging. `NewsletterStager` is the provider-neutral staging boundary.
`MockIterable` stages only the approved snapshot, guards against duplicate
staging, and returns a visible receipt. It never sends email. The real
Iterable contract remains unvalidated.

## Data flow and known boundary

1. The operator explicitly fetches the controlled fixture; `ContentSource`
   returns normalized stories and they are upserted.
2. The single operator chooses a newsletter brand/publication internally,
   stories, optional Mock Everflow-style offers, and a mixed layout order.
3. Generate newsletter resolves story pages through MockWordPress when no
   usable published URL exists. A previously recorded RealWordPress result may
   be used if already present. Generate never issues a real network write.
4. The renderer builds exact HTML and plain text from the unified layout.
5. The workbench previews the output, records human approval of that exact
   snapshot, and stages the approved snapshot to Mock Iterable.
6. Mock Iterable returns a receipt; the POC stops.

The precise WordPress-to-newsletter input remains unresolved: URL, excerpt,
full content, image, formatting, metadata, or any combination may be relevant.
No implementation may infer that payload before it is supplied.

## Mocked versus genuine behavior

| Behavior | POC mock behavior | Optional genuine behavior |
| --- | --- | --- |
| RSS | Controlled Benzinga-shaped fixture, explicit fetch only | No live compatibility claim and no scheduler |
| WordPress | Deterministic MockWordPress result | One disposable WordPress.com test site only, after 3A |
| Offers | Deterministic Mock Everflow-style catalog | No real Everflow integration |
| Delivery | Mock Iterable stage-only receipt | No real Iterable integration or email send |
| Credentials | None for mocks | Server-side only for optional RealWordPress |

## WordPress assumptions

- The only permissible live target is one disposable WordPress.com test site.
- Target-organization access, target-organization credentials, multi-site
  support, and 40-site fan-out are excluded.
- The test site, credential mechanism, post type, cleanup policy, and meaning
  of the one-post limit remain unresolved until Milestone 3B authorization.
