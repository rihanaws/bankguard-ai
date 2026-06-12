import { fail, notImplemented, requireBearer } from "@/lib/api";
import { CreateCaseInput, formatIssues } from "@/lib/api-schemas";

/**
 * /api/v1/cases — case collection.
 * GET  — list cases for the token's org (cursor-paginated: ?cursor=&limit=).
 * POST — create a case shell (status INTAKE) ahead of document upload.
 */

export async function GET(req: Request) {
  const auth = requireBearer(req);
  if (!auth.ok) return auth.res;
  return notImplemented("GET /api/v1/cases");
}

export async function POST(req: Request) {
  const auth = requireBearer(req);
  if (!auth.ok) return auth.res;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("BAD_JSON", "Request body must be valid JSON.", 400);
  }

  const parsed = CreateCaseInput.safeParse(body);
  if (!parsed.success) {
    return fail("VALIDATION_FAILED", formatIssues(parsed.error), 422);
  }

  return notImplemented("POST /api/v1/cases");
}
