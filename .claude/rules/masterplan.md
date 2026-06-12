# Masterplan Rules — Brand, Voice & Operations Digest

Full source documents: `docs/bankguard-masterplan.md` (design system, voice,
ops optimization) and `docs/product-brief.md` (problem, solution concept,
founder context). This digest is the rule-form extraction.

## Brand position

- "X-ray for opaque bank decisions." Brand essence: clarity under opacity.
- On the founder's side, but NOT anti-bank: banks are constrained actors, not villains.
- Not a law firm, not a complaint mill. Never promises reinstatement.
- Aesthetic: forensic fintech — Bloomberg terminal x Vanta/Stripe Radar. Dark-capable, data-dense, confidence-banded everything. Redaction-bar motifs; no stock photos.

## Voice constants (never change)

- Probabilistic framing with explicit confidence; evidence-first ordering (quote -> inference, never reversed).
- Second person ("your account"), active voice, no exclamation marks in product surfaces.
- Legal trinity: never assert a SAR was filed · never promise outcomes · never give legal advice.

## Lexicon (always / never)

| Always say | Never say |
|---|---|
| "probable trigger", "consistent with" | "the reason was", "the bank filed a SAR" |
| "observed pattern (n=X reports)" | "this always happens when…" |
| "informational diagnostic" | "legal advice", "your case" |
| "strengthen your next application" | "guarantee approval", "get reinstated" |
| "the bank is legally constrained from explaining" | "the bank is hiding the truth" |
| "funds-release request" | "demand letter" (in UI copy) |

## Tone flexes by context

Diagnosis report: high formality, low energy, high technical depth. Risk dashboard: medium/medium/medium. Generated letters: very high formality. Error states: medium formality, low energy, name the failed stage + retry.

## Component contracts that carry legal weight

- ConfidenceBadge: never hide LOW badges; LOW is gray honesty, copy "Limited evidence — generic letter language only."
- CitationCard: tier from DB only; Tier B always renders sample size, never authority phrasing.
- LetterPreview: export/copy disabled unless persisted complianceGatePassed === true; banner renders from the DB field, not client logic.
- DisclaimerFooter: mandatory on every report and letter, non-dismissible.

## Report layout (fixed order, verdict never below the fold)

verdict (top trigger + confidence) -> distribution -> evidence (quotes <-> rationales cross-highlighted) -> regulatory basis -> recommended actions -> letters. Single column, max-w-3xl.

## Operations rules (encode in workers as they land)

1. Parallelize RAG retrieval with classification (seed from phrase categories; re-rank when classifier lands) — target ~35–40% p50 latency cut.
2. Short-circuit gate after extraction: explicit mundane reason + FEE_OPERATIONAL + no funds held => skip Sonnet (>=15% of cases).
3. Stage-3 validation failures use sectioned Haiku repair, never a full Sonnet re-run.
4. Human review is an async checkpoint, not a gate — reports ship marked "automated analysis"; founder review upgrades them (Dhaka<->US timezone spread must never block users).
5. KB freshness: contentSha256 diff gate before any re-embed; bank ToS diffs route to kb_change_log (KB freshness + bank_profiles update + content marketing from one crawl).
6. Track B labeling: two-model agreement gate auto-verifies concordant labels; human review only on disagreements. corpusOptIn cases are ground truth — incentivize with a diagnostic discount.

## Alpha measurement targets

p50 upload->report < 90s · stage failure < 5% · top-1 trigger accuracy >= 80% (n>=10 internal) · 200 verified CommunityCase labels by week 12 · >=15% Sonnet calls avoided by the short-circuit gate.

## Open questions (pre-launch gates)

USPTO/TESS knockout search on the "BankGuard" name before public launch; DisclaimerFooter legal copy reviewed by US counsel; marketing holds the calm-forensic line (no outrage-bait even where it performs).
