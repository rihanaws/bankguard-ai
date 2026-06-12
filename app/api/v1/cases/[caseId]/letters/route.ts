import { fail, notImplemented, requireBearer } from "@/lib/api";
import { GenerateLetterInput, formatIssues } from "@/lib/api-schemas";

/**
 * /api/v1/cases/:caseId/letters — generated letter subcollection.
 * GET  — immutable letter versions. Body is withheld unless
 *        complianceGatePassed === true (the DB field is the export gate;
 *        clients never decide this).
 * POST — request generation of a letter kind: enqueues
 *        PipelineJob(GENERATE_LETTER); responds 202 with the job reference.
 */

type Params = { params: Promise<{ caseId: string }> };

export async function GET(req: Request, { params }: Params) {
  const auth = requireBearer(req);
  if (!auth.ok) return auth.res;
  const { caseId } = await params;
  return notImplemented(`GET /api/v1/cases/${caseId}/letters`);
}

export async function POST(req: Request, { params }: Params) {
  const auth = requireBearer(req);
  if (!auth.ok) return auth.res;
  const { caseId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("BAD_JSON", "Request body must be valid JSON.", 400);
  }
  const parsed = GenerateLetterInput.safeParse(body);
  if (!parsed.success) {
    return fail("VALIDATION_FAILED", formatIssues(parsed.error), 422);
  }

  return notImplemented(`POST /api/v1/cases/${caseId}/letters`);
}
