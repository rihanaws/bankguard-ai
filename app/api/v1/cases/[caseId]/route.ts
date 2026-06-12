import { notImplemented, requireBearer } from "@/lib/api";

/**
 * /api/v1/cases/:caseId — single case resource.
 * GET   — full case detail: status, context snapshot, document summaries,
 *         latest diagnosis verdict (topTrigger + confidenceBand), letters list.
 * PATCH — update outcome/outcomeNotes/corpusOptIn (mobile follow-up flows).
 */

type Params = { params: Promise<{ caseId: string }> };

export async function GET(req: Request, { params }: Params) {
  const auth = requireBearer(req);
  if (!auth.ok) return auth.res;
  const { caseId } = await params;
  return notImplemented(`GET /api/v1/cases/${caseId}`);
}

export async function PATCH(req: Request, { params }: Params) {
  const auth = requireBearer(req);
  if (!auth.ok) return auth.res;
  const { caseId } = await params;
  return notImplemented(`PATCH /api/v1/cases/${caseId}`);
}
