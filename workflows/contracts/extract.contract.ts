/**
 * BankGuard AI — Pipeline Stage 1: Document Extraction Contract
 * Contract version: extract.v1
 * Model tier: claude-haiku-4-5 (vision, temperature 0)
 *
 * Input:  termination letter / restriction notice / bank email as PDF or image,
 *         passed directly to Claude vision. No OCR preprocessing.
 * Output: ExtractionV1 JSON, validated with Zod before persisting to
 *         Document.extraction. Validation failure => retry once with repair
 *         prompt, then mark Document.extractionError and fail the job.
 *
 * Invariants:
 *  - Extraction is COPY-ONLY. The model transcribes and structures what is in
 *    the document. It must not infer triggers, must not editorialize, must not
 *    speculate about SARs or investigations. Inference belongs to Stage 2/3.
 *  - Unknown => null, never guessed. Downstream treats null as "not stated".
 *  - keyPhrases are VERBATIM quotes from the document (these drive Stage 2
 *    phrase->trigger mapping; paraphrasing destroys signal).
 */

import { z } from "zod";
import { IsoCurrencyCodeSchema } from "@/lib/iso";
import { parseJsonContract } from "./runner";

// ─── Output schema ───────────────────────────────────────────────────────────

export const EXTRACTION_VERSION = "extract.v1" as const;
export const EXTRACTION_MODEL = "claude-haiku-4-5-20251001" as const;

export const PhraseCategory = z.enum([
  "RISK_GENERIC",        // "no longer aligns with our risk appetite"
  "TOS_CONTRACTUAL",     // "in accordance with section X of the deposit agreement"
  "SUSPICIOUS_ACTIVITY", // "unusual activity", "suspicious activity"
  "SOURCE_OF_FUNDS",     // "concerns about the source of funds"
  "GEO_RESTRICTION",     // "restricted country", "unsupported geography"
  "SANCTIONS",           // "economic sanctions", "OFAC"
  "KYC_DOCUMENTATION",   // "unable to verify", "information not provided"
  "FRAUD_CHARGEBACK",    // "excessive chargebacks", "fraudulent transactions"
  "FUNDS_DISPOSITION",   // "funds will be retained", "check will be mailed"
  "FINALITY",            // "this decision is final"
  "POLICY_UPDATE",       // "due to a recent policy update"
  "OTHER",
]);
export type PhraseCategoryT = z.infer<typeof PhraseCategory>;

export const ExtractionV1Schema = z.object({
  contractVersion: z.literal(EXTRACTION_VERSION),

  documentKind: z.enum([
    "TERMINATION_LETTER",
    "RESTRICTION_NOTICE",
    "BANK_EMAIL",
    "PORTAL_SCREENSHOT",
    "SUPPORTING_DOC",
    "OTHER",
  ]),

  // Sender identification
  bankName: z.string().nullable(),          // as printed, e.g. "Mercury Technologies, Inc."
  bankSlugGuess: z.string().nullable(),     // normalized: "mercury" | "payoneer" | ... | null
  senderDepartment: z.string().nullable(),  // "Compliance Team", "Risk Operations"
  senderContact: z.string().nullable(),     // email/phone/portal ref if present

  // Recipient / entity as addressed
  addresseeName: z.string().nullable(),     // person or entity the letter addresses
  entityName: z.string().nullable(),        // business entity named in letter
  accountRefMasked: z.string().nullable(),  // "account ending 4821" — keep masked form only

  // Timeline (ISO 8601 date strings; null if absent)
  letterDate: z.string().nullable(),
  closureEffectiveDate: z.string().nullable(),
  noticeDays: z.number().int().nullable(),  // computed ONLY if both dates explicit
  responseDeadline: z.string().nullable(),  // deadline to submit docs / withdraw funds

  // Cited contract/legal anchors — verbatim references
  citedClauses: z.array(
    z.object({
      reference: z.string(),                // "Section 11(b) of the Deposit Agreement"
      verbatimContext: z.string(),          // the sentence containing the citation
    }),
  ),

  // Verbatim phrase capture — the core signal for Stage 2
  keyPhrases: z.array(
    z.object({
      phrase: z.string(),                   // exact quote, <= 40 words
      category: PhraseCategory,
      location: z.string().nullable(),      // "para 2", "subject line"
    }),
  ),

  // Funds disposition
  fundsHeld: z.boolean().nullable(),        // true = letter states funds retained/frozen
  fundsDisposition: z.string().nullable(),  // verbatim description of what happens to funds
  statedBalance: z
    .object({ amountCents: z.number().int(), currency: IsoCurrencyCodeSchema })
    .nullable(),

  // Recourse signals
  appealPathMentioned: z.boolean(),
  appealInstructions: z.string().nullable(), // verbatim if present
  reasonGiven: z.boolean(),                  // did the bank state ANY substantive reason?
  statedReasonVerbatim: z.string().nullable(),

  // Quality flags
  legibilityIssues: z.boolean(),            // unreadable regions encountered
  pagesMissingSuspected: z.boolean(),       // references to content not in the doc
  language: z.string().default("en"),
});

