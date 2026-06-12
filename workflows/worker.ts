/**
 * BankGuard AI pipeline worker (Hetzner deployment target).
 * Run with: bun workflows/worker.ts
 */
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  CaseStatus,
  JobKind,
} from "@/lib/generated/prisma/enums";
import { localFsStorage } from "@/lib/storage";
import { anthropicInvoker } from "./invoker";
import {
  runClassificationStage,
  runDiagnosisStage,
  runExtractionStage,
  shouldShortCircuit,
} from "./engine";
import {
  ClassificationV1Schema,
  type CaseContextSnapshot,
} from "./contracts/classify.contract";
import {
  runComplianceGate,
  validateCitations,
  type RagChunkPayloadT,
} from "./contracts/diagnose.contract";
import {
  EXTRACTION_VERSION,
  ExtractionV1Schema,
} from "./contracts/extract.contract";
import {
  type ClassifyCaseJobPayload,
  type DiagnoseCaseJobPayload,
  type ExtractDocumentJobPayload,
  parseJobPayload,
} from "./job-payloads";
import {
  persistClassificationAndContinue,
  persistDiagnosisAndFinalize,
  persistExtractionAndEnqueue,
} from "./persistence";
import {
  type ClaimedJob,
  claimJob,
  completeJob,
  failClaimedJob,
  getPipelineLeaseMs,
} from "./queue";
import { PermanentJobError } from "./workflow-errors";

const WORKER_ID = `worker-${randomUUID().slice(0, 8)}`;
const POLL_MS = 2_000;

async function retrieveChunks(
  _extractionPhraseCategories: string[],
): Promise<RagChunkPayloadT[]> {
  // RAG population is outside Phase 1. An empty retrieval set keeps the
  // citation gate authoritative until the KB worker is implemented.
  return [];
}

function parseStoredExtraction(value: unknown, documentId: string) {
  const result = ExtractionV1Schema.safeParse(value);
  if (!result.success) {
    throw new PermanentJobError(
      `Document ${documentId} contains invalid ${EXTRACTION_VERSION} data: ${
        result.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; ")
      }`,
    );
  }
  return result.data;
}

function parseStoredClassification(value: unknown, diagnosisId: string) {
  const result = ClassificationV1Schema.safeParse(value);
  if (!result.success) {
    throw new PermanentJobError(
      `Diagnosis ${diagnosisId} contains invalid classification data: ${
        result.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; ")
      }`,
    );
  }
  return result.data;
}

async function handleExtractDocument(
  job: ClaimedJob,
  payload: ExtractDocumentJobPayload,
): Promise<void> {
  const document = await prisma.document.findUniqueOrThrow({
    where: { id: payload.documentId },
  });
  if (payload.caseId && payload.caseId !== document.caseId) {
    throw new PermanentJobError(
      `EXTRACT_DOCUMENT caseId does not match document ${document.id}`,
    );
  }

  if (
    document.extraction &&
    document.extractionVersion === EXTRACTION_VERSION
  ) {
    const extraction = parseStoredExtraction(
      document.extraction,
      document.id,
    );
    await prisma.$transaction((transaction) =>
      persistExtractionAndEnqueue(transaction, {
        caseId: document.caseId,
        documentId: document.id,
        extraction,
      }),
    );
    return;
  }

  await prisma.case.update({
    where: { id: document.caseId },
    data: { status: CaseStatus.EXTRACTING, failureReason: null },
  });

  const object = await localFsStorage.get(document.storageKey);
  const result = await runExtractionStage(anthropicInvoker, {
    filename: document.filename,
    mimeType: document.mimeType,
    base64Data: object.base64Data,
  });
  if (!result.ok) {
    await prisma.document.update({
      where: { id: document.id },
      data: { extractionError: result.error },
    });
    throw new Error(result.error);
  }

  await prisma.$transaction((transaction) =>
    persistExtractionAndEnqueue(transaction, {
      caseId: document.caseId,
      documentId: document.id,
      extraction: result.extraction,
    }),
  );
}

async function loadCaseInputs(
  caseId: string,
  documentId: string,
): Promise<{
  extraction: ReturnType<typeof parseStoredExtraction>;
  context: CaseContextSnapshot;
}> {
  const [kase, document] = await Promise.all([
    prisma.case.findUniqueOrThrow({ where: { id: caseId } }),
    prisma.document.findUniqueOrThrow({ where: { id: documentId } }),
  ]);
  if (document.caseId !== caseId) {
    throw new PermanentJobError(
      `Document ${documentId} does not belong to case ${caseId}`,
    );
  }
  if (!document.extraction) {
    throw new Error(`Case ${caseId} has no extracted document`);
  }

  return {
    extraction: parseStoredExtraction(document.extraction, document.id),
    context: {
      entityType: kase.entityType,
      entityState: kase.entityState,
      ownerResidencyIso: kase.ownerResidencyIso,
      mccCode: kase.mccCode,
      accountAgeMonths: null,
      recentActivitySummary: null,
      priorClosuresCount: null,
    },
  };
}

