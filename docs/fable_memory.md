# Fable Memory — BankGuard AI build log

Ephemeral local state for long-horizon continuity. Append-only.

## 2026-06-12 — Repo initialization sprint

### Block 1 — Scaffold

- Root-level layout enforced: `/app`, `/components/ui`, `/lib`, `/workflows`, `/prisma`, `/docs`, `/scripts`. NO `src/` anywhere.
- Bun-only scripts in package.json (`bun --bun next dev`, `bun x tsc`, `bun x prisma`). npm/npx/yarn/pnpm never referenced.
- `scripts/check-no-raw-hex.sh` = the CI build-fail gate; the only hex-permitted file is `app/globals.css`.

### Block 2 — Prisma 7 layer

- `prisma.config.ts` at root: schema path + migrations path + datasource URL from env via dotenv. No URL in schema file (Prisma 7 convention).
- ARCHITECTURAL ADJUSTMENT: source schema declared generator output `../src/generated/prisma` — violates the no-src invariant. Relocated to `../lib/generated/prisma`; `lib/prisma.ts` singleton imports from there; path excluded from tsconfig include and gitignored.
- pgvector raw SQL companion at `prisma/sql/0001_pgvector.sql` (extensions + HNSW index + SKIP LOCKED claim query reference).

### Block 3 — Pipeline contracts

- `/workflows/contracts/extract.contract.ts` (extract.v1, copy-only invariant, verbatim keyPhrases, repair loop) and `classify.contract.ts` (classify.v1, phrase→trigger priors matrix, probability-sum + argmax superRefine).
- Adjustment for TS strict + noUncheckedIndexedAccess: classify reduce typed `reduce<number>`; argmax guarded with `top &&`.

### Block 4 — Tokens + app shell

- Exact `@theme` block landed in `app/globals.css`. Geist/Geist Mono wired via next/font/google in `app/layout.tsx`; dark-first body on ink-950.

### Block 5 — UI primitives

- `ConfidenceBadge`: LOW = conf-low gray + honesty copy ("Limited evidence — generic letter language only."), role="status", color always paired with text label.
- `VerbatimQuote`: mono-token blockquote + category chip (mirrors PhraseCategory), highlighted state = brand-300 ring. Legal separation of bank language vs inference.
- `CitationCard`: tier from DB only; TIER_B always renders sample-size line and anecdotal disclaimer, never authority phrasing; expand/collapse is a real button with aria-expanded/aria-controls.
- Zero raw hex in any component; zero exclamation marks in UI copy; probabilistic verbs throughout ("is consistent with").

### Block 6 — Verification loop (all green)

- `bun install` → resolved: prisma 7.8.0, @prisma/client 7.8.0, next 15.5.19, react 19.2.7, tailwindcss 4.3.0, zod 3.25.76, typescript 5.9.3.
- `bun x prisma validate` → schema valid (config loaded from root prisma.config.ts as designed).
- `bun x prisma generate` → client emitted to `lib/generated/prisma`.
- HURDLE CLEARED: Prisma 7's `prisma-client` generator produces an engine-less client whose constructor REQUIRES `{ adapter }` or `{ accelerateUrl }` — bare `new PrismaClient()` is a compile error (TS2554). Fix: added `@prisma/adapter-pg@7.8.0`; `lib/prisma.ts` now builds `new PrismaPg({ connectionString })` from DATABASE_URL and passes it as the adapter. Remember this for every future worker entrypoint in /workflows.
- `bun x tsc --noEmit` → clean under strict + noUncheckedIndexedAccess.
- `scripts/check-no-raw-hex.sh` → passed; only hex lives in app/globals.css @theme.
- `bun run build` (next build, production) → compiled successfully; / prerenders static at ~103 kB first-load JS.

### Next sprint hooks

- Week 3–4: TriggerBar + report layout (verdict-first, max-w-3xl), diagnosis pipeline stage 3 contract (diagnose.contract.ts, claude-sonnet-4-6 + RAG).
- Short-circuit gate after extraction (reasonGiven + FEE_OPERATIONAL + no funds held → skip Sonnet).
- Workers in /workflows poll PipelineJob with FOR UPDATE SKIP LOCKED (SQL reference in prisma/sql/0001_pgvector.sql).

## 2026-06-12 — Workspace automation + Weeks 3–4 sprint

### Block 7 — Cursor rules + workspace configs

- `/.cursor/rules/` created: `tech-stack.mdc` (Bun-only, no-src, Prisma 7 adapter pattern, Next 15 async params), `design-system.mdc` (token semantics, hex build-fail gate, verbatim mono safeguard, WCAG baseline), `pipeline-contracts.mdc` (stage isolation matrix, sectioned repair, compliance-gate-is-code, legal trinity). All `alwaysApply: true`.
- Root `CLAUDE.md`: command table, 4-step pre-finalize protocol, architecture invariants, code style, memory protocol.
- `docs/memory_state.json`: machine-readable state matrix (toolchain, invariants, features, dataHooks, buildChanges, nextTargets).

### Block 8 — Headless API layer (/app/api/v1)

- Path layout validated: 8 route handlers — health, cases (GET/POST), cases/[caseId] (GET/PATCH), documents (GET/POST signed-upload intent), diagnoses (GET, read-only), letters (GET/POST 202-enqueue), risk-assessments (GET/POST), bank-profiles (GET).
- HURDLE CLEARED: Next.js route modules may only export HTTP handlers — Zod input schemas moved to `lib/api-schemas.ts` (also the codegen source for Swift/Kotlin clients). Envelope helpers in `lib/api.ts` ({data,error,meta}, bearer placeholder, 501 stubs).
- Mobile blueprint at `docs/mobile-api-blueprint.md` (envelope contract, async-pipeline polling rule, server-truth compliance gating, native view mapping).

