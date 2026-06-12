import { describe, expect, test } from "bun:test";
import {
  CaseStatus,
  JobKind,
  JobStatus,
} from "@/lib/generated/prisma/enums";
import type {
  Prisma,
  PrismaClient,
} from "@/lib/generated/prisma/client";
import {
  buildDownstreamIdempotencyKey,
  enqueueJob,
  failClaimedJob,
  getPipelineLeaseMs,
  isJobEligibleForClaim,
  runTransactionalStage,
} from "@/workflows/queue";
import {
  PermanentJobError,
  parseJobPayload,
  resolveCaseReference,
} from "@/workflows/job-payloads";
import {
  LIGHTWEIGHT_REPORT_VERSION,
  buildLightweightReport,
} from "@/workflows/lightweight-report";

describe("job payload validation", () => {
  test("parses every supported payload shape", () => {
    expect(
      parseJobPayload(JobKind.EXTRACT_DOCUMENT, {
        documentId: "24fc48dd-2fce-46bd-9b5b-87da6b635173",
      }),
    ).toMatchObject({ documentId: "24fc48dd-2fce-46bd-9b5b-87da6b635173" });
    expect(
      parseJobPayload(JobKind.CLASSIFY_CASE, {
        caseId: "1cf356cb-4e69-4a01-89ef-4f47141e717c",
        documentId: "24fc48dd-2fce-46bd-9b5b-87da6b635173",
      }),
    ).toMatchObject({ caseId: "1cf356cb-4e69-4a01-89ef-4f47141e717c" });
  });

  test("turns malformed payloads into permanent failures", () => {
    expect(() =>
      parseJobPayload(JobKind.DIAGNOSE_CASE, { caseId: "not-a-uuid" }),
    ).toThrow(PermanentJobError);
  });

  test("resolves direct case references without trusting malformed payloads", () => {
    expect(
      resolveCaseReference(JobKind.CLASSIFY_CASE, {
        caseId: "1cf356cb-4e69-4a01-89ef-4f47141e717c",
        documentId: "24fc48dd-2fce-46bd-9b5b-87da6b635173",
      }),
    ).toBe("1cf356cb-4e69-4a01-89ef-4f47141e717c");
    expect(resolveCaseReference(JobKind.EXTRACT_DOCUMENT, {})).toBeNull();
  });
});

