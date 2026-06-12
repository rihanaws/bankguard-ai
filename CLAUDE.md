# BankGuard AI — CLAUDE.md

Forensic diagnostic SaaS for unexplained US business bank account terminations.
Founder: Sayem Abdullah Rihan (TechSci Inc, Delaware C-Corp; operating from Dhaka, BD).

## Commands (Bun ONLY — npm/npx/yarn/pnpm are forbidden)

| Action | Command |
|---|---|
| Install deps | `bun install` |
| Dev server | `bun run dev` |
| Production build | `bun run build` |
| Typecheck (must pass before any commit) | `bun run typecheck` |
| Token gate (must pass before any commit) | `bun run lint:tokens` |
| Generate Prisma client | `bun run db:generate` |
| Migrate dev DB | `bun run db:migrate` |
| Validate schema | `bun run db:validate` |
| Run a script/worker | `bun scripts/<file>.ts` / `bun workflows/<file>.ts` |
| Pipeline smoke test | `bun scripts/smoke-pipeline.ts` |

## Pre-finalize protocol (run in order, all must pass)
1. `bun run typecheck`
2. `bun run lint:tokens`
3. `bun run build` (when app/ or components/ changed)
4. `bun scripts/smoke-pipeline.ts` (when workflows/ changed)

## Architecture invariants
- **NO `src/` directory.** Root-level: `/app`, `/components/ui`, `/lib`, `/workflows`, `/prisma`, `/docs`, `/scripts`, `/.cursor`. Alias `@/*` = root.
- **Prisma 7:** config in root `prisma.config.ts`; URL from env only. Generated client at `lib/generated/prisma` (gitignored — regenerate after pull). NEVER `new PrismaClient()` — import `{ prisma }` from `@/lib/prisma` (engine-less client requires the @prisma/adapter-pg adapter).
- **Pipeline:** Stage 1 extract (Haiku 4.5 vision, copy-only) → Stage 2 classify (Haiku 4.5 text, structured features only) → Stage 3 diagnose (Sonnet 4.6 + RAG). Contracts in `/workflows/contracts/*.contract.ts`; all payloads Zod-validated; versions persisted.
- **`/workflows` deploys separately** (Hetzner workers) and is excluded from Next output tracing.

## Code style
- TypeScript strict + `noUncheckedIndexedAccess`. Zod schemas are the source of truth; derive types via `z.infer`.
- Server Components by default; `"use client"` only for interactive primitives.
- UI: semantic tokens only — raw hex anywhere outside `app/globals.css` fails CI. Risk colors map to score bands and nothing else. Verbatim bank language always renders in `font-mono` quote blocks (`VerbatimQuote`).
- Voice: probabilistic, calm, no exclamation marks, no SAR assertions, no outcome promises, no legal advice. "Is consistent with", "indicates a probable trigger of".
- Accessibility: WCAG 2.1 AA — expandables are `<button aria-expanded>`, color never alone, `role="status"` on badges.

## Memory protocol
- Append a short status block to `docs/fable_memory.md` after every completed logical block (adjustments, hurdles, validation results).
- Keep `docs/memory_state.json` current: features, data hooks, build changes, next targets.
