import { fail, notImplemented, ok, requireBearer } from "@/lib/api";
import { RiskAssessmentInput, formatIssues } from "@/lib/api-schemas";
import { computeBankCompatibility, computeBankability } from "@/lib/scoring/bankability";
import { BANK_APPETITE_SEED, BANK_SEED_DATA_AS_OF } from "@/lib/scoring/bank-profiles.seed";

/**
 * /api/v1/risk-assessments — proactive bankability engine.
 * GET  — assessment history for the org (DB-backed; pending persistence layer).
 * POST — deterministic bankability.v1 scoring over an immutable input
 *        snapshot. The LLM never computes the score; it only narrates the
 *        factorBreakdown afterward. Returns aggregateScore, factorBreakdown,
 *        and ranked per-bank compatibility (blocking/friction chips for the
 *        BankMatchRow surfaces). Persistence to RiskAssessment lands with auth.
 */

export async function GET(req: Request) {
  const auth = requireBearer(req);
  if (!auth.ok) return auth.res;
  return notImplemented("GET /api/v1/risk-assessments");
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
  const parsed = RiskAssessmentInput.safeParse(body);
  if (!parsed.success) {
    return fail("VALIDATION_FAILED", formatIssues(parsed.error), 422);
  }

  const result = computeBankability(parsed.data);
  const bankScores = computeBankCompatibility(parsed.data, result, BANK_APPETITE_SEED);

  return ok({
    input: parsed.data,
    scoreVersion: result.scoreVersion,
    aggregateScore: result.aggregateScore,
    factorBreakdown: result.factorBreakdown,
    bankScores,
    bankDataAsOf: BANK_SEED_DATA_AS_OF,
    note: "Informational diagnostic — appetite data is curated and dated; verify against current institution terms.",
  });
}
