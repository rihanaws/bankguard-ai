/**
 * Pipeline handoff smoke test — run with: bun scripts/smoke-pipeline.ts
 *
 * Exercises the Haiku→Haiku→Sonnet payload handoff in workflows/engine.ts with
 * canned model outputs (no API calls): full path, short-circuit path, and a
 * compliance-gate rejection. Exits non-zero on any failure.
 */

import {
  runCasePipeline,
  shouldShortCircuit,
  type ModelInvoker,
} from "../workflows/engine";
import { EXTRACTION_SYSTEM_PROMPT } from "../workflows/contracts/extract.contract";
import { CLASSIFY_SYSTEM_PROMPT } from "../workflows/contracts/classify.contract";
import {
  DIAGNOSE_SYSTEM_PROMPT,
  runComplianceGate,
  type RagChunkPayloadT,
} from "../workflows/contracts/diagnose.contract";
import { parseExtraction } from "../workflows/contracts/extract.contract";
import { parseClassification } from "../workflows/contracts/classify.contract";
import type { Prisma } from "../lib/generated/prisma/client";
import { CaseStatus } from "../lib/generated/prisma/enums";
import {
  LightweightReportV1Schema,
} from "../workflows/lightweight-report";
import { persistClassificationAndContinue } from "../workflows/persistence";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const FIXTURE_EXTRACTION = {
  contractVersion: "extract.v1",
  documentKind: "TERMINATION_LETTER",
  bankName: "Mercury Technologies, Inc.",
  bankSlugGuess: "mercury",
  senderDepartment: "Risk Operations",
  senderContact: "risk@mercury.example",
  addresseeName: "TechSci Inc",
  entityName: "TechSci Inc",
  accountRefMasked: "ending in 4821",
  letterDate: "2026-05-14",
  closureEffectiveDate: "2026-06-13",
  noticeDays: 30,
  responseDeadline: "2026-05-28",
  citedClauses: [
    {
      reference: "Section 11(b) of the Deposit Agreement",
      verbatimContext:
        "In accordance with Section 11(b) of the Deposit Agreement, we may close your account at any time.",
    },
  ],
  keyPhrases: [
    {
      phrase: "we were unable to verify the information requested during our review",
      category: "KYC_DOCUMENTATION",
      location: "para 2",
    },
    {
      phrase: "no longer aligns with our risk appetite",
      category: "RISK_GENERIC",
      location: "para 3",
    },
    {
      phrase: "your remaining balance will be returned via check within 30 days",
      category: "FUNDS_DISPOSITION",
      location: "para 4",
    },
  ],
  fundsHeld: false,
  fundsDisposition: "your remaining balance will be returned via check within 30 days",
  statedBalance: { amountCents: 1284500, currency: "USD" },
  appealPathMentioned: true,
  appealInstructions: "You may submit additional documentation by 2026-05-28.",
  reasonGiven: false,
  statedReasonVerbatim: null,
  legibilityIssues: false,
  pagesMissingSuspected: false,
  language: "en",
};

const FIXTURE_CLASSIFICATION = {
  contractVersion: "classify.v1",
  probabilities: {
    AML_SAR: 0.18,
    SANCTIONS_GEO: 0.05,
    KYC_FAILURE: 0.55,
    FRAUD_CHARGEBACK: 0.02,
    FEE_OPERATIONAL: 0.03,
    DERISKING_CATEGORY: 0.1,
    POLICY_UPDATE: 0.02,
    UNKNOWN: 0.05,
  },
  topTrigger: "KYC_FAILURE",
  confidenceBand: "HIGH",
  rationales: [
    {
      trigger: "KYC_FAILURE",
      evidence: ["we were unable to verify the information requested during our review"],
      reasoning:
        "Explicit verification-failure language with a documentation deadline is consistent with a CIP-driven exit.",
    },
    {
      trigger: "AML_SAR",
      evidence: ["no longer aligns with our risk appetite"],
      reasoning:
        "Generic risk language keeps a residual AML hypothesis open, though funds released on schedule weakens it.",
    },
    {
      trigger: "DERISKING_CATEGORY",
      evidence: ["ownerResidencyIso: BD", "mccCode: 7372"],
      reasoning:
        "Non-resident ownership with a software MCC carries a moderate category prior absent portfolio language.",
    },
  ],
  counterSignals: ["30-day notice and scheduled funds release point away from an active hold."],
};

