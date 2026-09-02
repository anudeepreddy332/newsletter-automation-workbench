# Assumptions and Open Questions

## Verified stakeholder facts

The following facts are treated as approved for the documentation baseline:

- This is a Newsletter Automation Workbench POC, not a production automation
  commitment.
- Documentation and repository initialization are the first task; application
  functionality is not authorized yet.
- `MockWordPress` is the required/default deterministic WordPress adapter.
- `RealWordPress` is optional POC scope and can target only one disposable
  WordPress.com test site.
- Real WordPress credentials must remain server-side.
- A real adapter may create one controlled fixture-backed post and must return
  normalized post ID, status, and URL.
- A failed real call must be shown honestly; there is no silent fallback.
- Mock mode must remain independently usable.
- Target-organization WordPress access and multi-site support are excluded.
- Milestone 3A implements and validates Mock first; 3B may add Real only after
  3A passes.

## POC assumptions

- An operator will manually initiate and observe each POC run.
- A controlled RSS fixture can stand in for a live source during the POC.
- The workbench will have a reviewable payload before the publishing boundary
  is invoked; the precise review UI and editorial rules are not frozen here.
- A common WordPress publishing port can return adapter name, post ID, status,
  and URL for both adapters.
- The initial **Benzinga-shaped RSS schema is provisional until a
  representative stakeholder feed is available**. It is suitable only as a
  testable initial fixture contract, not proof of live-feed compatibility.
- Any real demonstration will have an identified disposable WordPress.com site
  and provisioned server-side credentials before RealWordPress is attempted.

## Unresolved questions

| Question | Why it matters | Required before |
| --- | --- | --- |
| What representative stakeholder RSS feed/sample is available, and may it be stored as a test fixture? | Confirms or changes the provisional source mapping. | Any live-source compatibility claim. |
| Which fields in the provisional Benzinga-shaped schema are required, optional, or unsupported? | Defines the normalization and validation contract. | Milestone 1 exit. |
| What makes an item eligible for the newsletter? | Prevents inventing selection logic. | Content workflow implementation. |
| What exact newsletter payload and editorial review/approval rules are required? | Defines the review boundary and publishing request. | Milestone 2 exit. |
| Who may initiate a run and approve publishing in the POC? | Defines the manual control and authorization model. | Any publish-capable demo. |
| What disposable WordPress.com test site, credential method, post type, and cleanup policy are approved? | Bounds the optional live integration safely. | Milestone 3B start. |
| Does “one controlled fixture-backed post” mean one per demo run or one total across the POC? | Prevents exceeding the permitted live-write scope. | First RealWordPress call. |
| What status vocabulary and URL behavior should the normalized result use on a real error? | Keeps outcome reporting consistent and honest. | WordPress port finalization. |
| Is a live stakeholder RSS read in scope after a representative feed is supplied? | Separates a schema check from expanding the POC's network scope. | Any live-source work. |

## Baseline decision

Until the unresolved questions are answered in writing, implementation must use
controlled fixtures, retain `MockWordPress` as the default, and avoid claiming
stakeholder-feed compatibility or live WordPress success.
