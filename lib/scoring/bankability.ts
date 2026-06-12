/**
 * Bankability scoring engine — bankability.v1
 *
 * DETERMINISTIC BY CONTRACT: the LLM never computes scores. This module is
 * pure, reproducible math over an immutable input snapshot; the LLM only
 * narrates `factorBreakdown` afterward (RiskAssessment.explanation).
 * Bump SCORE_VERSION on ANY weight change — persisted scores must be
 * reproducible from (input, scoreVersion).
 */
import type { RiskAssessmentInputT } from "@/lib/api-schemas";

export const SCORE_VERSION = "bankability.v1" as const;

export interface ScoreFactor {
  factor: string;
  weight: number;     // max points this factor can contribute
  rawValue: string;   // the input value that drove the points
  points: number;     // awarded points (0..weight)
  rationale: string;  // conditional language, no assertions of wrongdoing
}

export interface BankabilityResult {
  scoreVersion: typeof SCORE_VERSION;
  aggregateScore: number; // 0–100, higher = more bankable
  factorBreakdown: ScoreFactor[];
}

// Corridor risk tiers (FATF-informed, curated for the alpha; review quarterly).
const HIGH_RISK_ISO = new Set(["BD", "NG", "PK", "UA", "VN", "EG", "MM", "IR", "RU", "BY"]);
const MEDIUM_RISK_ISO = new Set(["IN", "PH", "ID", "TR", "AE", "GH", "KE", "MA"]);

const HIGH_RISK_MCC = new Set(["6051", "7995", "5967", "5968", "6211"]);
const GREYLIST_MCC = new Set(["7372", "7392", "5734", "5817", "5818"]);

function residencyPoints(iso: string): { points: number; rationale: string } {
  if (iso === "US") {
    return { points: 30, rationale: "US residency carries no cross-border EDD load." };
  }
  if (HIGH_RISK_ISO.has(iso)) {
    return {
      points: 8,
      rationale: `Residency in ${iso} is consistent with enhanced due diligence at most US institutions; several neobanks restrict the corridor outright.`,
    };
  }
  if (MEDIUM_RISK_ISO.has(iso)) {
    return {
      points: 16,
      rationale: `Residency in ${iso} typically indicates standard NRA onboarding with moderate EDD friction.`,
    };
  }
  return { points: 24, rationale: `Residency in ${iso} is broadly supported for NRA onboarding.` };
}

export function computeBankability(input: RiskAssessmentInputT): BankabilityResult {
  const factors: ScoreFactor[] = [];

  // 1. Owner residency — weight 30
  const res = residencyPoints(input.ownerResidencyIso);
  factors.push({
    factor: "owner_residency",
    weight: 30,
    rawValue: input.ownerResidencyIso,
    points: res.points,
    rationale: res.rationale,
  });

  // 2. MCC — weight 20
  let mccPoints = 20;
  let mccRationale = `MCC ${input.mcc} is not on tracked block or greylists.`;
  if (HIGH_RISK_MCC.has(input.mcc)) {
    mccPoints = 2;
    mccRationale = `MCC ${input.mcc} is on the high-risk list (crypto/gambling/marketing/securities adjacent) — consistent with category de-risking at most institutions.`;
  } else if (GREYLIST_MCC.has(input.mcc)) {
    mccPoints = 12;
    mccRationale = `MCC ${input.mcc} is greylisted (software/services) — accepted at most institutions with EDD friction.`;
  }
  factors.push({
    factor: "mcc_category",
    weight: 20,
    rawValue: input.mcc,
    points: mccPoints,
    rationale: mccRationale,
  });

  // 3. Address kind — weight 15
  const addressPoints: Record<string, { points: number; rationale: string }> = {
    US_PHYSICAL: { points: 15, rationale: "Physical US operating address satisfies the strictest address policies." },
    US_VIRTUAL: { points: 8, rationale: "Virtual US addresses pass most neobank onboarding but are a known EDD trigger on review." },
    REGISTERED_AGENT: { points: 5, rationale: "Registered-agent-only addresses are flagged by several institutions as non-operating." },
    FOREIGN: { points: 3, rationale: "A foreign operating address restricts eligibility to NRA-friendly institutions." },
  };
  const addr = input.addressKind ? addressPoints[input.addressKind] : undefined;
  factors.push({
    factor: "address_kind",
    weight: 15,
    rawValue: input.addressKind ?? "UNSTATED",
    points: addr?.points ?? 6,
    rationale: addr?.rationale ?? "Address kind not stated — scored at the cautious midpoint.",
  });

  // 4. Entity type — weight 10
  const entityPoints: Record<RiskAssessmentInputT["entityType"], number> = {
    C_CORP: 10,
    LLC_MULTI_MEMBER: 8,
    S_CORP: 7,
    LLC_SINGLE_MEMBER: 6,
    SOLE_PROP: 4,
    OTHER: 5,
  };
  const sCorpNraConflict = input.entityType === "S_CORP" && input.ownerResidencyIso !== "US";
  factors.push({
    factor: "entity_type",
    weight: 10,
    rawValue: input.entityType,
    points: sCorpNraConflict ? 0 : entityPoints[input.entityType],
    rationale: sCorpNraConflict
      ? "S-Corp election with non-resident ownership is structurally inconsistent (NRA shareholders are ineligible) — expect verification failure."
      : "Entity form scored by typical KYB documentation depth and perceived permanence.",
  });

  // 5. Corridors — weight 15
  const highRiskCorridors = input.corridors.filter((c) => HIGH_RISK_ISO.has(c));
  const corridorPoints = Math.max(15 - highRiskCorridors.length * 5, 0);
  factors.push({
    factor: "payment_corridors",
    weight: 15,
    rawValue: input.corridors.join(",") || "(none declared)",
    points: input.corridors.length === 0 ? 12 : corridorPoints,
    rationale:
      highRiskCorridors.length > 0
        ? `Corridors ${highRiskCorridors.join(", ")} are consistent with elevated transaction-monitoring sensitivity.`
        : "Declared corridors carry no elevated monitoring priors.",
  });

  // 6. Entity state — weight 5
  const standardStates = new Set(["DE", "WY", "FL", "TX"]);
  factors.push({
    factor: "entity_state",
    weight: 5,
    rawValue: input.entityState,
    points: standardStates.has(input.entityState) ? 5 : 4,
    rationale: standardStates.has(input.entityState)
      ? "Formation state is a standard, well-understood jurisdiction."
      : "Less common formation state — negligible effect.",
  });

  // 7. Monthly volume — weight 5
  const vol = input.monthlyVolumeCents ?? null;
  let volPoints = 3;
  let volRationale = "Volume not stated — scored at the midpoint.";
  if (vol !== null) {
    if (vol <= 25_000_000_00) {
      volPoints = 5;
      volRationale = "Stated volume sits inside typical SMB monitoring thresholds.";
    } else {
      volPoints = 2;
      volRationale = "High stated volume indicates probable velocity-based EDD on onboarding.";
    }
  }
  factors.push({
    factor: "monthly_volume",
    weight: 5,
    rawValue: vol === null ? "UNSTATED" : `${vol} cents`,
    points: volPoints,
    rationale: volRationale,
  });

  const aggregateScore = factors.reduce((a, f) => a + f.points, 0);
  return { scoreVersion: SCORE_VERSION, aggregateScore, factorBreakdown: factors };
}

