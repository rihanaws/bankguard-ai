import { notImplemented, requireBearer } from "@/lib/api";

/**
 * /api/v1/cases/:caseId/diagnoses — diagnosis subcollection (read-only).
 * GET — versioned diagnosis history. Each row carries triggerProbabilities,
 *       topTrigger, confidence band, the stage-3 report JSON, and citedChunkIds
 *       resolved into citation payloads (tier ALWAYS from KbDocument, never
 *       echoed from model output).
 * Diagnoses are produced by the pipeline (PipelineJob), never created via API.
 */

type Params = { params: Promise<{ caseId: string }> };

export async function GET(req: Request, { params }: Params) {
  const auth = requireBearer(req);
  if (!auth.ok) return auth.res;
  const { caseId } = await params;
  return notImplemented(`GET /api/v1/cases/${caseId}/diagnoses`);
}
