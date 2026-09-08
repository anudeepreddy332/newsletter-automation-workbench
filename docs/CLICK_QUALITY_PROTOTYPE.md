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

## Phase 2 (implemented)

Deterministic `cq-feat-v1` extraction (`extractor_version` `cq-extractor-v1.0.0`)
writes one append-only row per event to `click_quality.event_features`.

```bash
npm run click-quality:extract-features
```

v1 permits only one feature row per `event_id`. Repeat runs stay at 90 rows.
A hash mismatch for the same schema/extractor versions fails instead of
overwriting. `extracted_at` is not part of feature identity.

Families: F1 transport/client, F2 network, F3 velocity/burst, F4 recurrence,
F5 client capability, F6 human-plausible timing, F7 context. No
`forward_candidate`. UA precedence is `known_scanner > http_library >
headless_browser > browser_like`. ASN email-security is synthetic-rule only.

Evidence quality is `COMPLETE` / `PARTIAL` / `SPARSE`. Feature status is
`OBSERVED` / `MISSING` / `NOT_APPLICABLE`. `feature_vector_hash` is SHA-256 of
canonical `feature_vector` JSON.

No scoring, weights, thresholds, classification, ground-truth reads, or
evaluation metrics exist yet. Feature rows do not store `classifier_version`.

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
