# BankGuard AI — Product Masterplan
**Brand Identity · Design System · Voice Guidelines · Operations Optimization**
Version 1.0 — June 2026 · Companion to `schema.prisma`, `extract.contract.ts`, `classify.contract.ts`

---

# Part 1 — Brand Identity

## 1.1 Brand Position

BankGuard AI is the **X-ray for opaque bank decisions**. The brand must signal two things simultaneously: (1) deep regulatory competence — users arrive in a crisis, often with five figures frozen, and need to trust the analysis immediately; (2) it is on the *founder's* side — the only player in a landscape of bank-facing compliance tools that works for the debanked, not the bank.

**Brand essence:** Clarity under opacity.
**Tagline candidates:** "Know why. Know what's next." / "Decode your bank's silence."
**Anti-positioning:** Not a law firm. Not a complaint mill. Not anti-bank rage-bait. Never promises reinstatement.

## 1.2 Visual Identity

The aesthetic target is **forensic fintech** — closer to a Bloomberg terminal crossed with a modern security product (Vanta, Stripe Radar) than to a friendly neobank. Dark-capable, data-dense, confidence-banded everything.

**Logo direction:** wordmark "BankGuard" with the "G" containing a subtle aperture/lens cutout (the X-ray motif). Monochrome-first; must survive 16px favicon.

**Imagery rules:** no stock photos of handshakes or skylines. Use abstract document-scan motifs, redaction-bar graphics, probability distributions, and corridor maps. Redaction bars are a signature visual element — they literally represent what the product decodes.

---

# Part 2 — Design System (`bg-ds` v1)

## 2.1 Design Tokens — Tailwind v4 `@theme`

```css
@theme {
  /* ── Color: neutrals (slate-ink scale, dark-first) ── */
  --color-ink-950: #0b0f14;   /* app background (dark) */
  --color-ink-900: #111722;   /* surface */
  --color-ink-800: #1a2332;   /* raised surface / cards */
  --color-ink-700: #283349;   /* borders, dividers */
  --color-ink-400: #6b7a94;   /* secondary text */
  --color-ink-200: #c3cad6;   /* primary text on dark */
  --color-ink-50:  #f4f6f9;   /* light-mode background */

  /* ── Color: brand ── */
  --color-brand-500: #3d7eff; /* primary action — "clarity blue" */
  --color-brand-600: #2c63d6; /* hover */
  --color-brand-300: #8ab0ff; /* focus rings, links on dark */

  /* ── Color: semantic — risk & confidence (the core system) ── */
  --color-risk-critical: #e5484d;  /* score 0–39, blocking factors */
  --color-risk-elevated: #f0883e;  /* score 40–69, friction factors */
  --color-risk-moderate: #f5d90a;  /* score 70–84 */
  --color-risk-clear:    #46a758;  /* score 85–100 */
  --color-conf-high:   #46a758;    /* confidenceBand HIGH */
  --color-conf-medium: #f0883e;    /* MEDIUM */
  --color-conf-low:    #6b7a94;    /* LOW — deliberately gray, not red:
                                      low confidence is honesty, not danger */

  /* ── Color: citation tiers (mirrors ReliabilityTier in schema) ── */
  --color-tier-a: #3d7eff;  /* regulatory authority citations */
  --color-tier-b: #9a6ff0;  /* empirical/community pattern citations */

  /* ── Typography ── */
  --font-display: "Geist", system-ui, sans-serif;       /* headings, scores */
  --font-body: "Geist", system-ui, sans-serif;
  --font-mono: "Geist Mono", ui-monospace, monospace;   /* verbatim phrases,
                                                           clause refs, IDs */
  --text-score: 3.5rem;     /* Bankability gauge number */
  --text-h1: 1.75rem;
  --text-h2: 1.25rem;
  --text-body: 0.9375rem;   /* 15px — data-dense default */
  --text-caption: 0.8125rem;
  --leading-body: 1.55;

  /* ── Spacing (4px base) ── */
  --spacing: 0.25rem;       /* Tailwind v4 multiplier base */

  /* ── Radius / elevation / motion ── */
  --radius-sm: 6px;  --radius-md: 10px;  --radius-lg: 14px;
  --shadow-raised: 0 1px 3px rgb(0 0 0 / 0.4);
  --shadow-overlay: 0 8px 30px rgb(0 0 0 / 0.5);
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
  --duration-fast: 120ms;  --duration-base: 200ms;
}
```

