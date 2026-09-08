# Click-Quality Prototype

This is an educational synthetic click-quality experiment. It is not a
production traffic filter, not a billing system, and not a replacement for
Anura or any commercial fraud product.

The work lives on `feature/click-quality-prototype`, created from the
integration-hardening drill at `c7b2ddb12790a5ad97790ca808a56e2824d07777`.
Approved main demo architecture and SQLite newsletter state are unchanged.

## Phase 0 (frozen)

Classify **individual HTTP requests**, not recipients. Later phases will emit
`LIKELY_AUTOMATED`, `LIKELY_HUMAN`, or `AMBIGUOUS_REVIEW` from deterministic
weighted evidence. Missing evidence is not human evidence. Synthetic accuracy
must never be presented as production accuracy.

## Phase 1 (implemented)

Controlled `cq-event-v1` fixtures are validated, normalized, and upserted into
Postgres `click_quality.events` only.

```bash
export INTEGRATION_DATABASE_URL=postgres://integration:integration@127.0.0.1:5433/newsletter_integration
npm run integration:db:migrate
npm run click-quality:ingest
```

Repeated ingest keeps 90 rows. The loader reads `events.v1.json` only.

Not in this phase: feature extraction, scoring, classification, evaluation
metrics, dashboards, or UI.

## Boundaries

- No ML and no LLM classifier
- No Anura replacement claim
- No billing decisions
- No production accuracy claim
- No real Iterable integration
- No real click tracking and no themachinist.org deployment
- No raw IP or email addresses
- Exploratory/challenge membership lives only in
  `tests/fixtures/click-quality/experiment-manifest.v1.json`
- Labels live only in `tests/fixtures/click-quality/ground-truth.v1.json`