describe("queue reliability helpers", () => {
  test("defaults the lease to five minutes and validates overrides", () => {
    expect(getPipelineLeaseMs(undefined)).toBe(300_000);
    expect(getPipelineLeaseMs("60000")).toBe(60_000);
    expect(() => getPipelineLeaseMs("0")).toThrow("PIPELINE_JOB_LEASE_MS");
  });

  test("makes a stale running job eligible for reclaim", () => {
    const now = new Date("2026-06-12T12:00:00.000Z");
    expect(
      isJobEligibleForClaim(
        {
          status: JobStatus.RUNNING,
          runAfter: now,
          lockedAt: new Date("2026-06-12T11:54:59.999Z"),
        },
        now,
        300_000,
      ),
    ).toBe(true);
    expect(
      isJobEligibleForClaim(
        {
          status: JobStatus.RUNNING,
          runAfter: now,
          lockedAt: new Date("2026-06-12T11:55:00.001Z"),
        },
        now,
        300_000,
      ),
    ).toBe(false);
  });

  test("uses deterministic downstream idempotency keys", () => {
    expect(
      buildDownstreamIdempotencyKey(
        JobKind.CLASSIFY_CASE,
        "24fc48dd-2fce-46bd-9b5b-87da6b635173",
        "classify.v1",
      ),
    ).toBe(
      "CLASSIFY_CASE:24fc48dd-2fce-46bd-9b5b-87da6b635173:classify.v1",
    );
  });

  test("prevents duplicate downstream enqueue by idempotency key", async () => {
    const rows = new Map<string, { id: string }>();
    const transaction = {
      pipelineJob: {
        async upsert(args: {
          where: { idempotencyKey: string };
          create: { idempotencyKey: string };
        }) {
          const key = args.where.idempotencyKey;
          const existing = rows.get(key);
          if (existing) return existing;
          const created = { id: `job-${rows.size + 1}` };
          rows.set(args.create.idempotencyKey, created);
          return created;
        },
      },
    } as unknown as Prisma.TransactionClient;

    const input = {
      kind: JobKind.CLASSIFY_CASE,
      payload: {
        caseId: "1cf356cb-4e69-4a01-89ef-4f47141e717c",
        documentId: "24fc48dd-2fce-46bd-9b5b-87da6b635173",
      },
      idempotencyKey:
        "CLASSIFY_CASE:24fc48dd-2fce-46bd-9b5b-87da6b635173:classify.v1",
    };
    const first = await enqueueJob(transaction, input);
    const second = await enqueueJob(transaction, input);

    expect(first.id).toBe(second.id);
    expect(rows.size).toBe(1);
  });

  test("requeues retryable failures without failing the case", async () => {
    const jobUpdates: unknown[] = [];
    const caseUpdates: unknown[] = [];
    const database = {
      pipelineJob: {
        async update(args: unknown) {
          jobUpdates.push(args);
        },
      },
      case: {
        async update(args: unknown) {
          caseUpdates.push(args);
        },
      },
      document: {
        async findUnique() {
          return null;
        },
      },
      async $transaction<T>(work: (tx: unknown) => Promise<T>) {
        return work(this);
      },
    } as unknown as PrismaClient;

    await failClaimedJob(
      database,
      {
        id: "06726c14-f632-472d-a6ac-0d8a615efd54",
        kind: JobKind.CLASSIFY_CASE,
        payload: {
          caseId: "1cf356cb-4e69-4a01-89ef-4f47141e717c",
          documentId: "24fc48dd-2fce-46bd-9b5b-87da6b635173",
        },
        attempts: 1,
        maxAttempts: 3,
      },
      new Error("temporary"),
      { permanent: false, now: new Date("2026-06-12T12:00:00.000Z") },
    );

    expect(jobUpdates).toHaveLength(1);
    expect(jobUpdates[0]).toMatchObject({
      data: {
        status: JobStatus.QUEUED,
        completedAt: null,
        lockedAt: null,
        lockedBy: null,
      },
    });
    expect(caseUpdates).toHaveLength(0);
  });

  test("terminal failure atomically fails the related case", async () => {
    const events: Array<{ model: string; args: unknown }> = [];
    const database = {
      pipelineJob: {
        async update(args: unknown) {
          events.push({ model: "job", args });
        },
      },
      case: {
        async update(args: unknown) {
          events.push({ model: "case", args });
        },
      },
      document: {
        async findUnique() {
          return null;
        },
      },
      async $transaction<T>(work: (tx: unknown) => Promise<T>) {
        events.push({ model: "transaction", args: "begin" });
        return work(this);
      },
    } as unknown as PrismaClient;

    await failClaimedJob(
      database,
      {
        id: "06726c14-f632-472d-a6ac-0d8a615efd54",
        kind: JobKind.CLASSIFY_CASE,
        payload: {
          caseId: "1cf356cb-4e69-4a01-89ef-4f47141e717c",
          documentId: "24fc48dd-2fce-46bd-9b5b-87da6b635173",
        },
        attempts: 3,
        maxAttempts: 3,
      },
      new Error("classification failed"),
      { permanent: false, now: new Date("2026-06-12T12:00:00.000Z") },
    );

    expect(events.map((event) => event.model)).toEqual([
      "transaction",
      "job",
      "case",
    ]);
    expect(events[1]?.args).toMatchObject({
      data: {
        status: JobStatus.FAILED,
        lastError: "classification failed",
        lockedAt: null,
        lockedBy: null,
      },
    });
    expect(events[2]?.args).toMatchObject({
      where: { id: "1cf356cb-4e69-4a01-89ef-4f47141e717c" },
      data: {
        status: CaseStatus.FAILED,
        failureReason: "classification failed",
      },
    });
  });

  test("rolls back stage persistence when enqueue fails", async () => {
    const committed: string[] = [];
    const database = {
      async $transaction<T>(work: (tx: { writes: string[] }) => Promise<T>) {
        const pending: string[] = [];
        const result = await work({ writes: pending });
        committed.push(...pending);
        return result;
      },
    };

    await expect(
      runTransactionalStage(
        database,
        async (tx) => {
          tx.writes.push("artifact");
        },
        async () => {
          throw new Error("enqueue failed");
        },
      ),
    ).rejects.toThrow("enqueue failed");
    expect(committed).toEqual([]);
  });

  test("commits artifact before the ready transition", async () => {
    const events: string[] = [];
    const database = {
      async $transaction<T>(work: (tx: { events: string[] }) => Promise<T>) {
        return work({ events });
      },
    };
    await runTransactionalStage(
      database,
      async (tx) => {
        tx.events.push("artifact");
      },
      async (tx) => {
        tx.events.push("review");
      },
    );
    expect(events).toEqual(["artifact", "review"]);
  });
});

describe("lightweight report", () => {
  test("records explicit diagnosis and letter skips", () => {
    const report = buildLightweightReport({
      contractVersion: "classify.v1",
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
      rationales: [],
      counterSignals: [],
    });

    expect(report).toMatchObject({
      reportVersion: LIGHTWEIGHT_REPORT_VERSION,
      skipReason: "EXPLICIT_FEE_OPERATIONAL_NO_FUNDS_HELD",
      diagnosisState: "SKIPPED",
      letterState: "SKIPPED",
      sonnetCallAvoided: true,
    });
  });
});