**Token rules:**
- No hex values in components, ever. CI greps for `#[0-9a-fA-F]{3,6}` in `src/components` and fails the build.
- Risk colors map 1:1 to score bands and never to anything else. A red button is forbidden — red means risk-critical, and only that.
- All verbatim bank-letter language renders in `--font-mono` inside a quoted block. This is a hard rule: it visually separates *what the bank said* from *what we infer*, which is also a legal-positioning safeguard.

## 2.2 Core Components

Priority build order for the alpha (each maps to a pipeline output):

| Component | Purpose | Key states |
|---|---|---|
| `ConfidenceBadge` | Renders `confidenceBand` everywhere a claim appears | high / medium / low |
| `TriggerBar` | Horizontal probability bar per `ClosureTrigger`, stacked into distribution view | default, expanded (shows rationale + evidence) |
| `CitationCard` | RAG citation — Tier A (blue, "Authority") vs Tier B (purple, "Observed pattern, n=X") | collapsed, expanded, source-link |
| `VerbatimQuote` | Mono-font block for `keyPhrases` with category chip | default, highlighted (when referenced by a rationale) |
| `BankabilityGauge` | 0–100 score with band color + factor breakdown table | loading, scored, stale (inputs changed) |
| `BankMatchRow` | Per-bank compatibility: score, blocking factors (red chips), friction factors (orange chips) | default, blocked, recommended |
| `CaseTimeline` | INTAKE→EXTRACTING→…→REVIEW pipeline status | per-stage: pending, running (pulse), done, failed |
| `LetterPreview` | Generated letter with compliance-gate banner | gate-passed, gate-failed (cannot copy/export) |
| `DisclaimerFooter` | Mandatory on every report and letter | — (non-dismissible) |

**Component contracts (the three that carry legal weight):**

`ConfidenceBadge` — props: `band: "LOW"|"MEDIUM"|"HIGH"`. LOW renders gray with copy "Limited evidence — generic letter language only." Never hide LOW badges to make reports look more certain. A11y: `role="status"`, announced as "Confidence: low".

`CitationCard` — props: `tier: "TIER_A"|"TIER_B"`, `sectionRef`, `sourceUrl`, `n?: number`. Tier B MUST render the sample-size line ("Observed in 14 community-reported cases") and MUST NOT use authority phrasing. The tier comes from the DB, never from the LLM output.

`LetterPreview` — export/copy actions are disabled unless `complianceGatePassed === true`. The gate banner is rendered from the DB field, not client logic.

**Accessibility baseline (all components):** WCAG 2.1 AA. Risk/confidence colors always paired with a text label or icon — never color-alone (4.5:1 contrast verified for all token pairs on `ink-900`). Keyboard: every expandable card is a `button` with `aria-expanded`; gauge exposes `aria-valuenow/min/max`.

## 2.3 Patterns

- **Report layout:** single column, max-w-3xl. Order is fixed: verdict (top trigger + confidence) → distribution → evidence (verbatim quotes ↔ rationales cross-highlighted) → regulatory basis (citations) → recommended actions → letters. Users in crisis read top-down; the verdict never sits below the fold.
- **Empty/error states:** every pipeline stage failure surfaces the stage name and a retry action — never a generic "something went wrong" (these users have already had enough unexplained failures from their bank; the product must never mirror that experience).
- **Forms:** risk-assessment intake uses progressive disclosure (entity → geography → activity → corridors), one section per screen on mobile, with inline "why we ask" explainers — mirrors EDD requests so the act of filling the form educates the user.

---

# Part 3 — Brand Voice Guidelines

*Synthesized from: GTM & Monetization Strategy, Regulatory & Legal Framework report, Diagnostic Analysis doc, and the compliance constraints encoded in the prompt contracts. Confidence noted per section.*

## 3.1 We Are / We Are Not  *(confidence: HIGH — consistent across all four source docs)*

