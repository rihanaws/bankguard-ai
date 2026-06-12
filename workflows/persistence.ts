import {
  Prisma,
} from "@/lib/generated/prisma/client";
import {
  CaseStatus,
  JobKind,
  LetterKind,
} from "@/lib/generated/prisma/enums";
import {
  CLASSIFY_MODEL,
  CLASSIFY_VERSION,
  type ClassificationV1,
} from "./contracts/classify.contract";
import {
  DIAGNOSE_MODEL,
  DIAGNOSE_VERSION,
  type DiagnosisV1,
} from "./contracts/diagnose.contract";
import {
  EXTRACTION_MODEL,
  EXTRACTION_VERSION,
  type ExtractionV1,
} from "./contracts/extract.contract";
import {
  LIGHTWEIGHT_REPORT_VERSION,
  buildLightweightReport,
} from "./lightweight-report";
import {
  buildDownstreamIdempotencyKey,
  enqueueJob,
} from "./queue";

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function confidenceValue(
  band: ClassificationV1["confidenceBand"],
): number {
  return { LOW: 0.33, MEDIUM: 0.66, HIGH: 1 }[band];
}

export async function persistExtractionAndEnqueue(
  transaction: Prisma.TransactionClient,
  input: {
    caseId: string;
    documentId: string;
    extraction: ExtractionV1;
  },
): Promise<void> {
  await transaction.document.update({
    where: { id: input.documentId },
    data: {
      extraction: toInputJson(input.extraction),
      extractionVersion: EXTRACTION_VERSION,
      extractionModel: EXTRACTION_MODEL,
      extractedAt: new Date(),
      extractionError: null,
    },
  });

  await enqueueJob(transaction, {
    kind: JobKind.CLASSIFY_CASE,
    payload: {
      caseId: input.caseId,
      documentId: input.documentId,
    },
    idempotencyKey: buildDownstreamIdempotencyKey(
      JobKind.CLASSIFY_CASE,
      input.documentId,
      CLASSIFY_VERSION,
    ),
  });
}

export async function persistClassificationAndContinue(
  transaction: Prisma.TransactionClient,
  input: {
    jobId: string;
    caseId: string;
    documentId: string;
    classification: ClassificationV1;
    shortCircuited: boolean;
  },
): Promise<{ diagnosisId: string }> {
  const report = input.shortCircuited
    ? buildLightweightReport(input.classification)
    : { classification: input.classification };

  const diagnosis = await transaction.diagnosis.upsert({
    where: { sourceJobId: input.jobId },
    update: {
      triggerProbabilities: toInputJson(input.classification.probabilities),
      topTrigger: input.classification.topTrigger,
      topTriggerConfidence: confidenceValue(input.classification.confidenceBand),
      classifierVersion: CLASSIFY_VERSION,
      classifierModel: CLASSIFY_MODEL,
      report: toInputJson(report),
      reportVersion: input.shortCircuited
        ? LIGHTWEIGHT_REPORT_VERSION
        : null,
      reportModel: null,
      citedChunkIds: [],
    },
    create: {
      caseId: input.caseId,
      sourceJobId: input.jobId,
      triggerProbabilities: toInputJson(input.classification.probabilities),
      topTrigger: input.classification.topTrigger,
      topTriggerConfidence: confidenceValue(input.classification.confidenceBand),
      classifierVersion: CLASSIFY_VERSION,
      classifierModel: CLASSIFY_MODEL,
      report: toInputJson(report),
      reportVersion: input.shortCircuited
        ? LIGHTWEIGHT_REPORT_VERSION
        : null,
      reportModel: null,
      citedChunkIds: [],
    },
    select: { id: true },
  });

  if (input.shortCircuited) {
    await transaction.case.update({
      where: { id: input.caseId },
      data: {
        status: CaseStatus.REVIEW,
        failureReason: null,
      },
    });
    return { diagnosisId: diagnosis.id };
  }

  await enqueueJob(transaction, {
    kind: JobKind.DIAGNOSE_CASE,
    payload: {
      caseId: input.caseId,
      documentId: input.documentId,
      diagnosisId: diagnosis.id,
    },
    idempotencyKey: buildDownstreamIdempotencyKey(
      JobKind.DIAGNOSE_CASE,
      diagnosis.id,
      DIAGNOSE_VERSION,
    ),
  });
  return { diagnosisId: diagnosis.id };
}

export async function persistDiagnosisAndFinalize(
  transaction: Prisma.TransactionClient,
  input: {
    jobId: string;
    caseId: string;
    diagnosisId: string;
    classification: ClassificationV1;
    diagnosis: DiagnosisV1;
    gatePassed: boolean;
    gateNotes: string[];
    latencyMs: number;
  },
): Promise<void> {
  await transaction.diagnosis.update({
    where: { id: input.diagnosisId },
    data: {
      report: toInputJson({
        classification: input.classification,
        diagnosis: input.diagnosis,
      }),
      reportVersion: DIAGNOSE_VERSION,
      reportModel: DIAGNOSE_MODEL,
      citedChunkIds: input.diagnosis.regulatoryBasis.map(
        (basis) => basis.chunkId,
      ),
      latencyMs: input.latencyMs,
    },
  });

  const complianceGateNotes = input.gateNotes.join("\n") || null;
  await transaction.generatedLetter.upsert({
    where: { sourceJobId: input.jobId },
    update: {
      body: input.diagnosis.generatedAppealLetter,
      model: DIAGNOSE_MODEL,
      version: "letter.v1",
      complianceGatePassed: input.gatePassed,
      complianceGateNotes,
    },
    create: {
      caseId: input.caseId,
      sourceJobId: input.jobId,
      kind: LetterKind.BANK_APPEAL,
      body: input.diagnosis.generatedAppealLetter,
      model: DIAGNOSE_MODEL,
      version: "letter.v1",
      complianceGatePassed: input.gatePassed,
      complianceGateNotes,
    },
  });

  await transaction.case.update({
    where: { id: input.caseId },
    data: {
      status: CaseStatus.REVIEW,
      failureReason: null,
    },
  });
}
