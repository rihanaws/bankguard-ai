import { cn } from "@/lib/utils";
import type { ScoreFactor } from "@/lib/scoring/bankability";

/**
 * BankabilityGauge — 0–100 aggregate score with band color and factor table.
 *
 * Contract (masterplan §2.2):
 *  - States: loading | scored | stale (inputs changed since scoring).
 *  - Risk colors map 1:1 to score bands: 0–39 critical, 40–69 elevated,
 *    70–84 moderate, 85–100 clear — and to nothing else.
 *  - Gauge exposes aria-valuenow/min/max; the band is always named in text.
 *  - The score is deterministic engine output; this component never computes.
 */

type GaugeStatus = "loading" | "scored" | "stale";
type ScoreBand = "critical" | "elevated" | "moderate" | "clear";

function bandForScore(score: number): ScoreBand {
  if (score <= 39) return "critical";
  if (score <= 69) return "elevated";
  if (score <= 84) return "moderate";
  return "clear";
}

const BAND_TEXT: Record<ScoreBand, string> = {
  critical: "text-risk-critical",
  elevated: "text-risk-elevated",
  moderate: "text-risk-moderate",
  clear: "text-risk-clear",
};
const BAND_FILL: Record<ScoreBand, string> = {
  critical: "bg-risk-critical",
  elevated: "bg-risk-elevated",
  moderate: "bg-risk-moderate",
  clear: "bg-risk-clear",
};
const BAND_LABEL: Record<ScoreBand, string> = {
  critical: "Critical — blocking factors present",
  elevated: "Elevated — friction expected",
  moderate: "Moderate",
  clear: "Clear",
};

export interface BankabilityGaugeProps {
  score: number; // 0–100 from bankability.v1
  status?: GaugeStatus;
  scoreVersion?: string;
  factorBreakdown?: ScoreFactor[];
  className?: string;
}

export function BankabilityGauge({
  score,
  status = "scored",
  scoreVersion,
  factorBreakdown,
  className,
}: BankabilityGaugeProps) {
  const clamped = Math.min(Math.max(Math.round(score), 0), 100);
  const band = bandForScore(clamped);

  if (status === "loading") {
    return (
      <div
        role="status"
        aria-label="Bankability score loading"
        className={cn(
          "animate-pulse rounded-lg border border-ink-700 bg-ink-900 p-5",
          className,
        )}
      >
        <div className="h-12 w-24 rounded-sm bg-ink-800" />
        <div className="mt-3 h-1.5 w-full rounded-sm bg-ink-800" />
        <p className="mt-3 text-caption text-ink-400">Scoring in progress.</p>
      </div>
    );
  }

  return (
    <div className={cn("rounded-lg border border-ink-700 bg-ink-900 p-5", className)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-caption uppercase tracking-wider text-ink-400">
            Bankability score
          </p>
          <p
            role="progressbar"
            aria-valuenow={clamped}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Bankability score ${clamped} of 100 — ${BAND_LABEL[band]}`}
            className={cn("font-display text-score font-semibold leading-none", BAND_TEXT[band])}
          >
            {clamped}
          </p>
          <p className={cn("mt-1 text-caption font-medium", BAND_TEXT[band])}>
            {BAND_LABEL[band]}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          {status === "stale" ? (
            <span
              role="status"
              className="rounded-sm border border-conf-medium/40 bg-ink-800 px-2 py-0.5 text-caption text-conf-medium"
            >
              Inputs changed — score is stale, re-run the assessment
            </span>
          ) : null}
          {scoreVersion ? (
            <span className="font-mono text-caption text-ink-400">{scoreVersion}</span>
          ) : null}
        </div>
      </div>

      <div aria-hidden="true" className="mt-4 h-1.5 w-full overflow-hidden rounded-sm bg-ink-800">
        <div
          className={cn("h-full rounded-sm transition-[width] duration-200 ease-standard", BAND_FILL[band])}
          style={{ width: `${clamped}%` }}
        />
      </div>

      {factorBreakdown && factorBreakdown.length > 0 ? (
        <table className="mt-4 w-full border-collapse text-left">
          <caption className="sr-only">Factor breakdown for the bankability score</caption>
          <thead>
            <tr className="border-b border-ink-700">
              <th scope="col" className="py-1.5 pr-3 text-caption font-medium uppercase tracking-wider text-ink-400">Factor</th>
              <th scope="col" className="py-1.5 pr-3 text-right text-caption font-medium uppercase tracking-wider text-ink-400">Points</th>
              <th scope="col" className="py-1.5 text-caption font-medium uppercase tracking-wider text-ink-400">Rationale</th>
            </tr>
          </thead>
          <tbody>
            {factorBreakdown.map((f) => (
              <tr key={f.factor} className="border-b border-ink-700/50 align-top">
                <td className="py-1.5 pr-3 font-mono text-caption text-ink-200">{f.factor}</td>
                <td className="py-1.5 pr-3 text-right font-mono text-caption text-ink-200">
                  {f.points}/{f.weight}
                </td>
                <td className="py-1.5 text-caption text-ink-400">{f.rationale}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
