# Implementation Plan

## Governing sequence

No milestone may begin until the previous milestone passes independent review.
This sequence is the implementation contract; code must not add a later
boundary early merely because it appears technically convenient.

| Milestone | Scope | Exit criteria and required validation |
| --- | --- | --- |
| 0 — Architecture/documentation baseline | Freeze the problem, scope, boundaries, assumptions, demo criteria, and privacy-safe terminology. | All four contract documents agree on the complete RSS-to-Mock-Iterable workflow, exclusions, unresolved WordPress-to-newsletter payload, and Milestones 0–6. |
| 1 — Deterministic content foundation | RSS fixture -> parsing -> normalized content model -> SQLite persistence -> tests. | Deterministic parser/normalizer and migration-backed persistence pass focused tests for repeatability, optional values, malformed XML, URL validation, and round trips. |
| 2 — Single workbench selection flow | Publication/newsletter-brand selection; story browsing; manual story selection and ordering; draft persistence. | Operator choices and draft state are explicit, persisted, and testable. No publishing, offers, rendering, approval, or staging is added. |
| 3A — MockWordPress | `ContentPublisher` contract; deterministic MockWordPress; visible status/post ID/URL; controlled failure; no network. | Contract and integration tests prove independent deterministic mock success/failure behavior. This must pass before 3B. |
| 3B — RealWordPress (optional) | One disposable WordPress.com test site; server-side authentication; controlled post creation; observed post ID/status/URL; no silent fallback. | Security and controlled success/failure validation confirm one-site, server-side, honest real behavior. Stop without explicit target, credential, cleanup, and write-scope authorization. |
| 4 — Offer selection + deterministic newsletter rendering | Mock Everflow catalog; operator offer selection; tracking URL; subject/preheader; deterministic HTML and plain text. | Same selected inputs yield exact HTML/plain-text output; no real Everflow or editorial automation exists. |
| 5 — Preview + approval + Mock Iterable | Exact preview; human approval; edits invalidate approval; stage-only Mock Iterable; idempotent staging; receipt; no send. | Tests prove approval protection, duplicate-staging protection, receipt visibility, and absence of real delivery. |
| Operator workflow correction | Explicit fetch; multi-select pickers; unified mixed-block layout; Generate from layout/fixture URLs; exact preview and approval. This is not Milestone 6. | Tests prove fetch honesty, mixed layout identity, exact ordered rendering, stale approval, and MockIterable regressions. |
| WordPress newsletter publication | Publish the approved newsletter as one WordPress.com post, then stage Mock Iterable. This is a POC assumption, not stakeholder-confirmed production behavior, and is not Milestone 6. | Tests and controlled live CREATE/UPDATE prove one post per draft, same-approval idempotency, revision updates, and staging gated on current WordPress publication. |
| 6 — Demo hardening | Complete end-to-end happy path; controlled failures; offline deterministic demo; final demo script; limitations/evidence review. | Independent review confirms complete evidence, known limitations, and claims bounded to what the demo proves. |

## Stop conditions

- Do not begin Milestone 2 before independent Milestone 1 review approval.
- Do not begin 3B until 3A passes independently.
- Do not make a real WordPress call without explicitly approved disposable-site
  scope and server-side credentials.
- Do not implement real Everflow, real Iterable, email delivery, automatic
  editorial decisions, production authentication, analytics, queues,
  microservices, workflow engines, or production deployment.
- Do not infer the WordPress-to-newsletter payload or claim live-feed
  compatibility without supporting stakeholder evidence.
