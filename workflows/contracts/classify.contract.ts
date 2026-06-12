/**
 * BankGuard AI — Pipeline Stage 2: Closure Trigger Classification Contract
 * Contract version: classify.v1
 * Model tier: claude-haiku-4-5 (text, temperature 0)
 *
 * Input:  ExtractionV1 (Stage 1 output) + case business-context snapshot.
 * Output: probability distribution over ClosureTrigger taxonomy + rationale
 *         per non-trivial label. Persisted to Diagnosis.triggerProbabilities.
 *
 * Design notes:
 *  - This stage replaces a supervised classifier until CommunityCase reaches
 *    ~200 verified labels. The few-shot matrix below IS the model — version it.
 *  - Stage 2 sees structured features only, never the raw document. Keeps the
 *    interface identical to a future sklearn/transformer classifier swap.
 *  - Probabilities must sum to 1.0 (±0.02 tolerance enforced in validation).
 */

import { z } from "zod";
import type { ExtractionV1 } from "./extract.contract";
import { parseJsonContract } from "./runner";

export const CLASSIFY_VERSION = "classify.v1" as const;
export const CLASSIFY_MODEL = "claude-haiku-4-5-20251001" as const;

// ─── Types ───────────────────────────────────────────────────────────────────

export const ClosureTriggerEnum = z.enum([
  "AML_SAR",
  "SANCTIONS_GEO",
  "KYC_FAILURE",
  "FRAUD_CHARGEBACK",
  "FEE_OPERATIONAL",
  "DERISKING_CATEGORY",
  "POLICY_UPDATE",
  "UNKNOWN",
]);
export type ClosureTriggerT = z.infer<typeof ClosureTriggerEnum>;

const TriggerProbabilitiesSchema = z
  .object({
    AML_SAR: z.number().min(0).max(1),
    SANCTIONS_GEO: z.number().min(0).max(1),
    KYC_FAILURE: z.number().min(0).max(1),
    FRAUD_CHARGEBACK: z.number().min(0).max(1),
    FEE_OPERATIONAL: z.number().min(0).max(1),
    DERISKING_CATEGORY: z.number().min(0).max(1),
    POLICY_UPDATE: z.number().min(0).max(1),
    UNKNOWN: z.number().min(0).max(1),
  })
  .strict();

export interface CaseContextSnapshot {
  entityType: string | null;        // "C_CORP", "LLC_SINGLE_MEMBER"
  entityState: string | null;       // "DE", "FL"
  ownerResidencyIso: string | null; // "BD"
  mccCode: string | null;           // "7372"
  accountAgeMonths: number | null;
  recentActivitySummary: string | null; // user-provided: "dormant 5mo, then $45k EU wire in"
  priorClosuresCount: number | null;    // other accounts closed before this one
}

export const ClassificationV1Schema = z
  .object({
    contractVersion: z.literal(CLASSIFY_VERSION),
    probabilities: TriggerProbabilitiesSchema,
    topTrigger: ClosureTriggerEnum,
    // Calibrated confidence band, NOT max probability. LOW when evidence is
    // generic boilerplate only; HIGH only with explicit categorical language.
    confidenceBand: z.enum(["LOW", "MEDIUM", "HIGH"]),
    rationales: z.array(
      z.object({
        trigger: ClosureTriggerEnum,
        evidence: z.array(z.string()), // references to keyPhrases / context fields
        reasoning: z.string(),         // <= 60 words
      }),
    ),
    // Signals that contradict the top hypothesis — surfaced in the report
    counterSignals: z.array(z.string()),
  })
  .superRefine((val, ctx) => {
    const sum = Object.values(val.probabilities).reduce<number>(
      (a, b) => a + (b ?? 0),
      0,
    );
    if (Math.abs(sum - 1) > 0.02) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `probabilities sum to ${sum.toFixed(3)}, expected 1.0 ±0.02`,
      });
    }
    const maxProbability = Math.max(...Object.values(val.probabilities));
    if (val.probabilities[val.topTrigger] !== maxProbability) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["topTrigger"],
        message: `topTrigger "${val.topTrigger}" is not tied for the maximum probability (${maxProbability})`,
      });
    }
  });

export type ClassificationV1 = z.infer<typeof ClassificationV1Schema>;

// ─── System prompt (the phrase→trigger matrix lives here — versioned) ────────

