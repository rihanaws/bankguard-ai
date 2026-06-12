import {
  Prisma,
  type PrismaClient,
} from "@/lib/generated/prisma/client";
import {
  CaseStatus,
  JobKind,
  JobStatus,
  type JobKind as JobKindT,
  type JobStatus as JobStatusT,
} from "@/lib/generated/prisma/enums";
import {
  resolveCaseReference,
  resolveDocumentReference,
} from "./job-payloads";

export interface ClaimedJob {
  id: string;
  kind: JobKindT;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
}

export function getPipelineLeaseMs(raw: string | undefined): number {
  if (raw === undefined || raw === "") return 300_000;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error("PIPELINE_JOB_LEASE_MS must be a positive integer");
  }
  return parsed;
}

export function isJobEligibleForClaim(
  job: {
    status: JobStatusT;
    runAfter: Date;
    lockedAt: Date | null;
  },
  now: Date,
  leaseMs: number,
): boolean {
  if (job.status === JobStatus.QUEUED) {
    return job.runAfter.getTime() <= now.getTime();
  }
  return (
    job.status === JobStatus.RUNNING &&
    job.lockedAt !== null &&
    job.lockedAt.getTime() <= now.getTime() - leaseMs
  );
}

export function buildDownstreamIdempotencyKey(
  kind: JobKindT,
  sourceId: string,
  version: string,
): string {
  return `${kind}:${sourceId}:${version}`;
}

export async function claimJob(
  database: PrismaClient,
  workerId: string,
  leaseMs: number,
  now = new Date(),
): Promise<ClaimedJob | null> {
  const staleBefore = new Date(now.getTime() - leaseMs);
  const rows = await database.$queryRaw<ClaimedJob[]>(Prisma.sql`
    UPDATE "PipelineJob"
    SET status = ${JobStatus.RUNNING}::"JobStatus",
        "lockedAt" = ${now},
        "lockedBy" = ${workerId},
        attempts = attempts + 1,
        "completedAt" = NULL
    WHERE id = (
      SELECT id
      FROM "PipelineJob"
      WHERE (
        (
          status = ${JobStatus.QUEUED}::"JobStatus"
          AND "runAfter" <= ${now}
        )
        OR
        (
          status = ${JobStatus.RUNNING}::"JobStatus"
          AND "lockedAt" <= ${staleBefore}
        )
      )
      ORDER BY "createdAt"
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id, kind, payload, attempts, "maxAttempts";
  `);
  return rows[0] ?? null;
}

export async function enqueueJob(
  transaction: Prisma.TransactionClient,
  input: {
    kind: JobKindT;
    payload: Prisma.InputJsonObject;
    idempotencyKey: string;
  },
): Promise<{ id: string }> {
  return transaction.pipelineJob.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    update: {},
    create: {
      kind: input.kind,
      payload: input.payload,
      idempotencyKey: input.idempotencyKey,
    },
    select: { id: true },
  });
}

export async function completeJob(
  database: PrismaClient,
  id: string,
): Promise<void> {
  await database.pipelineJob.update({
    where: { id },
    data: {
      status: JobStatus.SUCCEEDED,
      completedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      lastError: null,
    },
  });
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 8_000);
}

async function resolveRelatedCaseId(
  transaction: Prisma.TransactionClient,
  job: ClaimedJob,
): Promise<string | null> {
  const directCaseId = resolveCaseReference(job.kind, job.payload);
  if (directCaseId) return directCaseId;

  if (job.kind !== JobKind.EXTRACT_DOCUMENT) return null;
  const documentId = resolveDocumentReference(job.payload);
  if (!documentId) return null;
  const document = await transaction.document.findUnique({
    where: { id: documentId },
    select: { caseId: true },
  });
  return document?.caseId ?? null;
}

export async function failClaimedJob(
  database: PrismaClient,
  job: ClaimedJob,
  error: unknown,
  options: { permanent: boolean; now?: Date },
): Promise<void> {
  const message = errorMessage(error);
  const now = options.now ?? new Date();
  const terminal = options.permanent || job.attempts >= job.maxAttempts;

  if (!terminal) {
    await database.pipelineJob.update({
      where: { id: job.id },
      data: {
        status: JobStatus.QUEUED,
        lastError: message,
        completedAt: null,
        lockedAt: null,
        lockedBy: null,
        runAfter: new Date(
          now.getTime() + 30_000 * 2 ** Math.max(job.attempts - 1, 0),
        ),
      },
    });
    return;
  }

  await database.$transaction(async (transaction) => {
    const caseId = await resolveRelatedCaseId(transaction, job);
    await transaction.pipelineJob.update({
      where: { id: job.id },
      data: {
        status: JobStatus.FAILED,
        lastError: message,
        completedAt: now,
        lockedAt: null,
        lockedBy: null,
      },
    });
    if (caseId) {
      await transaction.case.update({
        where: { id: caseId },
        data: {
          status: CaseStatus.FAILED,
          failureReason: message,
        },
      });
    }
  });
}

interface TransactionRunner<TTransaction> {
  $transaction<T>(
    work: (transaction: TTransaction) => Promise<T>,
  ): Promise<T>;
}

export async function runTransactionalStage<TTransaction>(
  database: TransactionRunner<TTransaction>,
  persist: (transaction: TTransaction) => Promise<void>,
  enqueueOrFinalize: (transaction: TTransaction) => Promise<void>,
): Promise<void> {
  await database.$transaction(async (transaction) => {
    await persist(transaction);
    await enqueueOrFinalize(transaction);
  });
}
