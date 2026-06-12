
# Design System Rules (bg-ds v1 — "forensic fintech")

## Aesthetic contract

Bloomberg-terminal-meets-Vanta: dark-first, data-dense, confidence-banded, calm under pressure. No alarmist language, no anti-bank rhetoric, no exclamation marks anywhere in UI copy. Probabilistic verbs only: "is consistent with", "indicates a probable trigger of". Never assert a SAR was filed or promise reinstatement.

## HARD BUILD-FAIL RULE — raw hex ban

- Never write raw hex (`#[0-9a-fA-F]{3,6}`) in any component, page, or workflow file. CI greps and fails the build: `bun run lint:tokens` (scripts/check-no-raw-hex.sh).
- The ONLY hex-permitted file is `app/globals.css` (the `@theme` token block).
- Use semantic token utilities exclusively: `bg-ink-900`, `text-ink-400`, `border-ink-700`, `bg-brand-500`, `text-conf-low`, `bg-risk-critical`, `text-tier-a`, `text-tier-b`, `font-mono`, `text-caption`, `rounded-md`, `shadow-raised`, etc.

## Token semantics (Tailwind v4 @theme in app/globals.css)

- Neutrals: `ink-950` app bg → `ink-50` light bg; `ink-400` secondary text; `ink-200` primary text on dark; `ink-700` borders.
- Brand: `brand-500` primary action, `brand-600` hover, `brand-300` focus rings/links.
- Risk bands map 1:1 to scores and NOTHING else — a red button is forbidden; red means risk-critical only. `risk-critical` 0–39 / blocking, `risk-elevated` 40–69 / friction, `risk-moderate` 70–84, `risk-clear` 85–100.
- Confidence: `conf-high` green, `conf-medium` orange, `conf-low` GRAY (`ink-400` value) — low confidence is honesty, not danger. Never red.
- Citation tiers: `tier-a` blue = regulatory authority; `tier-b` purple = observed community pattern (must always render sample size, never authority phrasing).

## LEGAL RENDERING SAFEGUARD — verbatim quotes

Any text classified as a verbatim quote from a bank's notice MUST render inside a quoted block using the mono font token (`--font-mono` / `font-mono` utility) — see `components/ui/verbatim-quote.tsx`. This visually separates raw fact (what the bank said) from machine inference. Never paraphrase inside these blocks.

## Accessibility baseline (WCAG 2.1 AA)

- Risk/confidence colors are always paired with a text label or icon — never color-alone.
- Every expandable card is a real `<button>` with `aria-expanded` + `aria-controls`.
- Status indicators use `role="status"` with descriptive aria-labels ("Confidence: low").
- Gauges expose `aria-valuenow/min/max`.

## Layout patterns

- Reports: single column, `max-w-3xl`, fixed order — verdict → distribution → evidence → regulatory basis → actions → letters. The verdict never sits below the fold.
- Error states always name the failed pipeline stage and offer a retry — never generic "something went wrong".
