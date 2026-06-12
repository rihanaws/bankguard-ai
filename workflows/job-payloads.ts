import { z } from "zod";
import {
  JobKind,
  type JobKind as JobKindT,
} from "@/lib/generated/prisma/enums";
import { PermanentJobError } from "./workflow-errors";

export { PermanentJobError } from "./workflow-errors";

const Uuid = z.string().uuid();

const ExtractDocumentPayload = z
  .object({
    documentId: Uuid,
    caseId: Uuid.optional(),
  })
  .strict();

const ClassifyCasePayload = z
  .object({
    caseId: Uuid,
    documentId: Uuid,
  })
  .strict();

const DiagnoseCasePayload = z
  .object({
    caseId: Uuid,
    documentId: Uuid,
    diagnosisId: Uuid,
  })
  .strict();

const GenerateLetterPayload = z
  .object({
    caseId: Uuid,
    diagnosisId: Uuid,
    kind: z.enum([
      "BANK_APPEAL",
      "FUNDS_RELEASE_DEMAND",
      "CFPB_COMPLAINT",
      "OCC_COMPLAINT",
      "STATE_REGULATOR_COMPLAINT",
    ]),
  })
  .strict();

const KbCrawlPayload = z
  .object({
    sourceUrl: z.string().url(),
  })
  .strict();

const KbEmbedPayload = z
  .object({
    kbDocumentId: Uuid,
  })
  .strict();

const CommunityScrapePayload = z
  .object({
    sourceUrl: z.string().url(),
  })
  .strict();

const SanctionsScreenPayload = z
  .object({
    orgId: Uuid,
  })
  .strict();

export type ExtractDocumentJobPayload = z.infer<typeof ExtractDocumentPayload>;
export type ClassifyCaseJobPayload = z.infer<typeof ClassifyCasePayload>;
export type DiagnoseCaseJobPayload = z.infer<typeof DiagnoseCasePayload>;

export interface JobPayloadMap {
  [JobKind.EXTRACT_DOCUMENT]: ExtractDocumentJobPayload;
  [JobKind.CLASSIFY_CASE]: ClassifyCaseJobPayload;
  [JobKind.DIAGNOSE_CASE]: DiagnoseCaseJobPayload;
  [JobKind.GENERATE_LETTER]: z.infer<typeof GenerateLetterPayload>;
  [JobKind.KB_CRAWL]: z.infer<typeof KbCrawlPayload>;
  [JobKind.KB_EMBED]: z.infer<typeof KbEmbedPayload>;
  [JobKind.COMMUNITY_SCRAPE]: z.infer<typeof CommunityScrapePayload>;
  [JobKind.SANCTIONS_SCREEN]: z.infer<typeof SanctionsScreenPayload>;
}

export type ParsedJobPayload = JobPayloadMap[JobKindT];

const SCHEMAS = {
  [JobKind.EXTRACT_DOCUMENT]: ExtractDocumentPayload,
  [JobKind.CLASSIFY_CASE]: ClassifyCasePayload,
  [JobKind.DIAGNOSE_CASE]: DiagnoseCasePayload,
  [JobKind.GENERATE_LETTER]: GenerateLetterPayload,
  [JobKind.KB_CRAWL]: KbCrawlPayload,
  [JobKind.KB_EMBED]: KbEmbedPayload,
  [JobKind.COMMUNITY_SCRAPE]: CommunityScrapePayload,
  [JobKind.SANCTIONS_SCREEN]: SanctionsScreenPayload,
} satisfies Record<
  (typeof JobKind)[keyof typeof JobKind],
  z.ZodType<ParsedJobPayload>
>;

export function parseJobPayload<K extends JobKindT>(
  kind: K,
  payload: unknown,
): JobPayloadMap[K];
export function parseJobPayload(
  kind: JobKindT,
  payload: unknown,
): ParsedJobPayload {
  const result = SCHEMAS[kind].safeParse(payload);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new PermanentJobError(`Invalid ${kind} payload: ${issues}`);
  }
  return result.data;
}

export function resolveCaseReference(
  kind: (typeof JobKind)[keyof typeof JobKind],
  payload: unknown,
): string | null {
  if (
    kind !== JobKind.CLASSIFY_CASE &&
    kind !== JobKind.DIAGNOSE_CASE &&
    kind !== JobKind.GENERATE_LETTER
  ) {
    return null;
  }
  const caseId = z.object({ caseId: Uuid }).safeParse(payload);
  return caseId.success ? caseId.data.caseId : null;
}

export function resolveDocumentReference(payload: unknown): string | null {
  const documentId = z.object({ documentId: Uuid }).safeParse(payload);
  return documentId.success ? documentId.data.documentId : null;
}
