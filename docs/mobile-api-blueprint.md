# Mobile API Blueprint — Headless REST Layer (`/app/api/v1`)

Decoupled data backbone for the native iOS (Swift) and Android clients. The
mobile apps never render server HTML — they consume versioned JSON envelopes
from this layer; all application logic stays server-side.

## Envelope (every response)

```json
{
  "data": {},
  "error": null,
  "meta": { "apiVersion": "v1", "requestId": "uuid", "timestamp": "ISO", "nextCursor": null }
}
```

Helpers: `lib/api.ts` (`ok` / `fail` / `notImplemented` / `requireBearer`).
Input schemas: `lib/api-schemas.ts` (shared Zod — single source of truth for
client codegen).

## Route tree

```
app/api/v1/
├── health/route.ts                      GET    liveness (unauthenticated)
├── cases/route.ts                       GET    list cases (cursor paginated)
│                                        POST   create case shell (INTAKE)
├── cases/[caseId]/route.ts              GET    case detail + verdict summary
│                                        PATCH  outcome / corpusOptIn updates
├── cases/[caseId]/documents/route.ts    GET    docs + extraction status
│                                        POST   signed-upload intent → enqueues EXTRACT_DOCUMENT
├── cases/[caseId]/diagnoses/route.ts    GET    diagnosis history (read-only; pipeline-produced)
├── cases/[caseId]/letters/route.ts      GET    letter versions (body gated on complianceGatePassed)
│                                        POST   enqueue GENERATE_LETTER → 202 + job ref
├── risk-assessments/route.ts            GET    history
│                                        POST   deterministic bankability scoring run
└── bank-profiles/route.ts               GET    curated bank appetite directory
```

## Contract rules for mobile clients

1. **Auth:** `/health` is public. Every other route currently fails closed with
   `401`, including requests carrying arbitrary bearer values. Protected routes
   remain inaccessible until hashed org-token persistence, safe verification,
   revocation, and tenant resolution are implemented. No current bearer value
   is treated as an authenticated principal.
2. **Async pipeline:** document upload and letter generation are queue-backed.
   Clients poll case status (`INTAKE → EXTRACTING → CLASSIFYING → DIAGNOSING →
   REVIEW`) or subscribe to push later — never block on a request.
3. **Compliance gating is server truth:** letter bodies are only returned when
   the persisted `complianceGatePassed` is true. Clients never re-evaluate.
4. **Citation tiers come from the DB** and arrive pre-labeled; Tier B payloads
   always include `n` (community sample size) for the mandatory disclosure line.
5. **Money:** integer cents + ISO currency. **Dates:** ISO 8601 UTC strings.
6. **Versioning:** breaking changes fork `/api/v2`; v1 envelopes never change
   shape. Additive fields only.

## Worker reliability

Pipeline workers use PostgreSQL `FOR UPDATE SKIP LOCKED` claims. A `RUNNING`
job whose lease exceeds `PIPELINE_JOB_LEASE_MS` (default 300000 ms) is
reclaimable. Stage persistence and downstream enqueue happen in one database
transaction, with nullable idempotency keys so existing rows remain valid.

## Native client mapping

| Surface | iOS/Android view | Endpoint(s) |
|---|---|---|
| Case list + status chips | CaseListView | GET /cases |
| Case detail / report | CaseReportView (verdict-first order) | GET /cases/:id, GET /cases/:id/diagnoses |
| Upload flow | DocumentScanSheet | POST /cases/:id/documents |
| Letters | LetterViewer (export disabled unless gate passed) | GET/POST /cases/:id/letters |
| Bankability check | RiskAssessmentFlow | POST /risk-assessments |
| Bank browser | BankDirectoryView | GET /bank-profiles |
