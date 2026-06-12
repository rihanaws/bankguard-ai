
# Pipeline Contract Rules (data isolation between model tiers)

## Stage map

| Stage | Model | Contract | Sees | Must NOT see / do |
|---|---|---|---|---|
| 1 Extraction | `claude-haiku-4-5-20251001` (vision, temp 0) | `extract.contract.ts` (extract.v1) | Raw PDF/image only | NO inference. Copy-only transcription. Unknown ⇒ null. Never speculates about SARs/triggers. |
| 2 Classification | `claude-haiku-4-5-20251001` (text, temp 0) | `classify.contract.ts` (classify.v1) | Structured `ExtractionV1` + `CaseContextSnapshot` ONLY | NEVER the raw document. Probabilities must sum to 1.0 ±0.02; topTrigger must be argmax; HIGH confidence requires explicit categorical language. |
| 3 Diagnosis & Appeals | `claude-sonnet-4-6` | `diagnose.contract.ts` (diagnose.v1) | ExtractionV1 + ClassificationV1 + RAG chunk payloads (tier from DB) | Cites ONLY supplied chunk IDs. Tier B cited as "observed pattern (n=X)" never authority. Letter must pass the programmatic compliance gate. |

## Isolation invariants

1. **Stage 2 sees structured features only** — interface stays identical to a future supervised-classifier swap. Never pass document bytes or raw text into stage 2.
2. **Citation tier comes from the database** (`KbDocument.reliabilityTier`), NEVER from LLM output. The UI and stage 3 prompt receive tier as input.
3. **All inter-stage payloads validate through Zod before persistence.** Validation failure ⇒ one repair attempt (stage 1–2: full repair prompt; stage 3: SECTIONED repair — repair only the failing JSON path via a Haiku repair call, never re-run the full Sonnet pass).
4. **Versioning:** every contract exports `*_VERSION` and `*_MODEL` constants persisted alongside output (`Document.extractionVersion`, `Diagnosis.classifierVersion`, `Diagnosis.reportVersion`). Any prompt/matrix change bumps the version string.
5. **Short-circuit gate (cost control):** after stage 1, if `reasonGiven === true`, the stated reason maps to FEE_OPERATIONAL, and no funds are held ⇒ emit a lightweight report and skip the Sonnet call.
6. **Compliance gate is code, not model self-report:** `runComplianceGate()` in diagnose.contract.ts programmatically scans generated letters (SAR-assertion language, missing disclaimer, missing placeholders). `complianceGatePassed` persisted to the DB is `modelSelfReport && programmaticGate`. Export/copy in the UI keys off the DB field only.

## Legal trinity (applies to every prompt and every output surface)

- Never assert a SAR was filed or that an investigation exists.
- Never promise outcomes (reinstatement, approval).
- Never give legal advice — outputs are "informational diagnostic" material.

## DB access from workflows

Workers import the singleton `prisma` from `@/lib/prisma` — never construct clients. Job claiming uses `FOR UPDATE SKIP LOCKED` (reference SQL in `prisma/sql/0001_pgvector.sql`).
