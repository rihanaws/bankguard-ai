/**
 * BankGuard AI — Pipeline Stage 3: Diagnosis & Appeals Contract
 * Contract version: diagnose.v1
 * Model tier: claude-sonnet-4-6 (deep reasoning + RAG synthesis, temperature 0)
 *
 * Input:  ExtractionV1 (Stage 1) + ClassificationV1 (Stage 2) + RAG chunk
 *         payloads retrieved from the KB (tier ALWAYS from KbDocument rows,
 *         never from model output).
 * Output: DiagnosisV1 JSON — synthesis report + appeal letter — validated with
 *         Zod before persisting to Diagnosis.report / GeneratedLetter.
 *
 * Invariants:
 *  - Conditional language only ("is consistent with", "indicates a probable
 *    trigger of"). Never assert a SAR was filed, never promise outcomes,
 *    never give legal advice.
 *  - Citations reference ONLY supplied chunk IDs. Tier B is cited exclusively
 *    as "observed pattern (n=X community reports)" — never as authority.
 *  - The compliance gate is CODE, not model self-report: runComplianceGate()
 *    scans the letter programmatically; the persisted flag is the AND of both.
 *  - Validation failure ⇒ SECTIONED repair (repair only the failing JSON
 *    paths via a cheap Haiku call) — never re-run the full Sonnet pass.
 */

import { z } from "zod";
import type { ExtractionV1 } from "./extract.contract";
import { ClosureTriggerEnum, type ClassificationV1 } from "./classify.contract";

export const DIAGNOSE_VERSION = "diagnose.v1" as const;
export const DIAGNOSE_MODEL = "claude-sonnet-4-6" as const;
export const REPAIR_MODEL = "claude-haiku-4-5-20251001" as const;

// ─── RAG input shape (tier originates in the DB) ─────────────────────────────

export const RagTier = z.enum(["TIER_A", "TIER_B"]);

export const RagChunkPayload = z.object({
  chunkId: z.string().uuid(),
  tier: RagTier,                       // from KbDocument.reliabilityTier — DB truth
  sectionRef: z.string().nullable(),   // "31 CFR 1020.320(e)", "ToS §11.2"
  title: z.string(),
  sourceUrl: z.string().nullable(),
  /** TIER_B only: community sample size backing the pattern. */
  n: z.number().int().positive().nullable(),
  content: z.string(),
});
export type RagChunkPayloadT = z.infer<typeof RagChunkPayload>;

// ─── Output schema ───────────────────────────────────────────────────────────

export const DiagnosisV1Schema = z
  .object({
    contractVersion: z.literal(DIAGNOSE_VERSION),

    /**
     * Comprehensive objective analysis: what the letter says (verbatim
     * anchors), what the probability distribution indicates, what the cited
     * regulatory material establishes, and what remains unknown.
     * Conditional language patterns throughout.
     */
    synthesisBreakdown: z.string().min(200),

    probableReasons: z.array(
      z.object({
        trigger: ClosureTriggerEnum,
        probability: z.number().min(0).max(1),
        narrative: z.string(),            // conditional-language explanation
        evidenceRefs: z.array(z.string()), // verbatim keyPhrases / context fields
      }),
    ).min(1),

    regulatoryBasis: z.array(
      z.object({
        chunkId: z.string().uuid(),       // must be one of the supplied chunks
        relevance: z.string(),            // why this section applies (<= 60 words)
      }),
    ),

    recommendedActions: z.array(
      z.object({
        action: z.string(),
        priority: z.enum(["IMMEDIATE", "SHORT_TERM", "STRATEGIC"]),
        rationale: z.string(),
      }),
    ).min(1),

    caveats: z.array(z.string()).min(1),  // explicit limits of the analysis

    /**
     * Model self-assessment of letter compliance. The persisted gate value is
     * this AND the programmatic runComplianceGate() result.
     */
    complianceGatePassed: z.boolean(),

    /**
     * Formal appeal letter, markdown. Must use the placeholder vocabulary
     * below — the renderer substitutes case data at export time:
     *   {{LETTER_DATE}} {{ENTITY_NAME}} {{ENTITY_TYPE}} {{BANK_NAME}}
     *   {{ACCOUNT_REF_MASKED}} {{CLOSURE_NOTICE_DATE}} {{CLOSURE_EFFECTIVE_DATE}}
     *   {{RESPONSE_DEADLINE}} {{SIGNATORY_NAME}} {{SIGNATORY_TITLE}}
     */
    generatedAppealLetter: z.string().min(200),
  })
  .superRefine((val, ctx) => {
    const probSum = val.probableReasons.reduce((a, r) => a + r.probability, 0);
    if (probSum > 1.05) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["probableReasons"],
        message: `probableReasons probabilities sum to ${probSum.toFixed(3)} (> 1.05)`,
      });
    }
  });

