import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { runJsonContract } from "@/workflows/contracts/runner";
import {
  CLASSIFY_VERSION,
  ClassificationV1Schema,
  type ClassificationV1,
} from "@/workflows/contracts/classify.contract";

const VALID_PROBABILITIES: ClassificationV1["probabilities"] = {
  AML_SAR: 0.1,
  SANCTIONS_GEO: 0.1,
  KYC_FAILURE: 0.3,
  FRAUD_CHARGEBACK: 0.1,
  FEE_OPERATIONAL: 0.1,
  DERISKING_CATEGORY: 0.1,
  POLICY_UPDATE: 0.1,
  UNKNOWN: 0.1,
};

function classification(
  probabilities: Record<string, number> = VALID_PROBABILITIES,
  topTrigger = "KYC_FAILURE",
) {
  return {
    contractVersion: CLASSIFY_VERSION,
    probabilities,
    topTrigger,
    confidenceBand: "LOW",
    rationales: [],
    counterSignals: [],
  };
}

describe("runJsonContract", () => {
  test("passes original input, invalid output, and issues to one repair call", async () => {
    const repairCalls: unknown[] = [];
    const result = await runJsonContract({
      contractName: "sample.v1",
      originalInput: { source: "original" },
      schema: z.object({ value: z.string() }),
      invokeInitial: async () => '{"value":1}',
      invokeRepair: async (context) => {
        repairCalls.push(context);
        return '```json\n{"value":"fixed"}\n```';
      },
    });

    expect(result).toEqual({ ok: true, data: { value: "fixed" }, repaired: true });
    expect(repairCalls).toHaveLength(1);
    expect(repairCalls[0]).toMatchObject({
      originalInput: { source: "original" },
      invalidOutput: '{"value":1}',
    });
    expect(
      (repairCalls[0] as { validationIssues: string[] }).validationIssues[0],
    ).toContain("value");
  });

  test("rejects a repaired response that still fails validation", async () => {
    const result = await runJsonContract({
      contractName: "sample.v1",
      originalInput: { source: "original" },
      schema: z.object({ value: z.string() }),
      invokeInitial: async () => '{"value":1}',
      invokeRepair: async () => '{"value":2}',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("failed after repair");
      expect(result.invalidOutput).toBe('{"value":2}');
    }
  });
});

describe("ClassificationV1Schema", () => {
  test("accepts a complete probability map", () => {
    expect(ClassificationV1Schema.safeParse(classification()).success).toBe(true);
  });

  test("rejects a missing trigger", () => {
    const probabilities = { ...VALID_PROBABILITIES };
    delete (probabilities as Partial<typeof probabilities>).AML_SAR;
    expect(
      ClassificationV1Schema.safeParse(classification(probabilities)).success,
    ).toBe(false);
  });

  test("rejects an extra trigger", () => {
    expect(
      ClassificationV1Schema.safeParse(
        classification({ ...VALID_PROBABILITIES, EXTRA: 0 }),
      ).success,
    ).toBe(false);
  });

  test("rejects the partial UNKNOWN-only map", () => {
    expect(
      ClassificationV1Schema.safeParse(classification({ UNKNOWN: 1 }, "UNKNOWN"))
        .success,
    ).toBe(false);
  });

  test("rejects probability mass below tolerance", () => {
    expect(
      ClassificationV1Schema.safeParse(
        classification({ ...VALID_PROBABILITIES, KYC_FAILURE: 0.2 }),
      ).success,
    ).toBe(false);
  });

  test("rejects probability mass above tolerance", () => {
    expect(
      ClassificationV1Schema.safeParse(
        classification({ ...VALID_PROBABILITIES, KYC_FAILURE: 0.4 }),
      ).success,
    ).toBe(false);
  });

  test("accepts topTrigger when it is tied for the maximum", () => {
    const probabilities = {
      ...VALID_PROBABILITIES,
      KYC_FAILURE: 0.2,
      UNKNOWN: 0.2,
    };
    expect(
      ClassificationV1Schema.safeParse(
        classification(probabilities, "UNKNOWN"),
      ).success,
    ).toBe(true);
  });

  test("rejects topTrigger outside the maximum set", () => {
    expect(
      ClassificationV1Schema.safeParse(classification(VALID_PROBABILITIES, "UNKNOWN"))
        .success,
    ).toBe(false);
  });
});