async function handleClassifyCase(
  job: ClaimedJob,
  payload: ClassifyCaseJobPayload,
): Promise<void> {
  const existing = await prisma.diagnosis.findUnique({
    where: { sourceJobId: job.id },
    select: { id: true },
  });
  if (existing) return;

  const { extraction, context } = await loadCaseInputs(
    payload.caseId,
    payload.documentId,
  );
  await prisma.case.update({
    where: { id: payload.caseId },
    data: { status: CaseStatus.CLASSIFYING, failureReason: null },
  });

  const result = await runClassificationStage(
    anthropicInvoker,
    extraction,
    context,
  );
  if (!result.ok) throw new Error(result.error);

  await prisma.$transaction((transaction) =>
    persistClassificationAndContinue(transaction, {
      jobId: job.id,
      caseId: payload.caseId,
      documentId: payload.documentId,
      classification: result.classification,
      shortCircuited: shouldShortCircuit(
        extraction,
        result.classification,
      ),
    }),
  );
}

async function handleDiagnoseCase(
  job: ClaimedJob,
  payload: DiagnoseCaseJobPayload,
): Promise<void> {
  const existingLetter = await prisma.generatedLetter.findUnique({
    where: { sourceJobId: job.id },
    select: { id: true },
  });
  if (existingLetter) return;

  const { extraction } = await loadCaseInputs(
    payload.caseId,
    payload.documentId,
  );
  const diagnosisRow = await prisma.diagnosis.findUniqueOrThrow({
    where: { id: payload.diagnosisId },
  });
  if (diagnosisRow.caseId !== payload.caseId) {
    throw new PermanentJobError(
      `Diagnosis ${payload.diagnosisId} does not belong to case ${payload.caseId}`,
    );
  }
  const stored = diagnosisRow.report as
    | { classification?: unknown }
    | null;
  const classification = parseStoredClassification(
    stored?.classification,
    diagnosisRow.id,
  );

  await prisma.case.update({
    where: { id: payload.caseId },
    data: { status: CaseStatus.DIAGNOSING, failureReason: null },
  });

  const ragChunks = await retrieveChunks(
    extraction.keyPhrases.map((phrase) => phrase.category),
  );
  const started = Date.now();
  const result = await runDiagnosisStage(
    anthropicInvoker,
    extraction,
    classification,
    ragChunks,
  );
  if (!result.ok) throw new Error(result.error);

  const letterGate = runComplianceGate(
    result.diagnosis.generatedAppealLetter,
  );
  const citationGate = validateCitations(result.diagnosis, ragChunks);
  const gatePassed =
    result.diagnosis.complianceGatePassed &&
    letterGate.passed &&
    citationGate.passed;
  const gateNotes = [...letterGate.notes, ...citationGate.notes];

  await prisma.$transaction((transaction) =>
    persistDiagnosisAndFinalize(transaction, {
      jobId: job.id,
      caseId: payload.caseId,
      diagnosisId: payload.diagnosisId,
      classification,
      diagnosis: result.diagnosis,
      gatePassed,
      gateNotes,
      latencyMs: Date.now() - started,
    }),
  );
}

export async function dispatchJob(job: ClaimedJob): Promise<void> {
  if (job.attempts > job.maxAttempts) {
    throw new PermanentJobError(
      `Job lease expired after ${job.maxAttempts} attempts`,
    );
  }

  switch (job.kind) {
    case JobKind.EXTRACT_DOCUMENT:
      return handleExtractDocument(
        job,
        parseJobPayload(JobKind.EXTRACT_DOCUMENT, job.payload),
      );
    case JobKind.CLASSIFY_CASE:
      return handleClassifyCase(
        job,
        parseJobPayload(JobKind.CLASSIFY_CASE, job.payload),
      );
    case JobKind.DIAGNOSE_CASE:
      return handleDiagnoseCase(
        job,
        parseJobPayload(JobKind.DIAGNOSE_CASE, job.payload),
      );
    case JobKind.GENERATE_LETTER:
    case JobKind.KB_CRAWL:
    case JobKind.KB_EMBED:
    case JobKind.COMMUNITY_SCRAPE:
    case JobKind.SANCTIONS_SCREEN:
      parseJobPayload(job.kind, job.payload);
      throw new PermanentJobError(
        `No Phase 1 handler is implemented for ${job.kind}`,
      );
  }
}

export async function main(): Promise<void> {
  const leaseMs = getPipelineLeaseMs(process.env.PIPELINE_JOB_LEASE_MS);
  let shuttingDown = false;
  process.on("SIGINT", () => {
    shuttingDown = true;
  });
  process.on("SIGTERM", () => {
    shuttingDown = true;
  });

  console.log(
    `[${WORKER_ID}] polling every ${POLL_MS}ms with ${leaseMs}ms leases`,
  );
  while (!shuttingDown) {
    const job = await claimJob(prisma, WORKER_ID, leaseMs);
    if (!job) {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      continue;
    }

    try {
      console.log(
        `[${WORKER_ID}] ${job.kind} ${job.id} (attempt ${job.attempts})`,
      );
      await dispatchJob(job);
      await completeJob(prisma, job.id);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      console.error(
        `[${WORKER_ID}] ${job.kind} ${job.id} failed: ${message}`,
      );
      await failClaimedJob(prisma, job, error, {
        permanent: error instanceof PermanentJobError,
      });
    }
  }

  console.log(`[${WORKER_ID}] graceful shutdown`);
  await prisma.$disconnect();
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
