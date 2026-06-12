import { z } from "zod";
import {
  ClassificationV1Schema,
  type ClassificationV1,
} from "./contracts/classify.contract";

export const LIGHTWEIGHT_REPORT_VERSION = "lightweight-report.v1" as const;

export const LightweightReportV1Schema = z.object({
  reportVersion: z.literal(LIGHTWEIGHT_REPORT_VERSION),
  classification: ClassificationV1Schema,
  skipReason: z.literal("EXPLICIT_FEE_OPERATIONAL_NO_FUNDS_HELD"),
  diagnosisState: z.literal("SKIPPED"),
  letterState: z.literal("SKIPPED"),
  sonnetCallAvoided: z.literal(true),
});

export type LightweightReportV1 = z.infer<typeof LightweightReportV1Schema>;

export function buildLightweightReport(
  classification: ClassificationV1,
): LightweightReportV1 {
  return LightweightReportV1Schema.parse({
    reportVersion: LIGHTWEIGHT_REPORT_VERSION,
    classification,
    skipReason: "EXPLICIT_FEE_OPERATIONAL_NO_FUNDS_HELD",
    diagnosisState: "SKIPPED",
    letterState: "SKIPPED",
    sonnetCallAvoided: true,
  });
}
