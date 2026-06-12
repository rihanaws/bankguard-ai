import { describe, expect, test } from "bun:test";
import { RiskAssessmentInput } from "@/lib/api-schemas";
import { IsoCurrencyCodeSchema } from "@/lib/iso";
import {
  computeBankCompatibility,
  computeBankability,
} from "@/lib/scoring/bankability";
import { BANK_APPETITE_SEED } from "@/lib/scoring/bank-profiles.seed";

function parse(ownerResidencyIso: string) {
  return RiskAssessmentInput.parse({
    entityType: "C_CORP",
    entityState: "de",
    ownerResidencyIso,
    mcc: "7372",
    corridors: ["us", "bd"],
    monthlyVolumeCents: 100_000,
    addressKind: "US_VIRTUAL",
  });
}

describe("ISO normalization", () => {
  test("normalizes country, corridor, and state fields before scoring", () => {
    const input = parse("bd");
    expect(input.ownerResidencyIso).toBe("BD");
    expect(input.entityState).toBe("DE");
    expect(input.corridors).toEqual(["US", "BD"]);
  });

  test("lowercase and uppercase inputs produce identical scores and blocks", () => {
    const lower = parse("bd");
    const upper = parse("BD");
    const lowerScore = computeBankability(lower);
    const upperScore = computeBankability(upper);

    expect(lower).toEqual(upper);
    expect(lowerScore).toEqual(upperScore);
    expect(
      computeBankCompatibility(lower, lowerScore, BANK_APPETITE_SEED),
    ).toEqual(computeBankCompatibility(upper, upperScore, BANK_APPETITE_SEED));

    const rho = computeBankCompatibility(lower, lowerScore, BANK_APPETITE_SEED)
      .find((row) => row.bankSlug === "rho");
    expect(rho?.blockingFactors).toContain("restricted_geo:BD");
  });

  test("rejects unsupported country and currency codes", async () => {
    expect(() => parse("ZZ")).toThrow();

    const { ExtractionV1Schema } = await import(
      "@/workflows/contracts/extract.contract"
    );
    const base = {
      contractVersion: "extract.v1",
      documentKind: "TERMINATION_LETTER",
      bankName: null,
      bankSlugGuess: null,
      senderDepartment: null,
      senderContact: null,
      addresseeName: null,
      entityName: null,
      accountRefMasked: null,
      letterDate: null,
      closureEffectiveDate: null,
      noticeDays: null,
      responseDeadline: null,
      citedClauses: [],
      keyPhrases: [],
      fundsHeld: null,
      fundsDisposition: null,
      statedBalance: { amountCents: 100, currency: "zzz" },
      appealPathMentioned: false,
      appealInstructions: null,
      reasonGiven: false,
      statedReasonVerbatim: null,
      legibilityIssues: false,
      pagesMissingSuspected: false,
      language: "en",
    };
    expect(ExtractionV1Schema.safeParse(base).success).toBe(false);
  });

  test("uses the current 2026 ISO-4217 active-code set", () => {
    expect(IsoCurrencyCodeSchema.parse("xcg")).toBe("XCG");
    expect(IsoCurrencyCodeSchema.parse("xad")).toBe("XAD");
    expect(IsoCurrencyCodeSchema.safeParse("BGN").success).toBe(false);
    expect(IsoCurrencyCodeSchema.safeParse("ANG").success).toBe(false);
  });
});
