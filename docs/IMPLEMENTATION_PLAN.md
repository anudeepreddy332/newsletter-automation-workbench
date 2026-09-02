# Implementation Plan

## Governing sequence

This plan starts after the documentation baseline is reviewed. No milestone
authorizes a later milestone merely because its code exists: the stated exit
criteria and validation must pass first. `MockWordPress` is mandatory and
precedes all real WordPress work.

| Milestone | Objective | Exit criteria | Required validation before proceeding |
| --- | --- | --- | --- |
| 0 — Documentation baseline | Freeze the POC contract, scope, adapter policy, and unanswered questions. | `README.md`, architecture, assumptions, and plan agree on deterministic Mock-first behavior, optional RealWordPress, provisional Benzinga-shaped schema, no target-organization access, and no silent fallback. | Document review identifies no unresolved contradiction; any open product decision remains explicitly recorded rather than implemented by assumption. |
| 1 — Source fixture and normalization contract | Define the controlled RSS fixture and normalized candidate contract. | Fixture provenance/use is recorded; required/optional fields, validation behavior, and failure cases are explicit. The contract still labels the Benzinga-shaped schema provisional. | Deterministic fixture-validation tests pass; a reviewer confirms no live stakeholder-feed compatibility claim is implied. |
| 2 — Reviewable content workflow | Implement the manually initiated flow that exposes a newsletter payload before publishing. | The payload, selection/editing rules, approval point, and invalid-input behavior are explicit and observable. No unattended publishing exists. | End-to-end fixture-to-review-boundary test passes; approved editorial/approval rules are present and no decision logic was invented beyond them. |
| 3A — MockWordPress | Implement the required/default deterministic WordPress adapter and shared publishing result contract. | Mock mode works without network or credentials and returns reproducible adapter name, post ID, status, and URL for the same fixture-backed request. | Unit and integration tests prove determinism, independent Mock usability, and displayed adapter identity/outcome. **This milestone must pass before 3B begins.** |
| 3B — RealWordPress (optional) | Add the bounded live adapter only if an approved disposable test site and server-side credentials are supplied. | A real call can create at most one controlled fixture-backed post on the approved one-site target and returns observed normalized ID, status, and URL. | Security review confirms no client-side credential exposure; a controlled success and a controlled failure path prove no Mock fallback. Stop if the permitted site/credentials/write scope are not explicitly available. |
| 4 — Honest outcome integration | Make adapter selection, success, and failure visible through the full POC flow. | Mock and optional Real results are distinguishable; a Real failure is reported as a failure with no hidden switch to Mock. | End-to-end tests cover Mock success, Real success when configured, Real failure, and unavailable Real configuration. Assertions verify the shown mode and result match the adapter outcome. |
| 5 — Bounded demo rehearsal | Rehearse the single-operator demo using controlled fixtures and the approved adapter mode. | The demo meets every applicable README success criterion and produces a concise outcome record. | Repeatability check for the Mock demo passes. If Real is rehearsed, inspect the actual test-site result and confirm the one-post constraint; do not substitute Mock evidence. |
| 6 — Review handoff | Prepare the POC evidence and known limits for a go/no-go review. | Evidence links results to the fixture, configuration mode, tests, and any live post URL/status; unresolved questions and exclusions remain visible. | Independent review confirms the demo claims do not exceed the evidence. No production release, target-organization access, multi-site expansion, or additional automation proceeds without new authorization. |

## Stop conditions

- Do not start application work until Milestone 0 is reviewed.
- Do not start 3B until 3A has passed.
- Do not make a RealWordPress call without the explicitly approved disposable
  site, server-side credentials, and interpretation of the one-post limit.
- Do not claim live-feed compatibility without a representative stakeholder feed
  comparison.
- Do not convert a real failure into a mock success or continue by silent
  fallback.