const CHUNK_A = "0c4f8a52-7c1e-4a39-9f9d-2b6f1e1a9d01";
const CHUNK_B = "5e2b9d11-3a44-4c8e-8a7f-9c0d4f6b2e02";

const FIXTURE_RAG: RagChunkPayloadT[] = [
  {
    chunkId: CHUNK_A,
    tier: "TIER_A",
    sectionRef: "31 CFR 1020.220(a)",
    title: "Customer Identification Program requirements",
    sourceUrl: "https://www.ecfr.gov/current/title-31/section-1020.220",
    n: null,
    content:
      "A bank must implement a written Customer Identification Program appropriate for its size and type of business...",
  },
  {
    chunkId: CHUNK_B,
    tier: "TIER_B",
    sectionRef: "pattern:kyc-14day-window",
    title: "Verification-failure exits with remediation windows",
    sourceUrl: null,
    n: 11,
    content:
      "Across community-reported cases, letters citing unverifiable information with a 14-day response window preceded closure unless documentation was accepted.",
  },
];

const COMPLIANT_LETTER = [
  "{{LETTER_DATE}}",
  "",
  "{{BANK_NAME}} — Risk Operations",
  "",
  "Re: Account {{ACCOUNT_REF_MASKED}} — Request for review and documentation clarification",
  "",
  "To the Compliance Review Team,",
  "",
  "We write on behalf of {{ENTITY_NAME}}, a {{ENTITY_TYPE}}, regarding the closure notice dated {{CLOSURE_NOTICE_DATE}} with an effective date of {{CLOSURE_EFFECTIVE_DATE}}.",
  "",
  "Your notice indicates that requested information could not be verified during review. We respectfully request a written enumeration of the outstanding documentation items so that {{ENTITY_NAME}} may remedy any deficiency before {{RESPONSE_DEADLINE}}.",
  "",
  "We further request written confirmation of the funds-release timeline for the remaining balance.",
  "",
  "Respectfully,",
  "{{SIGNATORY_NAME}}, {{SIGNATORY_TITLE}}",
  "",
  "---",
  "This letter was prepared with software assistance as an informational aid and does not constitute legal advice.",
].join("\n");

const FIXTURE_DIAGNOSIS = {
  contractVersion: "diagnose.v1",
  synthesisBreakdown:
    "Verdict: the letter's language is most consistent with a KYC verification failure (probability 0.55, confidence high). The phrase \"we were unable to verify the information requested during our review\" is explicit categorical language under the Customer Identification Program framework (31 CFR 1020.220(a)), which requires banks to verify customer identity and beneficial ownership; where verification cannot be completed, exit is the prescribed posture. The residual AML hypothesis (0.18) rests only on generic risk-appetite boilerplate, and the scheduled funds release weakens it. The observed pattern in 11 community reports indicates that verification-failure letters with a 14-day response window preceded closure unless documentation was accepted, which suggests the response deadline of 2026-05-28 is an actionable remediation path rather than a formality. What this analysis cannot establish: the bank's internal trigger with certainty, since banks are legally constrained from disclosing suspicious-activity-related reasoning.",
  probableReasons: [
    {
      trigger: "KYC_FAILURE",
      probability: 0.55,
      narrative:
        "Explicit verification-failure language paired with a documentation deadline indicates a probable CIP-driven exit.",
      evidenceRefs: ["we were unable to verify the information requested during our review"],
    },
    {
      trigger: "AML_SAR",
      probability: 0.18,
      narrative:
        "Generic risk-appetite language keeps this hypothesis open; the on-schedule funds release is a counter-signal.",
      evidenceRefs: ["no longer aligns with our risk appetite"],
    },
    {
      trigger: "DERISKING_CATEGORY",
      probability: 0.1,
      narrative:
        "Non-resident ownership with MCC 7372 carries a category prior, though the letter lacks portfolio-level language.",
      evidenceRefs: ["ownerResidencyIso: BD", "mccCode: 7372"],
    },
  ],
  regulatoryBasis: [
    {
      chunkId: CHUNK_A,
      relevance:
        "Establishes the CIP verification duty that the letter's language tracks; failure to verify supports exit.",
    },
    {
      chunkId: CHUNK_B,
      relevance:
        "Observed pattern (n=11 community reports): remediation windows in verification-failure letters were actionable.",
    },
  ],
  recommendedActions: [
    {
      action:
        "Submit the complete beneficial-ownership and entity documentation package before the 2026-05-28 deadline.",
      priority: "IMMEDIATE",
      rationale:
        "The letter offers a remediation window; the observed pattern suggests acceptance halts closure in comparable cases.",
    },
    {
      action: "Request written confirmation of the funds-release timeline.",
      priority: "IMMEDIATE",
      rationale: "Creates a paper trail for any later funds-release escalation.",
    },
    {
      action:
        "Prepare a contingency banking application at an NRA-eligible institution with the strengthened documentation set.",
      priority: "SHORT_TERM",
      rationale: "Reduces operational exposure if remediation is not accepted.",
    },
  ],
  caveats: [
    "Banks are legally constrained from disclosing suspicious-activity-related reasoning; no analysis can rule the AML hypothesis fully in or out.",
    "Community-pattern evidence is anecdotal (n=11) and is not regulatory authority.",
  ],
  complianceGatePassed: true,
  generatedAppealLetter: COMPLIANT_LETTER,
};

