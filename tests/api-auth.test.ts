import { describe, expect, test } from "bun:test";
import { requireBearer } from "@/lib/api";

describe("requireBearer", () => {
  test("fails closed for a missing bearer token", async () => {
    const result = requireBearer(new Request("https://bankguard.test/api/v1/cases"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.res.status).toBe(401);
      expect(await result.res.json()).toMatchObject({
        data: null,
        error: { code: "UNAUTHORIZED" },
      });
    }
  });

  test("fails closed for an arbitrary bearer token", async () => {
    const result = requireBearer(
      new Request("https://bankguard.test/api/v1/cases", {
        headers: { authorization: "Bearer arbitrary-value" },
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.res.status).toBe(401);
      expect(await result.res.json()).toMatchObject({
        data: null,
        error: { code: "UNAUTHORIZED" },
      });
    }
  });
});
