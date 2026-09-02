# Architecture Contract

## Purpose and boundary

This document freezes the POC architecture, not a production design. The POC
is a manually initiated, single-operator flow from a controlled RSS fixture to
a reviewable newsletter payload and a normalized WordPress publishing result.
The precise editorial/content-generation behavior is intentionally not defined
until its rules and approval point are supplied.

## Concise architecture

The workbench orchestrates a source adapter, a reviewable content workflow,
and a publishing port. The source side is fixture-backed for the POC. The
publishing port is implemented first by the required, deterministic
`MockWordPress` adapter. `RealWordPress` is an optional adapter that can be
added only after Mock validation passes.

```
Controlled RSS fixture
        |
        v
RSS source adapter -> normalized candidate -> reviewable newsletter payload
                                                    |
                                                    v
                                         WordPress publishing port
                                            |                 |
                                            v                 v
                                   MockWordPress       RealWordPress (optional)
                                   deterministic       one disposable test site
                                            \                 /
                                             v               v
                                  normalized post ID, status, URL + adapter name
```

## Components and responsibilities

| Component | Responsibility | Must not do |
| --- | --- | --- |
| Workbench/orchestrator | Starts the manual POC run, carries state between boundaries, and presents the selected adapter and outcome. | Schedule unattended work or mask a failed result. |
| RSS source adapter | Reads a controlled fixture and maps its entries to a normalized candidate contract. | Claim a live stakeholder feed has been supported. |
| Content workflow/review boundary | Produces and exposes a reviewable newsletter payload before publishing. | Autonomously approve or publish content without an explicit POC rule. |
| WordPress publishing port | Defines the request and normalized result shared by all WordPress adapters. | Embed an adapter-specific fallback policy. |
| `MockWordPress` | Required/default deterministic adapter; returns a reproducible normalized fixture result. | Call WordPress or depend on credentials. |
| `RealWordPress` | Optional adapter; uses server-side credentials to create one controlled fixture-backed post on one disposable WordPress.com test site. | Access the target organization's WordPress, support multiple sites, or silently substitute a mock result. |
| Configuration/secret boundary | Selects the adapter and keeps any real credentials server-side. | Expose credentials to a browser/client or persist them in fixtures. |

## Adapter boundaries

### RSS source adapter

The initial source contract is **Benzinga-shaped RSS** and is deliberately
provisional. It is only a fixture schema used to make the POC testable until a
representative stakeholder feed is available. A real feed may require a revised
mapping, but no compatibility claim is valid before that comparison occurs.

### WordPress publishing port

Every publisher adapter must accept the same approved publishing request and
return a normalized result with, at minimum:

- adapter name/mode;
- post ID;
- status; and
- URL.

Errors are first-class results. When `RealWordPress` is selected, a failed call
must remain visible as a real failure. The calling flow must not retry through
`MockWordPress` or report a mock response as if it came from WordPress.

### MockWordPress

`MockWordPress` is the required/default adapter and must be independently
usable. For the same fixture-backed request, it must provide a deterministic
result. It is not evidence of a live WordPress integration.

### RealWordPress

`RealWordPress` is optional POC scope. It may be implemented only after
Milestone 3A validates `MockWordPress`. It may target one disposable
WordPress.com test site, use server-side credentials only, create one
controlled fixture-backed post, and return the observed normalized ID, status,
and URL. No target-organization site access and no multi-site mode are permitted.

## Data flow

1. An operator initiates a POC run.
2. The RSS adapter reads the controlled fixture and normalizes an entry.
3. The content workflow creates a reviewable payload under explicit future
   editorial rules.
4. The configured WordPress adapter receives the approved POC request.
5. The adapter returns either a normalized success result or an explicit
   failure result.
6. The workbench displays the adapter identity and exact outcome.

The mock path can complete entirely without network access or credentials. The
real path is distinct and optional; no automatic path-switching is allowed.

## WordPress assumptions

- The only allowable live target is one disposable WordPress.com test site.
- The test site and server-side credential mechanism have not been provided in
  this baseline.
- Any real use is limited to one controlled fixture-backed post within the
  explicitly approved POC scope; whether that means one total or one per
  approved demonstration remains unresolved.
- Results must expose the actual normalized post ID, status, and URL when
  available, or an honest failure when unavailable.

## Mocked versus genuine behavior

| Behavior | Mock mode | Real mode |
| --- | --- | --- |
| RSS input | Controlled fixture | Controlled fixture for this POC |
| WordPress interaction | Deterministic simulated result | Actual call to the single disposable test site |
| Credentials | None | Server-side only |
| Post creation | No real post | At most one controlled fixture-backed post |
| Failure handling | Deterministic reported result | Report the actual failure; no silent fallback |
| Evidence provided | Testable adapter contract | Limited live integration evidence only |