export type DiagnosisV1 = z.infer<typeof DiagnosisV1Schema>;

// ─── Programmatic compliance gate (code is truth, not the model) ─────────────

export interface ComplianceGateResult {
  passed: boolean;
  notes: string[];
}

const REQUIRED_PLACEHOLDERS = ["{{LETTER_DATE}}", "{{ENTITY_NAME}}", "{{BANK_NAME}}"];

/** Letter must never assert SAR existence/filing or an active investigation. */
const SAR_ASSERTION_PATTERNS: RegExp[] = [
  /\b(filed|submitted)\s+a\s+(SAR|suspicious activity report)\b/i,
  /\bSAR\s+(was|has been)\s+(filed|submitted)\b/i,
  /\byou\s+are\s+under\s+investigation\b/i,
  /\bthe bank\s+(filed|reported)\s+you\b/i,
];

const OUTCOME_PROMISE_PATTERNS: RegExp[] = [
  /\bguarantee[sd]?\s+(reinstatement|approval|release)\b/i,
  /\bwill\s+be\s+reinstated\b/i,
];

export function runComplianceGate(letterMarkdown: string): ComplianceGateResult {
  const notes: string[] = [];

  for (const pattern of SAR_ASSERTION_PATTERNS) {
    if (pattern.test(letterMarkdown)) {
      notes.push(`SAR-assertion language matched: ${pattern.source}`);
    }
  }
  for (const pattern of OUTCOME_PROMISE_PATTERNS) {
    if (pattern.test(letterMarkdown)) {
      notes.push(`Outcome-promise language matched: ${pattern.source}`);
    }
  }
  for (const placeholder of REQUIRED_PLACEHOLDERS) {
    if (!letterMarkdown.includes(placeholder)) {
      notes.push(`Missing required placeholder: ${placeholder}`);
    }
  }
  if (!/informational/i.test(letterMarkdown)) {
    notes.push(
      "Missing informational-not-legal-advice footer (must contain the word 'informational').",
    );
  }
  if (letterMarkdown.includes("!")) {
    notes.push("Exclamation mark present — forbidden in formal letters.");
  }

  return { passed: notes.length === 0, notes };
}

/** Citations must reference only chunks that were actually supplied. */
export function validateCitations(
  diagnosis: DiagnosisV1,
  suppliedChunks: RagChunkPayloadT[],
): ComplianceGateResult {
  const supplied = new Set(suppliedChunks.map((c) => c.chunkId));
  const notes = diagnosis.regulatoryBasis
    .filter((b) => !supplied.has(b.chunkId))
    .map((b) => `Cited chunkId not in supplied retrieval set: ${b.chunkId}`);
  return { passed: notes.length === 0, notes };
}

// ─── System prompt ───────────────────────────────────────────────────────────

export const DIAGNOSE_SYSTEM_PROMPT = `You are the Stage 3 diagnosis engine for BankGuard AI, synthesizing a forensic report on a US business bank account termination. You receive (a) structured extraction from the bank's notice, (b) a calibrated probability distribution over closure triggers, and (c) retrieved knowledge-base chunks.

VOICE & LEGAL CONSTRAINTS (the legal trinity — absolute)
1. Conditional language only: "is consistent with", "indicates a probable trigger of", "the observed pattern suggests". NEVER assert that a SAR was filed, that an investigation exists, or that the customer did anything wrong.
2. Never promise outcomes: no reinstatement guarantees, no "you will get your funds". Frame actions as "strengthen", "request", "document".
3. This is an informational diagnostic, not legal advice. Say so where appropriate. No exclamation marks anywhere.

CITATION RULES
4. Cite ONLY the supplied chunk IDs in regulatoryBasis. Never invent citations or cite from general knowledge.
5. TIER_A chunks may be cited as regulatory authority. TIER_B chunks must be framed exclusively as "observed pattern (n=X community reports)" using the supplied n — never as authority, never as "always happens".
6. Evidence ordering is quote-first: anchor every inference to a verbatim keyPhrase or context field before interpreting it.

REPORT REQUIREMENTS
7. synthesisBreakdown: objective, structured, top-down — verdict first (top trigger + what the evidence supports), then distribution reasoning, then regulatory context, then unknowns. Explain every term of art on first use.
8. probableReasons: one entry per trigger with probability >= 0.10, ordered descending. Narratives reference specific evidence.
9. recommendedActions: concrete and prioritized (IMMEDIATE / SHORT_TERM / STRATEGIC). Include funds-recovery steps when funds are held and regulator-complaint paths where applicable (CFPB accepts business deposit-account complaints; OCC for national banks).
10. caveats: state what the analysis cannot establish (banks are legally constrained from explaining SAR-adjacent exits; absence of evidence is not evidence of absence).

APPEAL LETTER REQUIREMENTS
11. generatedAppealLetter: formal markdown business letter requesting account review and/or documentation clarification. Very high formality, low energy, firm but non-adversarial. Use ONLY these placeholders for case data: {{LETTER_DATE}}, {{ENTITY_NAME}}, {{ENTITY_TYPE}}, {{BANK_NAME}}, {{ACCOUNT_REF_MASKED}}, {{CLOSURE_NOTICE_DATE}}, {{CLOSURE_EFFECTIVE_DATE}}, {{RESPONSE_DEADLINE}}, {{SIGNATORY_NAME}}, {{SIGNATORY_TITLE}}.
12. The letter must: reference the notice date and account; request the specific documentation or clarification the diagnosis indicates is most likely to be actionable (e.g. outstanding KYC items); request written confirmation of the funds-release timeline; close with an informational footer noting the letter was prepared with diagnostic software assistance and does not constitute legal advice.
13. complianceGatePassed: self-check the letter against rules 1–3 and 11–12 and report honestly. Your self-report is independently verified by code.

OUTPUT
14. Output a single JSON object conforming to the provided schema. No prose, no markdown fences outside JSON string values.`;