// Short-circuit fixtures: stated mundane reason, no funds held.
const FIXTURE_EXTRACTION_FEE = {
  ...FIXTURE_EXTRACTION,
  keyPhrases: [
    {
      phrase: "your account has carried a negative balance for 90 days",
      category: "OTHER",
      location: "para 1",
    },
  ],
  citedClauses: [],
  reasonGiven: true,
  statedReasonVerbatim: "your account has carried a negative balance for 90 days",
  fundsHeld: false,
  statedBalance: { amountCents: -4200, currency: "USD" },
};

const FIXTURE_CLASSIFICATION_FEE = {
  ...FIXTURE_CLASSIFICATION,
  probabilities: {
    AML_SAR: 0.03,
    SANCTIONS_GEO: 0.01,
    KYC_FAILURE: 0.02,
    FRAUD_CHARGEBACK: 0.02,
    FEE_OPERATIONAL: 0.85,
    DERISKING_CATEGORY: 0.03,
    POLICY_UPDATE: 0.01,
    UNKNOWN: 0.03,
  },
  topTrigger: "FEE_OPERATIONAL",
  confidenceBand: "HIGH",
  rationales: [
    {
      trigger: "FEE_OPERATIONAL",
      evidence: ["your account has carried a negative balance for 90 days"],
      reasoning: "Explicit negative-balance reason is a mundane housekeeping closure.",
    },
  ],
  counterSignals: [],
};

// ─── Stub invoker ────────────────────────────────────────────────────────────

function makeInvoker(fixtures: {
  extraction: unknown;
  classification: unknown;
  diagnosis: unknown;
}, calls?: string[]): ModelInvoker {
  return async ({ system }) => {
    calls?.push(system);
    if (system === EXTRACTION_SYSTEM_PROMPT) return JSON.stringify(fixtures.extraction);
    if (system === CLASSIFY_SYSTEM_PROMPT) return JSON.stringify(fixtures.classification);
    if (system === DIAGNOSE_SYSTEM_PROMPT) return JSON.stringify(fixtures.diagnosis);
    throw new Error("Unexpected system prompt in smoke test");
  };
}

const DOC = { filename: "letter.pdf", mimeType: "application/pdf", base64Data: "dGVzdA==" };
const CONTEXT = {
  entityType: "C_CORP",
  entityState: "DE",
  ownerResidencyIso: "BD",
  mccCode: "7372",
  accountAgeMonths: 14,
  recentActivitySummary: "steady SaaS revenue, no dormancy",
  priorClosuresCount: 1,
};

