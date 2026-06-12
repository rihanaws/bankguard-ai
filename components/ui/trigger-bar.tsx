"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * TriggerBar — horizontal probability bar for one ClosureTrigger, stacked into
 * the distribution view of a diagnosis report.
 *
 * Contract (masterplan §2.2):
 *  - States: default | expanded (reveals rationale + evidence references).
 *  - Expansion control is a real <button> with aria-expanded/aria-controls.
 *  - Bar exposes role="progressbar" with aria-valuenow (WCAG 2.1 AA); the
 *    percentage is always printed as text — color is never the only signal.
 *  - Color derives from the risk-band tokens by inverting probability into the
 *    0–100 score scale (risk colors map 1:1 to score bands and nothing else):
 *      p ≥ 0.61 → risk-critical   (score 0–39)
 *      p 0.31–0.60 → risk-elevated (score 40–69)
 *      p 0.16–0.30 → risk-moderate (score 70–84)
 *      p ≤ 0.15 → risk-clear       (score 85–100)
 *  - Evidence strings are verbatim keyPhrase references → mono quote blocks
 *    (legal rendering safeguard).
 */

export type ClosureTriggerLabel =
  | "AML_SAR"
  | "SANCTIONS_GEO"
  | "KYC_FAILURE"
  | "FRAUD_CHARGEBACK"
  | "FEE_OPERATIONAL"
  | "DERISKING_CATEGORY"
  | "POLICY_UPDATE"
  | "UNKNOWN";

const TRIGGER_DISPLAY: Record<ClosureTriggerLabel, string> = {
  AML_SAR: "AML / suspicious-activity review",
  SANCTIONS_GEO: "Sanctions / geographic exposure",
  KYC_FAILURE: "KYC / verification failure",
  FRAUD_CHARGEBACK: "Fraud / chargeback signals",
  FEE_OPERATIONAL: "Fees / operational housekeeping",
  DERISKING_CATEGORY: "Category-level de-risking",
  POLICY_UPDATE: "Policy update",
  UNKNOWN: "Insufficient evidence",
};

type RiskBand = "critical" | "elevated" | "moderate" | "clear";

function bandFor(probability: number): RiskBand {
  if (probability >= 0.61) return "critical";
  if (probability >= 0.31) return "elevated";
  if (probability >= 0.16) return "moderate";
  return "clear";
}

/** Static class maps — Tailwind v4 must see literal utility names. */
const BAND_FILL: Record<RiskBand, string> = {
  critical: "bg-risk-critical",
  elevated: "bg-risk-elevated",
  moderate: "bg-risk-moderate",
  clear: "bg-risk-clear",
};
const BAND_TEXT: Record<RiskBand, string> = {
  critical: "text-risk-critical",
  elevated: "text-risk-elevated",
  moderate: "text-risk-moderate",
  clear: "text-risk-clear",
};

export interface TriggerBarProps {
  trigger: ClosureTriggerLabel;
  /** Probability mass assigned by Stage 2/3, 0.0–1.0. */
  probability: number;
  /** Forensic rationale (<= 60 words, conditional language). */
  rationale: string;
  /** Verbatim keyPhrase / context-field references backing this trigger. */
  evidence: string[];
  /** Render expanded on mount (e.g. the top trigger in a report). */
  defaultExpanded?: boolean;
  className?: string;
}

export function TriggerBar({
  trigger,
  probability,
  rationale,
  evidence,
  defaultExpanded = false,
  className,
}: TriggerBarProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const regionId = useId();

  const clamped = Math.min(Math.max(probability, 0), 1);
  const pct = Math.round(clamped * 100);
  const band = bandFor(clamped);

  return (
    <div
      className={cn(
        "rounded-md border border-ink-700 bg-ink-900 shadow-raised",
        className,
      )}
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={regionId}
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full flex-col gap-1.5 px-3 py-2.5 text-left transition-colors duration-200 hover:bg-ink-800/60 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-300"
      >
        <span className="flex items-baseline justify-between gap-3">
          <span className="text-body font-medium text-ink-200">
            {TRIGGER_DISPLAY[trigger]}
          </span>
          <span className="flex items-center gap-2">
            <span className={cn("font-mono text-body font-semibold", BAND_TEXT[band])}>
              {pct}%
            </span>
            <span aria-hidden="true" className="text-ink-400">
              {expanded ? "−" : "+"}
            </span>
          </span>
        </span>

        <span
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${TRIGGER_DISPLAY[trigger]} probability ${pct} percent`}
          className="block h-1.5 w-full overflow-hidden rounded-sm bg-ink-800"
        >
          <span
            className={cn(
              "block h-full rounded-sm transition-[width] duration-200 ease-standard",
              BAND_FILL[band],
            )}
            style={{ width: `${pct}%` }}
          />
        </span>
      </button>

      <div
        id={regionId}
        role="region"
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-standard",
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="border-t border-ink-700 px-3 py-2.5">
            <p className="text-caption uppercase tracking-wider text-ink-400">
              Rationale
            </p>
            <p className="mt-1 text-body text-ink-200">{rationale}</p>

            {evidence.length > 0 ? (
              <>
                <p className="mt-3 text-caption uppercase tracking-wider text-ink-400">
                  Evidence — verbatim references
                </p>
                <ul className="mt-1 flex flex-col gap-1.5">
                  {evidence.map((item) => (
                    <li key={item}>
                      <blockquote className="border-l-2 border-ink-700 pl-2.5">
                        <p className="font-mono text-caption text-ink-200">
                          &ldquo;{item}&rdquo;
                        </p>
                      </blockquote>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="mt-3 text-caption text-ink-400">
                No direct phrase evidence — probability driven by context priors.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