| We Are | We Are Not |
|---|---|
| Forensic — we show evidence, probabilities, citations | Speculative — we never assert what we can't support |
| Calm under crisis — measured, structured, next-step oriented | Alarmist or outraged — no anti-bank rhetoric, ever |
| Candid about limits — "probable," "observed pattern," "no general right to an account" | Falsely reassuring — never "we'll get your account back" |
| Fluent in the system — BSA, SAR secrecy, 314(b), sponsor charters | Jargon-gated — every term of art explained on first use |
| On the founder's side | Against banks — banks are constrained actors, not villains |

## 3.2 Voice Constants vs. Tone Flexes

**Constants (never change):** probabilistic framing with explicit confidence; evidence-first ordering (quote → inference, never the reverse); second person ("your account," "your profile"); active voice; no exclamation marks in product surfaces; the legal trinity — never assert a SAR was filed, never promise outcomes, never give legal advice.

**Tone flexes by context:**

| Context | Formality | Energy | Technical depth | Example |
|---|---|---|---|---|
| Diagnosis report | High | Low | High | "Three phrases in this letter are consistent with a KYC-driven exit (confidence: high)." |
| Risk dashboard | Medium | Medium | Medium | "Your BD residency + 7372 MCC combination triggers EDD at 4 of 6 tracked banks." |
| Marketing / landing pages | Medium | Medium-high | Low | "Your bank won't tell you why. The letter already did — you just need it decoded." |
| Generated appeal letters | Very high | Low | Medium | "We write to request clarification of the documentation requirements referenced in your notice dated…" |
| Community (Reddit/forums) | Low | Medium | High | "30-day notice + funds released on schedule usually points away from an active hold — here's the pattern breakdown." |
| Error/empty states | Medium | Low | Low | "Extraction failed on page 2. Retry, or upload a clearer scan." |

## 3.3 Lexicon  *(confidence: HIGH — derived directly from compliance constraints)*

| Always say | Never say | Why |
|---|---|---|
| "probable trigger," "consistent with" | "the reason was," "the bank filed a SAR" | SAR-assertion exposure; accuracy |
| "observed pattern (n=X reports)" | "this always happens when…" | Track B is anecdotal by design |
| "informational diagnostic" | "legal advice," "your case" | UPL positioning |
| "strengthen your next application" | "guarantee approval," "get reinstated" | FTC marketing-claims exposure |
| "the bank is legally constrained from explaining" | "the bank is hiding the truth" | Calm > outrage; legally accurate |
| "funds-release request" | "demand letter" (in UI copy) | De-escalation; the letter itself can be firm |

## 3.4 Open Questions  *(for you to confirm or override)*

