import { ok } from "@/lib/api";

/** GET /api/v1/health — unauthenticated liveness probe for mobile clients. */
export async function GET() {
  return ok({ status: "ok", service: "bankguard-api" });
}
