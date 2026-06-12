"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * LetterPreview — generated letter with the compliance-gate banner.
 *
 * Contract (masterplan §2.2 — legal weight):
 *  - Export/copy actions are DISABLED unless complianceGatePassed === true.
 *  - The gate value comes from the persisted DB field (GeneratedLetter
 *    .complianceGatePassed), never from client logic — this component only
 *    renders what it is given.
 *  - States: gate-passed | gate-failed (cannot copy/export).
 */

export interface LetterPreviewProps {
  /** Markdown body from GeneratedLetter.body. */
  body: string;
  /** Persisted DB gate value — server truth. */
  complianceGatePassed: boolean;
  /** Persisted gate notes shown when the gate failed. */
  complianceGateNotes?: string | null;
  kindLabel?: string;
  className?: string;
}

export function LetterPreview({
  body,
  complianceGatePassed,
  complianceGateNotes,
  kindLabel = "Bank appeal letter",
  className,
}: LetterPreviewProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!complianceGatePassed) return;
    await navigator.clipboard.writeText(body);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border bg-ink-900 shadow-raised",
        complianceGatePassed ? "border-ink-700" : "border-risk-critical/40",
        className,
      )}
    >
      <div
        role="status"
        className={cn(
          "flex items-center justify-between gap-3 border-b px-4 py-2.5",
          complianceGatePassed
            ? "border-ink-700 bg-ink-800"
            : "border-risk-critical/40 bg-risk-critical/10",
        )}
      >
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={cn(
              "size-1.5 rounded-full",
              complianceGatePassed ? "bg-conf-high" : "bg-risk-critical",
            )}
          />
          <span
            className={cn(
              "text-caption font-medium",
              complianceGatePassed ? "text-conf-high" : "text-risk-critical",
            )}
          >
            {complianceGatePassed
              ? "Compliance gate passed — ready for export"
              : "Compliance gate failed — export disabled pending regeneration"}
          </span>
        </div>
        <button
          type="button"
          onClick={copy}
          disabled={!complianceGatePassed}
          aria-disabled={!complianceGatePassed}
          className={cn(
            "rounded-sm px-2.5 py-1 text-caption font-medium transition-colors duration-200",
            complianceGatePassed
              ? "bg-brand-500 text-ink-50 hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-brand-300"
              : "cursor-not-allowed bg-ink-700 text-ink-400",
          )}
        >
          {copied ? "Copied" : "Copy letter"}
        </button>
      </div>

      {!complianceGatePassed && complianceGateNotes ? (
        <div className="border-b border-risk-critical/40 px-4 py-2">
          <p className="text-caption uppercase tracking-wider text-ink-400">Gate notes</p>
          <pre className="mt-1 whitespace-pre-wrap font-mono text-caption text-ink-200">
            {complianceGateNotes}
          </pre>
        </div>
      ) : null}

      <div className="px-5 py-4">
        <p className="text-caption uppercase tracking-wider text-ink-400">{kindLabel}</p>
        <pre className="mt-2 whitespace-pre-wrap font-body text-body leading-relaxed text-ink-200">
          {body}
        </pre>
      </div>

      <div className="border-t border-ink-700 px-4 py-2">
        <p className="text-caption text-ink-400">
          Prepared as an informational aid. Placeholder fields are substituted
          with case data at export time.
        </p>
      </div>
    </div>
  );
}
