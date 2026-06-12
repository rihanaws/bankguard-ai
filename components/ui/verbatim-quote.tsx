import { cn } from "@/lib/utils";

/**
 * VerbatimQuote — the legal rendering safeguard.
 *
 * Any verbatim language extracted from a bank's notice renders in the mono
 * font token inside a quoted block. This visually separates WHAT THE BANK SAID
 * (raw fact) from what the pipeline infers (machine inference) — a hard rule
 * from the masterplan and a legal-positioning requirement.
 *
 * States: default | highlighted (when a rationale references this phrase).
 */

/** Mirrors PhraseCategory in workflows/contracts/extract.contract.ts. */
export type PhraseCategoryLabel =
  | "RISK_GENERIC"
  | "TOS_CONTRACTUAL"
  | "SUSPICIOUS_ACTIVITY"
  | "SOURCE_OF_FUNDS"
  | "GEO_RESTRICTION"
  | "SANCTIONS"
  | "KYC_DOCUMENTATION"
  | "FRAUD_CHARGEBACK"
  | "FUNDS_DISPOSITION"
  | "FINALITY"
  | "POLICY_UPDATE"
  | "OTHER";

const CATEGORY_DISPLAY: Record<PhraseCategoryLabel, string> = {
  RISK_GENERIC: "Generic risk language",
  TOS_CONTRACTUAL: "Terms / contractual",
  SUSPICIOUS_ACTIVITY: "Suspicious activity",
  SOURCE_OF_FUNDS: "Source of funds",
  GEO_RESTRICTION: "Geographic restriction",
  SANCTIONS: "Sanctions",
  KYC_DOCUMENTATION: "KYC / documentation",
  FRAUD_CHARGEBACK: "Fraud / chargeback",
  FUNDS_DISPOSITION: "Funds disposition",
  FINALITY: "Finality",
  POLICY_UPDATE: "Policy update",
  OTHER: "Other",
};

export interface VerbatimQuoteProps {
  /** Exact phrase as extracted — never paraphrased. */
  phrase: string;
  category: PhraseCategoryLabel;
  /** Where in the document the phrase appears, e.g. "para 2". */
  location?: string | null;
  /** True when a rationale currently references this phrase. */
  highlighted?: boolean;
  className?: string;
}

export function VerbatimQuote({
  phrase,
  category,
  location,
  highlighted = false,
  className,
}: VerbatimQuoteProps) {
  return (
    <figure
      className={cn(
        "rounded-md border border-ink-700 bg-ink-900 p-3 transition-shadow duration-200",
        highlighted && "border-brand-300 ring-1 ring-brand-300",
        className,
      )}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="rounded-sm bg-ink-700 px-1.5 py-0.5 text-caption font-medium text-ink-200">
          {CATEGORY_DISPLAY[category]}
        </span>
        {location ? (
          <span className="text-caption text-ink-400">{location}</span>
        ) : null}
        <span className="ml-auto text-caption uppercase tracking-wider text-ink-400">
          Verbatim — bank&apos;s language
        </span>
      </div>
      <blockquote className="border-l-2 border-ink-700 pl-3">
        <p className="font-mono text-body text-ink-200">
          &ldquo;{phrase}&rdquo;
        </p>
      </blockquote>
    </figure>
  );
}
