"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * CitationCard — RAG citation visualizer.
 *
 * Contract (masterplan §2.2):
 *  - tier comes from the DB (KbDocument.reliabilityTier), never from LLM output.
 *  - TIER_A renders as "Authority" (blue accent).
 *  - TIER_B MUST render the sample-size line ("Observed in N community-reported
 *    cases") and MUST NOT use authority phrasing. Purple accent.
 *  - Expandable card is a real <button> with aria-expanded (WCAG 2.1 AA).
 */

export type CitationTier = "TIER_A" | "TIER_B";

export interface CitationCardProps {
  tier: CitationTier;
  /** e.g. "31 CFR 1020.320(e)" or "ToS §11.2" */
  sectionRef: string;
  title: string;
  /** Cited excerpt shown when expanded. */
  excerpt?: string;
  sourceUrl?: string;
  /** TIER_B sample size — number of community-reported cases observed. */
  n?: number;
  className?: string;
}

export function CitationCard({
  tier,
  sectionRef,
  title,
  excerpt,
  sourceUrl,
  n,
  className,
}: CitationCardProps) {
  const [expanded, setExpanded] = useState(false);
  const regionId = useId();
  const isAuthority = tier === "TIER_A";

  return (
    <div
      className={cn(
        "overflow-hidden rounded-md border bg-ink-800 shadow-raised",
        isAuthority ? "border-tier-a/40" : "border-tier-b/40",
        className,
      )}
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={regionId}
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors duration-200 hover:bg-ink-700/40 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-300"
      >
        <span
          className={cn(
            "mt-0.5 shrink-0 rounded-sm px-1.5 py-0.5 font-mono text-caption font-semibold uppercase tracking-wider",
            isAuthority ? "bg-tier-a/15 text-tier-a" : "bg-tier-b/15 text-tier-b",
          )}
        >
          {isAuthority ? "Tier A — Authority" : "Tier B — Observed pattern"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-caption text-ink-400">
            {sectionRef}
          </span>
          <span className="block text-body text-ink-200">{title}</span>
          {!isAuthority ? (
            <span className="mt-0.5 block text-caption text-ink-400">
              {typeof n === "number"
                ? `Observed in ${n} community-reported ${n === 1 ? "case" : "cases"}. Anecdotal pattern — not regulatory authority.`
                : "Community-reported pattern — sample size unavailable. Anecdotal, not regulatory authority."}
            </span>
          ) : null}
        </span>
        <span aria-hidden="true" className="mt-1 shrink-0 text-ink-400">
          {expanded ? "−" : "+"}
        </span>
      </button>

      <div
        id={regionId}
        role="region"
        hidden={!expanded}
        className="border-t border-ink-700 px-3 py-2.5"
      >
        {excerpt ? (
          <blockquote className="border-l-2 border-ink-700 pl-3">
            <p className="font-mono text-caption text-ink-200">{excerpt}</p>
          </blockquote>
        ) : (
          <p className="text-caption text-ink-400">
            No excerpt stored for this citation.
          </p>
        )}
        {sourceUrl ? (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-caption text-brand-300 underline underline-offset-2 hover:text-brand-500"
          >
            View source
          </a>
        ) : null}
      </div>
    </div>
  );
}
