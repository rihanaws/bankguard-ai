import { cn } from "@/lib/utils";

/**
 * ConfidenceBadge — renders a Diagnosis/Classification confidenceBand wherever
 * a probabilistic claim appears.
 *
 * Contract (masterplan §2.2):
 *  - LOW renders gray (conf-low) with the honesty copy — low confidence is
 *    honesty, not danger. Never hide LOW badges to make reports look certain.
 *  - Color is always paired with a text label (WCAG: never color-alone).
 *  - role="status"; screen readers announce "Confidence: low|medium|high".
 */

export type ConfidenceBand = "LOW" | "MEDIUM" | "HIGH";

const BAND_CONFIG: Record<
  ConfidenceBand,
  { label: string; detail: string; dotClass: string; textClass: string; borderClass: string }
> = {
  HIGH: {
    label: "Confidence: high",
    detail: "Explicit categorical language present.",
    dotClass: "bg-conf-high",
    textClass: "text-conf-high",
    borderClass: "border-conf-high/40",
  },
  MEDIUM: {
    label: "Confidence: medium",
    detail: "Partial signal — corroborating context applied.",
    dotClass: "bg-conf-medium",
    textClass: "text-conf-medium",
    borderClass: "border-conf-medium/40",
  },
  LOW: {
    label: "Confidence: low",
    detail: "Limited evidence — generic letter language only.",
    dotClass: "bg-conf-low",
    textClass: "text-conf-low",
    borderClass: "border-conf-low/40",
  },
};

export interface ConfidenceBadgeProps {
  band: ConfidenceBand;
  /** Show the explanatory detail line under the label (default: LOW only). */
  showDetail?: boolean;
  className?: string;
}

export function ConfidenceBadge({
  band,
  showDetail,
  className,
}: ConfidenceBadgeProps) {
  const config = BAND_CONFIG[band];
  const renderDetail = showDetail ?? band === "LOW";

  return (
    <span
      role="status"
      aria-label={config.label}
      className={cn(
        "inline-flex flex-col gap-0.5 rounded-sm border bg-ink-800 px-2.5 py-1",
        config.borderClass,
        className,
      )}
    >
      <span className="inline-flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className={cn("size-1.5 shrink-0 rounded-full", config.dotClass)}
        />
        <span
          className={cn(
            "font-mono text-caption font-medium tracking-wide",
            config.textClass,
          )}
        >
          {config.label}
        </span>
      </span>
      {renderDetail ? (
        <span className="text-caption text-ink-400">{config.detail}</span>
      ) : null}
    </span>
  );
}
