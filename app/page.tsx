import { BankMatchRow } from "@/components/ui/bank-match-row";
import { BankabilityGauge } from "@/components/ui/bankability-gauge";
import { CaseTimeline } from "@/components/ui/case-timeline";
import { CitationCard } from "@/components/ui/citation-card";
import { ConfidenceBadge } from "@/components/ui/confidence-badge";
import { DisclaimerFooter } from "@/components/ui/disclaimer-footer";
import { LetterPreview } from "@/components/ui/letter-preview";
import { TriggerBar } from "@/components/ui/trigger-bar";
import { VerbatimQuote } from "@/components/ui/verbatim-quote";
import { computeBankCompatibility, computeBankability } from "@/lib/scoring/bankability";
import { BANK_APPETITE_SEED } from "@/lib/scoring/bank-profiles.seed";
import type { RiskAssessmentInputT } from "@/lib/api-schemas";

// Representative founder profile — deterministic engine output, rendered
// server-side (the LLM never computes scores).
const DEMO_ASSESSMENT_INPUT: RiskAssessmentInputT = {
  entityType: "C_CORP",
  entityState: "DE",
  ownerResidencyIso: "BD",
  mcc: "7372",
  corridors: ["US", "GB", "BD"],
  monthlyVolumeCents: 4_500_000_00,
  addressKind: "REGISTERED_AGENT",
};

const DEMO_LETTER = [
  "{{LETTER_DATE}}",
  "",
  "{{BANK_NAME}} — Risk Operations",
  "",
  "Re: Account {{ACCOUNT_REF_MASKED}} — Request for review and documentation clarification",
  "",
  "To the Compliance Review Team,",
  "",
  "We write on behalf of {{ENTITY_NAME}}, a {{ENTITY_TYPE}}, regarding the closure notice dated {{CLOSURE_NOTICE_DATE}}. Your notice indicates that requested information could not be verified during review. We respectfully request a written enumeration of the outstanding documentation items so that {{ENTITY_NAME}} may remedy any deficiency before {{RESPONSE_DEADLINE}}.",
  "",
  "We further request written confirmation of the funds-release timeline for the remaining balance.",
  "",
  "Respectfully,",
  "{{SIGNATORY_NAME}}, {{SIGNATORY_TITLE}}",
  "",
  "---",
  "This letter was prepared with software assistance as an informational aid and does not constitute legal advice.",
].join("\n");

/**
 * Alpha component proofing page — renders the three legal-weight primitives
 * with representative data. Replaced by the case dashboard in week 3–4.
 */
export default function Home() {
  const bankability = computeBankability(DEMO_ASSESSMENT_INPUT);
  const bankMatches = computeBankCompatibility(
    DEMO_ASSESSMENT_INPUT,
    bankability,
    BANK_APPETITE_SEED,
  );

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-10 px-6 py-12">
      <header>
        <h1 className="font-display text-h1 font-semibold text-ink-50">
          BankGuard AI
        </h1>
        <p className="mt-1 text-body text-ink-400">
          Forensic design primitives — bg-ds v1 proofing surface.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-h2 font-medium text-ink-200">CaseTimeline</h2>
        <CaseTimeline status="DIAGNOSING" />
        <CaseTimeline status="FAILED" failedStage="EXTRACTING" />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-h2 font-medium text-ink-200">ConfidenceBadge</h2>
        <div className="flex flex-wrap items-start gap-3">
          <ConfidenceBadge band="HIGH" />
          <ConfidenceBadge band="MEDIUM" />
          <ConfidenceBadge band="LOW" />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-h2 font-medium text-ink-200">VerbatimQuote</h2>
        <VerbatimQuote
          phrase="After a recent review, we have determined that your account no longer aligns with our risk appetite."
          category="RISK_GENERIC"
          location="para 2"
        />
        <VerbatimQuote
          phrase="We were unable to verify the information requested during our review."
          category="KYC_DOCUMENTATION"
          location="para 3"
          highlighted
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-h2 font-medium text-ink-200">TriggerBar</h2>
        <p className="text-caption text-ink-400">
          Probability distribution over the closure-trigger taxonomy. The top
          trigger renders expanded by default.
        </p>
        <TriggerBar
          trigger="KYC_FAILURE"
          probability={0.62}
          rationale="Two phrases reference documentation that could not be verified, a pattern consistent with a CIP-driven exit. The 14-day response window further indicates a remediation path was offered before closure."
          evidence={[
            "We were unable to verify the information requested during our review.",
            "responseDeadline: 2026-05-28 (14 days)",
          ]}
          defaultExpanded
        />
        <TriggerBar
          trigger="AML_SAR"
          probability={0.21}
          rationale="Generic risk-appetite language alone is weak evidence; funds released on schedule points away from an active review hold."
          evidence={[
            "no longer aligns with our risk appetite",
          ]}
        />
        <TriggerBar
          trigger="DERISKING_CATEGORY"
          probability={0.11}
          rationale="Non-resident ownership with a software MCC carries a moderate category prior, but the letter contains no portfolio-level language."
          evidence={[]}
        />
        <TriggerBar trigger="UNKNOWN" probability={0.06} rationale="Residual mass — remaining hypotheses lack distinguishing evidence." evidence={[]} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-h2 font-medium text-ink-200">CitationCard</h2>
        <CitationCard
          tier="TIER_A"
          sectionRef="31 CFR 1020.320(e)"
          title="SAR confidentiality — banks are prohibited from disclosing that a SAR was filed"
          excerpt="A SAR, and any information that would reveal the existence of a SAR, are confidential, and shall not be disclosed..."
          sourceUrl="https://www.ecfr.gov/current/title-31/subtitle-B/chapter-X/part-1020/subpart-D/section-1020.320"
        />
        <CitationCard
          tier="TIER_B"
          sectionRef="pattern:risk-appetite-30day"
          title="Generic risk-appetite language with 30-day notice is consistent with portfolio de-risking"
          excerpt="Across observed cases, 30-day notices with funds released on schedule skewed toward category-level exits rather than account-specific review."
          n={14}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-h2 font-medium text-ink-200">
          BankabilityGauge — proactive engine
        </h2>
        <p className="text-caption text-ink-400">
          Deterministic bankability.v1 output for a representative profile
          (DE C-Corp, BD residency, MCC 7372, registered-agent address).
        </p>
        <BankabilityGauge
          score={bankability.aggregateScore}
          scoreVersion={bankability.scoreVersion}
          factorBreakdown={bankability.factorBreakdown}
        />
        <BankabilityGauge score={0} status="loading" />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-h2 font-medium text-ink-200">BankMatchRow</h2>
        <div className="flex flex-col gap-2">
          {bankMatches.map((match) => (
            <BankMatchRow key={match.bankSlug} match={match} />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-h2 font-medium text-ink-200">LetterPreview</h2>
        <LetterPreview
          body={DEMO_LETTER}
          complianceGatePassed={true}
        />
        <LetterPreview
          body={DEMO_LETTER}
          complianceGatePassed={false}
          complianceGateNotes={"SAR-assertion language matched: \\b(filed|submitted)\\s+a\\s+(SAR|suspicious activity report)\\b"}
        />
      </section>

      <DisclaimerFooter />
    </main>
  );
}