// ─── Assertions ──────────────────────────────────────────────────────────────

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  PASS  ${name}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  console.log("[1/4] Contract fixtures validate independently");
  check("extract.v1 fixture", parseExtraction(JSON.stringify(FIXTURE_EXTRACTION)).ok);
  check("classify.v1 fixture", parseClassification(JSON.stringify(FIXTURE_CLASSIFICATION)).ok);

  console.log("[2/4] Full pipeline handoff (extract → classify → diagnose)");
  const full = await runCasePipeline({
    invoke: makeInvoker({
      extraction: FIXTURE_EXTRACTION,
      classification: FIXTURE_CLASSIFICATION,
      diagnosis: FIXTURE_DIAGNOSIS,
    }),
    document: DOC,
    context: CONTEXT,
    ragChunks: FIXTURE_RAG,
  });
  check("pipeline ok", full.ok, full.ok ? undefined : `${full.stage}: ${full.error}`);
  if (full.ok) {
    check("not short-circuited", !full.shortCircuited);
    check("diagnosis present", full.diagnosis !== null);
    check("compliance gate passed", full.complianceGatePassed === true,
      full.complianceGateNotes.join("; "));
    check(
      "top trigger handoff intact",
      full.classification?.topTrigger === "KYC_FAILURE" &&
        full.diagnosis?.probableReasons[0]?.trigger === "KYC_FAILURE",
    );
  }

  console.log("[3/4] Short-circuit gate (mundane fee closure skips Sonnet)");
  const shortCircuitCalls: string[] = [];
  const sc = await runCasePipeline({
    invoke: makeInvoker({
      extraction: FIXTURE_EXTRACTION_FEE,
      classification: FIXTURE_CLASSIFICATION_FEE,
      diagnosis: FIXTURE_DIAGNOSIS, // must NOT be reached
    }, shortCircuitCalls),
    document: DOC,
    context: CONTEXT,
    ragChunks: FIXTURE_RAG,
  });
  check("pipeline ok", sc.ok, sc.ok ? undefined : `${sc.stage}: ${sc.error}`);
  if (sc.ok) {
    check("short-circuited", sc.shortCircuited);
    check("no diagnosis on short-circuit", sc.diagnosis === null);
    check(
      "Sonnet not invoked",
      !shortCircuitCalls.includes(DIAGNOSE_SYSTEM_PROMPT),
    );
  }
  const extFee = parseExtraction(JSON.stringify(FIXTURE_EXTRACTION_FEE));
  const clsFee = parseClassification(JSON.stringify(FIXTURE_CLASSIFICATION_FEE));
  check(
    "shouldShortCircuit unit",
    extFee.ok && clsFee.ok && shouldShortCircuit(extFee.extraction, clsFee.classification),
  );

  if (clsFee.ok) {
    const persistenceEvents: string[] = [];
    let persistedReport: unknown;
    const transaction = {
      diagnosis: {
        async upsert(args: { create: { report: unknown } }) {
          persistenceEvents.push("artifact");
          persistedReport = args.create.report;
          return { id: "ab238a75-5cdf-46f5-a75e-950387ff9dd6" };
        },
      },
      case: {
        async update(args: { data: { status: string } }) {
          persistenceEvents.push(`case:${args.data.status}`);
        },
      },
      pipelineJob: {
        async upsert() {
          persistenceEvents.push("unexpected-enqueue");
          return { id: "unused" };
        },
      },
    } as unknown as Prisma.TransactionClient;

    await persistClassificationAndContinue(transaction, {
      jobId: "06726c14-f632-472d-a6ac-0d8a615efd54",
      caseId: "1cf356cb-4e69-4a01-89ef-4f47141e717c",
      documentId: "24fc48dd-2fce-46bd-9b5b-87da6b635173",
      classification: clsFee.classification,
      shortCircuited: true,
    });
    check(
      "lightweight report contract persists",
      LightweightReportV1Schema.safeParse(persistedReport).success,
    );
    check(
      "artifact persists before REVIEW",
      persistenceEvents.join(",") === `artifact,case:${CaseStatus.REVIEW}`,
      persistenceEvents.join(","),
    );
  }

  console.log("[4/4] Programmatic compliance gate rejects violating letters");
  const bad = runComplianceGate(
    COMPLIANT_LETTER.replace(
      "Your notice indicates that requested information could not be verified during review.",
      "Your institution filed a SAR against our account and we demand reinstatement now!",
    ),
  );
  check("SAR assertion rejected", !bad.passed && bad.notes.length >= 2, bad.notes.join("; "));
  const good = runComplianceGate(COMPLIANT_LETTER);
  check("compliant letter passes", good.passed, good.notes.join("; "));

  console.log("");
  if (failures > 0) {
    console.error(`${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("All smoke checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