### Block 9 — TriggerBar

- `components/ui/trigger-bar.tsx`: probability → inverted score band mapping (p≥0.61 critical / 0.31–0.60 elevated / 0.16–0.30 moderate / ≤0.15 clear); static class maps so Tailwind sees literal utilities; role="progressbar" + printed percentage (never color-alone); expand = real button with aria-expanded/aria-controls; smooth reveal via grid-rows 0fr→1fr with --ease-standard/--duration-base; evidence rendered as mono verbatim blocks. Integrated into app/page.tsx as a 4-bar distribution (top trigger defaultExpanded).

### Block 10 — Stage 3 contract + engine

- `workflows/contracts/diagnose.contract.ts` (diagnose.v1, claude-sonnet-4-6): RagChunkPayload (tier from DB), DiagnosisV1Schema (synthesisBreakdown ≥200 chars, probableReasons w/ sum guard, regulatoryBasis by chunkId, recommendedActions, caveats, complianceGatePassed, generatedAppealLetter w/ placeholder vocabulary), programmatic `runComplianceGate` (SAR-assertion regexes, outcome-promise regexes, required placeholders, informational footer, exclamation ban) + `validateCitations` (cited chunkIds ⊆ supplied set), SECTIONED repair (failing top-level keys → Haiku → splice → revalidate; Sonnet never re-run).
- `workflows/engine.ts`: injectable ModelInvoker; stage runners w/ repair loops; `shouldShortCircuit` (reasonGiven + FEE_OPERATIONAL top + no funds held); `runCasePipeline` persisted gate = model self-report AND letter gate AND citation gate.
- `scripts/smoke-pipeline.ts`: 14/14 checks pass (fixture validation, full handoff, short-circuit path skips Sonnet, gate rejects SAR-assertion letter).

### Block 11 — Verification (all green)

- `bun x tsc --noEmit` clean · `bun run lint:tokens` passed · `bun run build` compiled, all 8 /api/v1 routes registered as dynamic functions, / static at ~103 kB · `bun scripts/smoke-pipeline.ts` 14/14.

### Next-phase actionable cards

1. Wire real Anthropic client as ModelInvoker in a /workflows worker entrypoint polling PipelineJob (SKIP LOCKED claim).
2. Implement /api/v1 data layer against `@/lib/prisma` + org-scoped API tokens (replace requireBearer placeholder).
3. RAG retrieval worker: pgvector cosine top-k seeded from phrase categories (parallel with classify per masterplan §4.1.1).
4. Week 5: BankabilityGauge + BankMatchRow + deterministic bankability.v1 scoring engine.
5. LetterPreview component keyed off persisted complianceGatePassed; DisclaimerFooter (non-dismissible).

## 2026-06-12 — Phase 1 engineering hardening

### Block 12 — Contracts, boundaries, and security

- Added one bounded reusable JSON/Zod repair runner. Extraction and classification repairs receive the original input, invalid output, and validation issues; repaired output is revalidated.
- `classify.v1` now requires the complete strict eight-trigger distribution, preserves the ±0.02 mass tolerance, and accepts `topTrigger` only when tied for the maximum.
- Added static ISO-3166, ISO-4217, and USPS jurisdiction boundary schemas. Country, corridor, currency, and state values normalize to uppercase before deterministic scoring. The ISO-4217 list was checked against SIX List One published 2026-01-01 (`XAD`/`XCG` active; `ANG`/`BGN` historical).
- Local filesystem storage now uses resolved relative-path containment and rejects traversal, sibling-prefix, POSIX absolute, and Windows absolute keys.
- Protected `/api/v1` routes fail closed with 401 until complete hashed org-token verification and tenant resolution exist. `/health` remains public.
- Next output tracing now anchors to the actual project root while `/workflows` remains excluded.

### Block 13 — Queue reliability and state correctness

- Added nullable additive fields for job idempotency, case failure reasons, and job-to-diagnosis/letter linkage. Added a development migration; it was not applied to production.
- Worker payloads are strict Zod contracts for every `JobKind`; malformed and unimplemented jobs fail permanently with clear reasons.
- Worker startup is guarded by `import.meta.main`. Claims reclaim stale `RUNNING` jobs after `PIPELINE_JOB_LEASE_MS` while retaining `FOR UPDATE SKIP LOCKED`.
- Stage persistence and downstream enqueue now share interactive transactions. Downstream jobs and generated artifacts use deterministic idempotency.
- Terminal jobs use `FAILED`, persist `lastError`/`completedAt`, and atomically mark resolvable cases `FAILED` with `failureReason`.
- Short-circuited fee/operational cases persist `lightweight-report.v1` before generated `CaseStatus.REVIEW`; diagnosis and letter states are explicitly `SKIPPED`, with `sonnetCallAvoided: true`.

### Block 14 — Test coverage

- Added Bun tests for storage containment, contract repair, probability integrity, ISO parity, fail-closed auth, payload validation, lease reclaim eligibility, rollback behavior, idempotency, terminal failure, and artifact ordering.
- Extended the pipeline smoke script to prove Sonnet is not called on short-circuit, validate `lightweight-report.v1`, and verify artifact persistence precedes `REVIEW`.
- Final verification: `bun test` 36/36 passed; `bun run db:validate` valid; `bun run db:generate` generated Prisma 7.8.0 client; `bun run typecheck` passed; `bun run lint:tokens` passed; `bun run build` passed without the prior output-tracing-root warning; `bun scripts/smoke-pipeline.ts` passed all checks.
