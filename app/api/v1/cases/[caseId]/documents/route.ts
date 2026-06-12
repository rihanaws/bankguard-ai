import { notImplemented, requireBearer } from "@/lib/api";

/**
 * /api/v1/cases/:caseId/documents — document subcollection.
 * GET  — list documents with extraction status (extractedAt / extractionError).
 * POST — register an upload: returns a short-lived signed PUT URL for object
 *        storage plus the created Document row; storage keys are never public.
 *        Upload completion enqueues PipelineJob(EXTRACT_DOCUMENT).
 */

type Params = { params: Promise<{ caseId: string }> };

export async function GET(req: Request, { params }: Params) {
  const auth = requireBearer(req);
  if (!auth.ok) return auth.res;
  const { caseId } = await params;
  return notImplemented(`GET /api/v1/cases/${caseId}/documents`);
}

export async function POST(req: Request, { params }: Params) {
  const auth = requireBearer(req);
  if (!auth.ok) return auth.res;
  const { caseId } = await params;
  return notImplemented(`POST /api/v1/cases/${caseId}/documents`);
}
