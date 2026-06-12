import { notImplemented, requireBearer } from "@/lib/api";

/**
 * /api/v1/bank-profiles — curated bank appetite directory (read-only).
 * GET — list tracked institutions with NRA eligibility, sponsor charters,
 *       restricted geographies, and MCC block/greylists. Filters:
 *       ?nraEligible=true&kind=NEOBANK_BAAS. Powers the mobile "where can I
 *       bank" browse surface; appetiteNotes is included only for paid tiers.
 */

export async function GET(req: Request) {
  const auth = requireBearer(req);
  if (!auth.ok) return auth.res;
  return notImplemented("GET /api/v1/bank-profiles");
}