1. **Name collision risk** — "BankGuard" has generic-security connotations and possible trademark proximity to existing security products. *Recommendation:* run a USPTO/TESS knockout search before public launch; alpha can proceed under the working name.
2. **Outrage dial in marketing** — debanking content that performs on Reddit/TikTok is angrier than this voice. *Recommendation:* hold the calm-forensic line even in short-form; differentiation > engagement-bait, and it compounds trust with the advisor tier (lawyers won't white-label outrage).

---

# Part 4 — Operations & Process Optimization

Applying the waste analysis to the three operational loops that exist once the alpha runs. Current state = the 6-week plan as designed; future state = same plan with the bottlenecks removed before they're built in.

## 4.1 Loop 1 — Case Processing Pipeline

**Current designed state:** Upload → EXTRACT (Haiku) → CLASSIFY (Haiku) → DIAGNOSE (Sonnet + RAG) → human review → report. Sequential jobs through `PipelineJob`.

**Waste identified:**
- *Waiting:* DIAGNOSE blocks on CLASSIFY, but RAG retrieval only needs extraction output (entities, phrases) — the classification just reweights which chunks matter.
- *Rework:* a failed Zod validation at stage 3 currently re-runs the whole Sonnet call.
- *Over-processing:* running full diagnosis on documents where `documentKind = OTHER` or `reasonGiven = true` with an explicit mundane reason (negative balance).

**Future state:**
1. **Parallelize retrieval with classification** — fire RAG retrieval immediately after extraction using phrase categories as the query seed; re-rank with classifier output when it lands. Cuts p50 case latency ~35–40% (retrieval and classify are the two mid-length stages).
2. **Short-circuit gate after extraction** — if `reasonGiven = true` and the stated reason maps to `FEE_OPERATIONAL` with no funds held, emit a lightweight report (no Sonnet call). Saves the expensive stage on the ~15–20% of mundane cases and keeps the expensive path for the cases that justify the price.
3. **Sectioned repair** — stage-3 validation failures repair only the failing JSON section via a Haiku repair call instead of re-running Sonnet. (Repair-loop pattern already exists in the contracts; extend it to stage 3.)
4. **Checkpoint, not gate:** human review is async — report ships to the user marked "automated analysis," and your review (alpha) upgrades it. Never make the user wait on you across the Dhaka↔US timezone spread.

## 4.2 Loop 2 — Knowledge Base Freshness

**Current designed state:** scheduled crawls (daily sanctions, monthly enforcement/ToS).

**Waste identified:** *Manual work* — bank ToS change detection by re-reading; *rework* — re-embedding unchanged documents.

**Future state:** `contentSha256` diff gate before any re-embed (already in schema — enforce it in the worker). For the 6 tracked banks' ToS/help-center pages, a weekly crawl that diffs and, on change, opens a review task with the unified diff — ToS changes are themselves product content ("Mercury updated its restricted-country language on June 3"), so route diffs into a `kb_change_log` that feeds the newsletter pipeline. One crawl, three outputs (KB freshness, bank_profiles update prompt, content marketing) — that's the highest-leverage automation in the system.

## 4.3 Loop 3 — Track B Corpus Growth

**Current designed state:** scraper v1 in week 6, Claude-extracted structured cases, you verify labels.

**Waste identified:** *Bottleneck* — you are the only labeler; at ~200 verified labels needed for the classifier swap, hand-verifying every extraction is weeks of evening work.

**Future state:**
1. Two-model agreement gate: extract each community case with Haiku twice (different prompt seeds); auto-verify labels where both runs + the phrase-prior matrix agree. Human review only on disagreements (~25–35% of cases, empirically). Cuts your labeling load ~3x.
2. Product-as-collector: the `corpusOptIn` flag on real user cases is the long-term moat — every paying diagnostic that opts in is a *ground-truth-quality* labeled case (you know the letter AND often the outcome). Incentivize with a discount (e.g., $20 off the diagnostic for corpus opt-in). Track B scraping bootstraps; opt-in data compounds.

## 4.4 Measurement

| Metric | Target (alpha) | Instrumentation |
|---|---|---|
| Case p50 latency (upload → report) | < 90s | `PipelineJob` timestamps |
| Stage failure rate | < 5% per stage | `JobStatus.FAILED` / total |
| Top-1 trigger accuracy vs. your post-hoc analysis | ≥ 80% on internal cases | manual eval table, n≥10 |
| Verified labels in `CommunityCase` | 200 by week 12 | row count where `labelVerified` |
| Sonnet calls avoided by short-circuit gate | ≥ 15% of cases | gate counter |

---

# Implementation Order (folds into the existing 6-week plan)

- **Week 1–2 (unchanged):** schema + extraction. Add: token file (`globals.css` `@theme` block from §2.1) lands with the repo scaffold — zero extra cost now, expensive to retrofit.
- **Week 3–4:** build `ConfidenceBadge`, `VerbatimQuote`, `CitationCard`, `TriggerBar` alongside the diagnosis pipeline (report UI and pipeline ship together). Apply voice lexicon (§3.3) to the diagnosis prompt's output-style instructions.
- **Week 5:** `BankabilityGauge` + `BankMatchRow` with the proactive engine. Short-circuit gate (§4.1.2) — it's ~30 lines.
- **Week 6:** parallel retrieval (§4.1.1), two-model agreement gate in the scraper (§4.3.1), `kb_change_log` diff routing (§4.2).
- **Pre-launch (Phase 2 gate):** USPTO knockout search on the name; DisclaimerFooter legal copy reviewed by US counsel.
