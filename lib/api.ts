/**
 * Shared envelope + helpers for the headless REST layer (/app/api/v1).
 * Every v1 response uses the same shape so the Swift and Kotlin clients can
 * decode with a single generic wrapper:
 *
 *   { "data": T | null, "error": { code, message } | null, "meta": {...} }
 */
import { NextResponse } from "next/server";

export const API_VERSION = "v1" as const;

export interface ApiError {
  code: string;
  message: string;
}

export interface ApiMeta {
  apiVersion: typeof API_VERSION;
  requestId: string;
  timestamp: string;
  /** Cursor pagination — present on list endpoints. */
  nextCursor?: string | null;
}

export interface ApiEnvelope<T> {
  data: T | null;
  error: ApiError | null;
  meta: ApiMeta;
}

function meta(extra?: Partial<ApiMeta>): ApiMeta {
  return {
    apiVersion: API_VERSION,
    requestId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ...extra,
  };
}

export function ok<T>(
  data: T,
  init?: { status?: number; nextCursor?: string | null },
): NextResponse<ApiEnvelope<T>> {
  return NextResponse.json(
    { data, error: null, meta: meta({ nextCursor: init?.nextCursor }) },
    { status: init?.status ?? 200 },
  );
}

export function fail(
  code: string,
  message: string,
  status: number,
): NextResponse<ApiEnvelope<never>> {
  return NextResponse.json(
    { data: null, error: { code, message }, meta: meta() },
    { status },
  );
}

/** Stub used while an endpoint is contract-only (mobile blueprint phase). */
export function notImplemented(endpoint: string): NextResponse<ApiEnvelope<never>> {
  return fail(
    "NOT_IMPLEMENTED",
    `${endpoint} is contract-defined but not yet wired to the data layer.`,
    501,
  );
}

/**
 * Fail-closed auth boundary. Org-token persistence, verification, revocation,
 * and tenant resolution are not implemented yet, so no bearer value is
 * trusted. Protected routes remain inaccessible until that full chain exists.
 */
export function requireBearer(req: Request): { ok: true } | { ok: false; res: NextResponse } {
  const auth = req.headers.get("authorization");
  const message = auth
    ? "Bearer token verification is not available."
    : "Missing bearer token.";
  return {
    ok: false,
    res: fail("UNAUTHORIZED", message, 401),
  };
}
