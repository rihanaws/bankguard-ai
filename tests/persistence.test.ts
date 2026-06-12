import { describe, expect, test } from "bun:test";
import type { Prisma } from "@/lib/generated/prisma/client";
import { CaseStatus, JobKind } from "@/lib/generated/prisma/enums";
import {
  persistClassificationAndContinue,
  persistDiagnosisAndFinalize,
  persistExtractionAndEnqueue,
} from "@/workflows/persistence";

const CLASSIFICATION = {
  contractVersion: "classify.v1" as const,
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
  topTrigger: "FEE_OPERATIONAL" as const,
  confidenceBand: "HIGH" as const,
  rationales: [],
  counterSignals: [],
};

describe("transactional workflow persistence", () => {
  test("persists extraction before idempotent classification enqueue", async () => {
    const events: string[] = [];
    const transaction = {
      document: {
        async update() {
          events.push("extraction");
        },
      },
      pipelineJob: {
        async upsert(args: {
          create: { kind: string; idempotencyKey: string };
        }) {
          events.push(`enqueue:${args.create.kind}`);
          return { id: "job-2" };
        },
      },
    } as unknown as Prisma.TransactionClient;

    await persistExtractionAndEnqueue(transaction, {
      caseId: "1cf356cb-4e69-4a01-89ef-4f47141e717c",
      documentId: "24fc48dd-2fce-46bd-9b5b-87da6b635173",
      extraction: {
        contractVersion: "extract.v1",
        documentKind: "OTHER",
        bankName: null,
        bankSlugGuess: null,
        senderDepartment: null,
        senderContact: null,
        addresseeName: null,
        entityName: null,
        accountRefMasked: null,
        letterDate: null,
        closureEffectiveDate: null,
        noticeDays: null,
        responseDeadline: null,
        citedClauses: [],
        keyPhrases: [],
        fundsHeld: null,
        fundsDisposition: null,
        statedBalance: null,
        appealPathMentioned: false,
        appealInstructions: null,
        reasonGiven: false,
        statedReasonVerbatim: null,
        legibilityIssues: false,
        pagesMissingSuspected: false,
        language: "en",
      },
    });

    expect(events).toEqual(["extraction", `enqueue:${JobKind.CLASSIFY_CASE}`]);
  });

  test("persists lightweight report before setting REVIEW", async () => {
    const events: string[] = [];
    let persistedReport: unknown;
    const transaction = {
      diagnosis: {
        async upsert(args: {
          create: { report: unknown };
        }) {
          events.push("lightweight-report");
          persistedReport = args.create.report;
          return { id: "diagnosis-1" };
        },
      },
      case: {
        async update(args: { data: { status: string } }) {
          events.push(`case:${args.data.status}`);
        },
      },
      pipelineJob: {
        async upsert() {
          events.push("unexpected-enqueue");
          return { id: "job-3" };
        },
      },
    } as unknown as Prisma.TransactionClient;

    await persistClassificationAndContinue(transaction, {
      jobId: "06726c14-f632-472d-a6ac-0d8a615efd54",
      caseId: "1cf356cb-4e69-4a01-89ef-4f47141e717c",
      documentId: "24fc48dd-2fce-46bd-9b5b-87da6b635173",
      classification: CLASSIFICATION,
      shortCircuited: true,
    });

    expect(events).toEqual(["lightweight-report", `case:${CaseStatus.REVIEW}`]);
    expect(persistedReport).toMatchObject({
      reportVersion: "lightweight-report.v1",
      diagnosisState: "SKIPPED",
      letterState: "SKIPPED",
      sonnetCallAvoided: true,
    });
  });

  test("persists diagnosis and letter before setting REVIEW", async () => {
    const events: string[] = [];
    const transaction = {
      diagnosis: {
        async update() {
          events.push("diagnosis");
        },
      },
      generatedLetter: {
        async upsert() {
          events.push("letter");
          return { id: "letter-1" };
        },
      },
      case: {
        async update(args: { data: { status: string } }) {
          events.push(`case:${args.data.status}`);
        },
      },
    } as unknown as Prisma.TransactionClient;

    await persistDiagnosisAndFinalize(transaction, {
      jobId: "06726c14-f632-472d-a6ac-0d8a615efd54",
      caseId: "1cf356cb-4e69-4a01-89ef-4f47141e717c",
      diagnosisId: "ab238a75-5cdf-46f5-a75e-950387ff9dd6",
      classification: CLASSIFICATION,
      diagnosis: {
        contractVersion: "diagnose.v1",
        synthesisBreakdown: "x".repeat(200),
        probableReasons: [
          {
            trigger: "FEE_OPERATIONAL",
            probability: 0.85,
            narrative: "Explicit fee language is consistent with an operational closure.",
            evidenceRefs: [],
          },
        ],
        regulatoryBasis: [],
        recommendedActions: [
          {
            action: "Request written confirmation.",
            priority: "IMMEDIATE",
            rationale: "Preserves a record.",
          },
        ],
        caveats: ["Needs confirmation."],
        complianceGatePassed: true,
        generatedAppealLetter: "x".repeat(200),
      },
      gatePassed: true,
      gateNotes: [],
      latencyMs: 10,
    });

    expect(events).toEqual([
      "diagnosis",
      "letter",
      `case:${CaseStatus.REVIEW}`,
    ]);
  });
});
