import { cn } from "@/lib/utils";
import type { BankCompatibility } from "@/lib/scoring/bankability";

/**
 * BankMatchRow — per-bank compatibility row for the proactive engine.
 *
 * Contract (masterplan §2.2):
 *  - States: default | blocked (any blocking factor) | recommended (rank 1,
 *    no blocking factors).
 *  - Blocking factors render as risk-critical chips, friction factors as
 *    risk-elevated chips — colors always paired with chip text (never alone).
 */

const FACTOR_DISPLAY: Record<string, string> = {
  nra_ineligible: "Non-residents ineligible",
  us_address_required: "US address required",
  us_operations_required: "US operations required",
};

function displayFactor(factor: string): string {
  const named = FACTOR_DISPLAY[factor];
  if (named) return named;
  const [kind, value] = factor.split(":");
  switch (kind) {
    case "restricted_geo":
      return `Restricted geography: ${value}`;
    case "mcc_blocklist":
      return `MCC blocked: ${value}`;
    case "mcc_greylist":
      return `MCC greylisted: ${value}`;
    case "restricted_corridor":
      return `Restricted corridor: ${value}`;
    default:
      return factor;
  }
}

const KIND_DISPLAY: Record<BankCompatibility["kind"], string> = {
  CHARTERED_BANK: "Chartered bank",
  NEOBANK_BAAS: "Neobank (sponsor charter)",
  EMI_MSB: "EMI / MSB",
  PSP: "Payment service provider",
};

export interface BankMatchRowProps {
  match: BankCompatibility;
  className?: string;
}

export function BankMatchRow({ match, className }: BankMatchRowProps) {
  const blocked = match.blockingFactors.length > 0;
  const recommended = !blocked && match.rank === 1;

  return (
    <div
      className={cn(
        "rounded-md border bg-ink-900 px-4 py-3 shadow-raised",
        blocked ? "border-risk-critical/40" : "border-ink-700",
        recommended && "border-brand-500/60",
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-caption text-ink-400">#{match.rank}</span>
          <span className="text-body font-medium text-ink-200">{match.bankName}</span>
          <span className="text-caption text-ink-400">{KIND_DISPLAY[match.kind]}</span>
          {recommended ? (
            <span className="rounded-sm bg-brand-500/15 px-1.5 py-0.5 text-caption font-medium text-brand-300">
              Strongest fit
            </span>
          ) : null}
          {blocked ? (
            <span className="rounded-sm bg-risk-critical/15 px-1.5 py-0.5 text-caption font-medium text-risk-critical">
              Blocked
            </span>
          ) : null}
        </div>
        <span
          className={cn(
            "font-mono text-body font-semibold",
            blocked ? "text-risk-critical" : "text-ink-200",
          )}
          aria-label={`Compatibility score ${match.compatibilityScore} of 100`}
        >
          {match.compatibilityScore}
        </span>
      </div>

      {(match.blockingFactors.length > 0 || match.frictionFactors.length > 0) && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {match.blockingFactors.map((f) => (
            <li
              key={f}
              className="rounded-sm bg-risk-critical/15 px-1.5 py-0.5 text-caption text-risk-critical"
            >
              {displayFactor(f)}
            </li>
          ))}
          {match.frictionFactors.map((f) => (
            <li
              key={f}
              className="rounded-sm bg-risk-elevated/15 px-1.5 py-0.5 text-caption text-risk-elevated"
            >
              {displayFactor(f)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