// ─── Per-bank compatibility ──────────────────────────────────────────────────

/** Appetite shape mirrors prisma BankProfile (subset the scorer needs). */
export interface BankAppetite {
  slug: string;
  name: string;
  kind: "CHARTERED_BANK" | "NEOBANK_BAAS" | "EMI_MSB" | "PSP";
  nraEligible: boolean;
  requiresUsAddress: boolean;
  requiresUsOperations: boolean;
  restrictedGeoIso: string[];
  mccBlocklist: string[];
  mccGreylist: string[];
}

export interface BankCompatibility {
  bankSlug: string;
  bankName: string;
  kind: BankAppetite["kind"];
  compatibilityScore: number; // 0–100
  blockingFactors: string[];  // hard nos — renders as risk-critical chips
  frictionFactors: string[];  // EDD-likely — renders as risk-elevated chips
  rank: number;
}

export function computeBankCompatibility(
  input: RiskAssessmentInputT,
  base: BankabilityResult,
  banks: BankAppetite[],
): BankCompatibility[] {
  const rows = banks.map((bank) => {
    const blocking: string[] = [];
    const friction: string[] = [];

    if (!bank.nraEligible && input.ownerResidencyIso !== "US") {
      blocking.push("nra_ineligible");
    }
    if (bank.restrictedGeoIso.includes(input.ownerResidencyIso)) {
      blocking.push(`restricted_geo:${input.ownerResidencyIso}`);
    }
    if (bank.mccBlocklist.includes(input.mcc)) {
      blocking.push(`mcc_blocklist:${input.mcc}`);
    }
    if (bank.mccGreylist.includes(input.mcc)) {
      friction.push(`mcc_greylist:${input.mcc}`);
    }
    if (bank.requiresUsAddress && input.addressKind !== "US_PHYSICAL") {
      friction.push("us_address_required");
    }
    if (bank.requiresUsOperations) {
      friction.push("us_operations_required");
    }
    for (const corridor of input.corridors) {
      if (bank.restrictedGeoIso.includes(corridor)) {
        friction.push(`restricted_corridor:${corridor}`);
      }
    }

    const compatibilityScore =
      blocking.length > 0
        ? Math.min(base.aggregateScore, 10)
        : Math.max(Math.min(base.aggregateScore - friction.length * 10, 100), 0);

    return {
      bankSlug: bank.slug,
      bankName: bank.name,
      kind: bank.kind,
      compatibilityScore,
      blockingFactors: blocking,
      frictionFactors: friction,
      rank: 0,
    };
  });

  rows.sort((a, b) => b.compatibilityScore - a.compatibilityScore);
  rows.forEach((row, i) => { row.rank = i + 1; });
  return rows;
}
