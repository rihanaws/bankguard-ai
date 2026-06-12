/**
 * Zod input schemas for /app/api/v1 route handlers.
 * Lives outside route files (Next.js route modules may only export HTTP
 * handlers/config) so the Swift/Kotlin client generators and the web app can
 * share one source of truth.
 */
import { z } from "zod";
import {
  IsoCountryCodeSchema,
  UsJurisdictionCodeSchema,
} from "@/lib/iso";

export const CreateCaseInput = z.object({
  title: z.string().min(1).max(200),
  entityName: z.string().max(200).nullable().optional(),
  entityType: z
    .enum(["LLC_SINGLE_MEMBER", "LLC_MULTI_MEMBER", "C_CORP", "S_CORP", "SOLE_PROP", "OTHER"])
    .nullable()
    .optional(),
  entityState: UsJurisdictionCodeSchema.nullable().optional(),
  ownerResidencyIso: IsoCountryCodeSchema.nullable().optional(),
  mccCode: z.string().max(4).nullable().optional(),
  bankSlug: z.string().max(64).nullable().optional(),
  corpusOptIn: z.boolean().default(false),
});
export type CreateCaseInputT = z.infer<typeof CreateCaseInput>;

export const GenerateLetterInput = z.object({
  kind: z.enum([
    "BANK_APPEAL",
    "FUNDS_RELEASE_DEMAND",
    "CFPB_COMPLAINT",
    "OCC_COMPLAINT",
    "STATE_REGULATOR_COMPLAINT",
  ]),
});
export type GenerateLetterInputT = z.infer<typeof GenerateLetterInput>;

export const RiskAssessmentInput = z.object({
  entityType: z.enum([
    "LLC_SINGLE_MEMBER",
    "LLC_MULTI_MEMBER",
    "C_CORP",
    "S_CORP",
    "SOLE_PROP",
    "OTHER",
  ]),
  entityState: UsJurisdictionCodeSchema,
  ownerResidencyIso: IsoCountryCodeSchema,
  mcc: z.string().min(3).max(4),
  corridors: z.array(IsoCountryCodeSchema).max(20).default([]),
  monthlyVolumeCents: z.number().int().nonnegative().nullable().optional(),
  addressKind: z
    .enum(["US_PHYSICAL", "US_VIRTUAL", "REGISTERED_AGENT", "FOREIGN"])
    .nullable()
    .optional(),
});
export type RiskAssessmentInputT = z.infer<typeof RiskAssessmentInput>;

/** Shared helper: format Zod issues for 422 envelopes. */
export function formatIssues(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
}