export type ExtractionV1 = z.infer<typeof ExtractionV1Schema>;

// ─── System prompt ───────────────────────────────────────────────────────────

export const EXTRACTION_SYSTEM_PROMPT = `You are a document extraction engine for bank account termination notices. You transcribe and structure ONLY what is literally present in the provided document.

HARD RULES
1. Copy, never infer. If a field is not explicitly stated in the document, output null. Do not deduce, estimate, or fill from general knowledge about banks.
2. keyPhrases must be VERBATIM quotes (max 40 words each). Capture every phrase that touches: risk, terms/agreement citations, suspicious or unusual activity, source of funds, geography or country restrictions, sanctions, verification/documentation requests, fraud or chargebacks, funds disposition, finality of decision, or policy updates. Prefer over-capture to under-capture.
3. Never speculate about WHY the account was closed. Do not mention SARs, investigations, AML, or regulatory triggers unless those exact words appear in the document — and if they do, capture them verbatim as keyPhrases.
4. noticeDays: compute only when both letterDate and closureEffectiveDate are explicitly printed. Otherwise null.
5. accountRefMasked: output only the masked form printed in the document (e.g. "ending in 4821"). Never reconstruct or expand account numbers.
6. statedBalance: only if a balance figure is printed in the document. Convert to integer cents.
7. reasonGiven is true only if the bank states a SUBSTANTIVE reason (e.g. "excessive chargebacks", "restricted country"). Generic phrases like "business decision" or "per our terms" => reasonGiven: false, but still capture them as keyPhrases.
8. Output ONLY a single JSON object conforming to the provided schema. No prose, no markdown fences, no commentary.

If the document is not a banking communication at all, set documentKind to "OTHER", fill what applies, and set all banking fields to null.`;

// ─── User message builder ────────────────────────────────────────────────────

export function buildExtractionUserMessage(opts: {
  filename: string;
  mimeType: string;
  base64Data: string;
}): Array<
  | { type: "text"; text: string }
  | { type: "document"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
> {
  const fileBlock =
    opts.mimeType === "application/pdf"
      ? ({
          type: "document",
          source: { type: "base64", media_type: opts.mimeType, data: opts.base64Data },
        } as const)
      : ({
          type: "image",
          source: { type: "base64", media_type: opts.mimeType, data: opts.base64Data },
        } as const);

  return [
    fileBlock,
    {
      type: "text",
      text: `Extract this document ("${opts.filename}") into a single JSON object matching this Zod schema:\n\n${schemaDescription()}\n\nReturn only the JSON object.`,
    },
  ];
}

function schemaDescription(): string {
  // Keep the inline schema description in lockstep with ExtractionV1Schema.
  // (Serialized by hand rather than zod-to-json-schema to keep the prompt tight.)
  return `{
  "contractVersion": "extract.v1",
  "documentKind": "TERMINATION_LETTER" | "RESTRICTION_NOTICE" | "BANK_EMAIL" | "PORTAL_SCREENSHOT" | "SUPPORTING_DOC" | "OTHER",
  "bankName": string | null,
  "bankSlugGuess": string | null,
  "senderDepartment": string | null,
  "senderContact": string | null,
  "addresseeName": string | null,
  "entityName": string | null,
  "accountRefMasked": string | null,
  "letterDate": "YYYY-MM-DD" | null,
  "closureEffectiveDate": "YYYY-MM-DD" | null,
  "noticeDays": number | null,
  "responseDeadline": "YYYY-MM-DD" | null,
  "citedClauses": [{ "reference": string, "verbatimContext": string }],
  "keyPhrases": [{ "phrase": string, "category": "RISK_GENERIC" | "TOS_CONTRACTUAL" | "SUSPICIOUS_ACTIVITY" | "SOURCE_OF_FUNDS" | "GEO_RESTRICTION" | "SANCTIONS" | "KYC_DOCUMENTATION" | "FRAUD_CHARGEBACK" | "FUNDS_DISPOSITION" | "FINALITY" | "POLICY_UPDATE" | "OTHER", "location": string | null }],
  "fundsHeld": boolean | null,
  "fundsDisposition": string | null,
  "statedBalance": { "amountCents": number, "currency": string } | null,
  "appealPathMentioned": boolean,
  "appealInstructions": string | null,
  "reasonGiven": boolean,
  "statedReasonVerbatim": string | null,
  "legibilityIssues": boolean,
  "pagesMissingSuspected": boolean,
  "language": string
}`;
}

// ─── Validation + repair loop ────────────────────────────────────────────────

export type ExtractionResult =
  | { ok: true; extraction: ExtractionV1 }
  | { ok: false; error: string; raw: string };

export function parseExtraction(rawModelOutput: string): ExtractionResult {
  const result = parseJsonContract(rawModelOutput, ExtractionV1Schema);
  return result.ok
    ? { ok: true, extraction: result.data }
    : { ok: false, error: result.error, raw: result.invalidOutput };
}