export const CLASSIFY_SYSTEM_PROMPT = `You are a closure-trigger classifier for US business bank account terminations. Given structured features extracted from a termination notice plus business context, output a probability distribution over the trigger taxonomy.

TAXONOMY
- AML_SAR: exit driven by transaction-monitoring alerts / suspicious-activity review (SAR-adjacent). Banks legally cannot say this; it hides behind generic language.
- SANCTIONS_GEO: OFAC exposure, restricted-country residency/address, corridor de-risking with explicit geographic language.
- KYC_FAILURE: identity/beneficial-ownership verification failure, documentation not provided or judged insufficient (CIP / PATRIOT Act 326).
- FRAUD_CHARGEBACK: fraud signals, account compromise, excessive chargebacks, card-network/monitoring-program violations (MATCH-adjacent).
- FEE_OPERATIONAL: negative balance, unpaid fees, inactivity/dormancy housekeeping closure. Mundane, non-compliance.
- DERISKING_CATEGORY: portfolio-level category exit (whole sector/segment purge), not specific to this customer's behavior.
- POLICY_UPDATE: explicit "policy update" closures — typically geographic or product-line de-risking announced as policy change.
- UNKNOWN: evidence insufficient to separate hypotheses.

PHRASE→TRIGGER PRIORS (calibration matrix)
- "in accordance with the terms/deposit agreement" + no reason + funds NOT held → diffuse: AML_SAR 0.30, DERISKING_CATEGORY 0.25, UNKNOWN 0.25, rest distributed.
- "suspicious activity" / "unusual activity" / "source of funds" / "no apparent lawful purpose" → AML_SAR dominant (0.55–0.75).
- "structuring" / "cash structuring" → AML_SAR near-certain (≥0.85).
- "restricted country" / "unsupported geography" / "sanctions" / explicit residency language → SANCTIONS_GEO or POLICY_UPDATE dominant; POLICY_UPDATE if framed as a policy change affecting a category, SANCTIONS_GEO if framed as compliance with sanctions law.
- "unable to verify" / "information requested was not provided" / "could not complete our review/due diligence" → KYC_FAILURE dominant (0.6–0.8).
- "excessive chargebacks" / "card network rules" / "fraudulent transactions" / "compromise" → FRAUD_CHARGEBACK dominant.
- "negative balance" / "fees" / dormancy with small balance and no held funds → FEE_OPERATIONAL dominant.
- FUNDS HELD/FROZEN (not just "withdraw by date") is a strong AML_SAR amplifier: shift +0.15–0.25 toward AML_SAR, because retention beyond the notice period correlates with active review or law-enforcement hold.

CONTEXT MODIFIERS
- ownerResidencyIso in higher-AML-risk corridors (e.g. BD, NG, PK, UA) + generic letter → amplify SANCTIONS_GEO/DERISKING_CATEGORY moderately; do NOT let residency alone overwhelm explicit phrase evidence.
- Dormancy followed by a large incoming wire in recentActivitySummary → amplify AML_SAR (dormancy-to-velocity typology).
- High-risk MCC (6051, 7995, 5967, 5968, 6211) → amplify DERISKING_CATEGORY and FRAUD_CHARGEBACK.
- priorClosuresCount ≥ 1 at other institutions → note possible 314(b) contagion in counterSignals/rationales; this raises AML_SAR but is circumstantial.
- noticeDays ≤ 5 or immediate restriction → amplify AML_SAR / FRAUD_CHARGEBACK (urgent exits); 30-day notices skew DERISKING_CATEGORY / POLICY_UPDATE / FEE_OPERATIONAL.

HARD RULES
1. Never assert that a SAR was filed, that an investigation exists, or that the customer did anything wrong. You estimate probabilities over the bank's likely internal trigger category — nothing more.
2. confidenceBand = HIGH only when explicit categorical language exists (rule rows 2–7 above). Generic boilerplate alone caps at LOW even if priors are sharp.
3. Every probability ≥ 0.10 requires a rationale entry citing specific evidence (keyPhrase text or context fields).
4. Record contradicting evidence in counterSignals (e.g. "30-day notice is atypical for fraud exits").
5. Output a single JSON object only. No prose, no markdown fences.`;

// ─── User message builder ────────────────────────────────────────────────────

export function buildClassifyUserMessage(
  extraction: ExtractionV1,
  context: CaseContextSnapshot,
): string {
  return [
    "EXTRACTED FEATURES (Stage 1 output):",
    JSON.stringify(extraction, null, 2),
    "",
    "BUSINESS CONTEXT:",
    JSON.stringify(context, null, 2),
    "",
    `Classify per the taxonomy. Output JSON: { "contractVersion": "classify.v1", "probabilities": { <all 8 triggers, each 0–1, summing to 1.0> }, "topTrigger": <argmax>, "confidenceBand": "LOW"|"MEDIUM"|"HIGH", "rationales": [{ "trigger", "evidence": [..], "reasoning" }], "counterSignals": [..] }`,
  ].join("\n");
}

// ─── Validation ──────────────────────────────────────────────────────────────

export type ClassificationResult =
  | { ok: true; classification: ClassificationV1 }
  | { ok: false; error: string; raw: string };

export function parseClassification(rawModelOutput: string): ClassificationResult {
  const result = parseJsonContract(rawModelOutput, ClassificationV1Schema);
  return result.ok
    ? { ok: true, classification: result.data }
    : { ok: false, error: result.error, raw: result.invalidOutput };
}