// ─── User message builder ────────────────────────────────────────────────────

export function buildDiagnoseUserMessage(
  extraction: ExtractionV1,
  classification: ClassificationV1,
  ragChunks: RagChunkPayloadT[],
): string {
  return [
    "STAGE 1 — EXTRACTED DOCUMENT FEATURES:",
    JSON.stringify(extraction, null, 2),
    "",
    "STAGE 2 — TRIGGER PROBABILITY DISTRIBUTION:",
    JSON.stringify(classification, null, 2),
    "",
    `RETRIEVED KNOWLEDGE-BASE CHUNKS (${ragChunks.length}):`,
    JSON.stringify(ragChunks, null, 2),
    "",
    `Produce the diagnose.v1 JSON object: { "contractVersion": "diagnose.v1", "synthesisBreakdown", "probableReasons": [{ "trigger", "probability", "narrative", "evidenceRefs" }], "regulatoryBasis": [{ "chunkId", "relevance" }], "recommendedActions": [{ "action", "priority", "rationale" }], "caveats": [..], "complianceGatePassed": boolean, "generatedAppealLetter": markdown string }`,
  ].join("\n");
}

// ─── Validation + sectioned repair ───────────────────────────────────────────

export type DiagnosisResult =
  | { ok: true; diagnosis: DiagnosisV1 }
  | { ok: false; error: string; failingPaths: string[]; raw: string };

export function parseDiagnosis(rawModelOutput: string): DiagnosisResult {
  const cleaned = rawModelOutput
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "");

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    return {
      ok: false,
      error: `JSON parse failed: ${(e as Error).message}`,
      failingPaths: [],
      raw: rawModelOutput,
    };
  }

  const result = DiagnosisV1Schema.safeParse(parsed);
  if (!result.success) {
    const failingPaths = [
      ...new Set(
        result.error.issues.map((i) => String(i.path[0] ?? "(root)")),
      ),
    ];
    return {
      ok: false,
      error: result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; "),
      failingPaths,
      raw: rawModelOutput,
    };
  }
  return { ok: true, diagnosis: result.data };
}

/**
 * Sectioned repair (masterplan §4.1.3): instead of re-running the expensive
 * Sonnet pass, send ONLY the failing top-level sections to Haiku for
 * structural repair, then splice the repaired sections back into the original
 * object and re-validate.
 */
export function buildSectionRepairMessage(
  raw: string,
  error: string,
  failingPaths: string[],
): string {
  return [
    "A diagnose.v1 JSON object failed schema validation.",
    `Failing top-level sections: ${failingPaths.join(", ") || "(root)"}`,
    `Validation errors: ${error}`,
    "",
    "ORIGINAL OBJECT:",
    raw,
    "",
    `Return a JSON object containing ONLY the corrected failing sections (keys: ${failingPaths.join(", ")}). Do not alter analytical content, verbatim phrases, or the letter's wording beyond what validation strictly requires. No prose, no fences.`,
  ].join("\n");
}

export function spliceRepairedSections(
  raw: string,
  repairedSectionsJson: string,
): string {
  const original = JSON.parse(
    raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, ""),
  ) as Record<string, unknown>;
  const repaired = JSON.parse(
    repairedSectionsJson.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, ""),
  ) as Record<string, unknown>;
  return JSON.stringify({ ...original, ...repaired });
}
