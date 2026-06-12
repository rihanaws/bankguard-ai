/**
 * BankGuard AI — pipeline engine.
 * Orchestrates the Haiku 4.5 → Haiku 4.5 → Sonnet 4.6 handoff with Zod
 * validation, repair loops, the short-circuit cost gate, and the programmatic
 * compliance gate.
 *
 * The model caller is INJECTED (ModelInvoker) so the engine is unit-testable
 * with canned outputs (scripts/smoke-pipeline.ts) and worker entrypoints can
 * wire the real Anthropic client without touching orchestration logic.
 *
 * DB access (when wired in worker entrypoints) goes through the singleton:
 * `import { prisma } from "@/lib/prisma"` — never `new PrismaClient()`.
 */

import {
  EXTRACTION_MODEL,
  EXTRACTION_SYSTEM_PROMPT,
  buildExtractionUserMessage,
  ExtractionV1Schema,
  type ExtractionV1,
} from "./contracts/extract.contract";
import {
  CLASSIFY_MODEL,
  CLASSIFY_SYSTEM_PROMPT,
  buildClassifyUserMessage,
  ClassificationV1Schema,
  type CaseContextSnapshot,
  type ClassificationV1,
} from "./contracts/classify.contract";
import {
  DIAGNOSE_MODEL,
  DIAGNOSE_SYSTEM_PROMPT,
  REPAIR_MODEL,
  buildDiagnoseUserMessage,
  buildSectionRepairMessage,
  parseDiagnosis,
  runComplianceGate,
  spliceRepairedSections,
  validateCitations,
  type DiagnosisV1,
  type RagChunkPayloadT,
} from "./contracts/diagnose.contract";
import {
  buildContractRepairInstruction,
  runJsonContract,
} from "./contracts/runner";

// ─── Injected model caller ───────────────────────────────────────────────────

export interface ModelCall {
  model: string;
  system: string;
  /** Pre-serialized user content (string) or vision content blocks. */
  user: string | unknown[];
  /** Optional cap override; invokers apply stage-appropriate defaults. */
  maxTokens?: number;
}

export type ModelInvoker = (call: ModelCall) => Promise<string>;

// ─── Stage results ───────────────────────────────────────────────────────────

export type StageName = "EXTRACT" | "CLASSIFY" | "DIAGNOSE";

export interface PipelineFailure {
  ok: false;
  stage: StageName;
  error: string;
}

export interface PipelineSuccess {
  ok: true;
  shortCircuited: boolean;
  extraction: ExtractionV1;
  classification: ClassificationV1 | null;
  diagnosis: DiagnosisV1 | null;
  /** Programmatic gate result — the persisted complianceGatePassed value. */
  complianceGatePassed: boolean | null;
  complianceGateNotes: string[];
}

export type PipelineResult = PipelineSuccess | PipelineFailure;

// ─── Stage 1: extraction (validate → one repair attempt) ────────────────────

export async function runExtractionStage(
  invoke: ModelInvoker,
  doc: { filename: string; mimeType: string; base64Data: string },
): Promise<{ ok: true; extraction: ExtractionV1 } | { ok: false; error: string }> {
  const result = await runJsonContract({
    contractName: "extract.v1",
    originalInput: doc,
    schema: ExtractionV1Schema,
    invokeInitial: () =>
      invoke({
        model: EXTRACTION_MODEL,
        system: EXTRACTION_SYSTEM_PROMPT,
        user: buildExtractionUserMessage(doc),
      }),
    invokeRepair: (context) =>
      invoke({
        model: EXTRACTION_MODEL,
        system: EXTRACTION_SYSTEM_PROMPT,
        user: [
          ...buildExtractionUserMessage(doc),
          {
            type: "text",
            text: buildContractRepairInstruction("extract.v1", {
              ...context,
              originalInput: {
                filename: context.originalInput.filename,
                mimeType: context.originalInput.mimeType,
                base64Data:
                  "[original document reattached above as a media block]",
              },
            }),
          },
        ],
      }),
  });
  return result.ok
    ? { ok: true, extraction: result.data }
    : { ok: false, error: result.error };
}

// ─── Stage 2: classification ─────────────────────────────────────────────────

export async function runClassificationStage(
  invoke: ModelInvoker,
  extraction: ExtractionV1,
  context: CaseContextSnapshot,
): Promise<{ ok: true; classification: ClassificationV1 } | { ok: false; error: string }> {
  const originalInput = { extraction, context };
  const result = await runJsonContract({
    contractName: "classify.v1",
    originalInput,
    schema: ClassificationV1Schema,
    invokeInitial: () =>
      invoke({
        model: CLASSIFY_MODEL,
        system: CLASSIFY_SYSTEM_PROMPT,
        user: buildClassifyUserMessage(extraction, context),
      }),
    invokeRepair: (repairContext) =>
      invoke({
        model: CLASSIFY_MODEL,
        system: CLASSIFY_SYSTEM_PROMPT,
        user: [
          buildClassifyUserMessage(extraction, context),
          buildContractRepairInstruction("classify.v1", repairContext),
        ].join("\n\n"),
      }),
  });
  return result.ok
    ? { ok: true, classification: result.data }
    : { ok: false, error: result.error };
}

// ─── Short-circuit gate (masterplan §4.1.2) ──────────────────────────────────

/**
 * Mundane-case detector: explicit substantive reason + fee/operational trigger
 * + no funds held ⇒ skip the expensive Sonnet stage and emit a lightweight
 * report upstream. Saves the Sonnet call on ~15–20% of cases.
 */
export function shouldShortCircuit(
  extraction: ExtractionV1,
  classification: ClassificationV1,
): boolean {
  return (
    extraction.reasonGiven === true &&
    classification.topTrigger === "FEE_OPERATIONAL" &&
    extraction.fundsHeld !== true
  );
}

// ─── Stage 3: diagnosis (validate → sectioned Haiku repair) ─────────────────

export async function runDiagnosisStage(
  invoke: ModelInvoker,
  extraction: ExtractionV1,
  classification: ClassificationV1,
  ragChunks: RagChunkPayloadT[],
): Promise<{ ok: true; diagnosis: DiagnosisV1 } | { ok: false; error: string }> {
  const raw = await invoke({
    model: DIAGNOSE_MODEL,
    system: DIAGNOSE_SYSTEM_PROMPT,
    user: buildDiagnoseUserMessage(extraction, classification, ragChunks),
  });

  const first = parseDiagnosis(raw);
  if (first.ok) return { ok: true, diagnosis: first.diagnosis };

  // Sectioned repair: only the failing top-level keys go to Haiku, then are
  // spliced back — the Sonnet pass is never re-run for structural issues.
  const repairedSections = await invoke({
    model: REPAIR_MODEL,
    system:
      "You are a JSON structure repair engine. Fix only structural/typing issues. Never alter analytical content or verbatim quotes.",
    user: buildSectionRepairMessage(first.raw, first.error, first.failingPaths),
  });

  let spliced: string;
  try {
    spliced = spliceRepairedSections(first.raw, repairedSections);
  } catch (e) {
    return { ok: false, error: `diagnose.v1 splice failed: ${(e as Error).message}` };
  }

  const second = parseDiagnosis(spliced);
  if (second.ok) return { ok: true, diagnosis: second.diagnosis };

  return { ok: false, error: `diagnose.v1 failed after sectioned repair: ${second.error}` };
}

// ─── Full pipeline handoff ───────────────────────────────────────────────────

export async function runCasePipeline(deps: {
  invoke: ModelInvoker;
  document: { filename: string; mimeType: string; base64Data: string };
  context: CaseContextSnapshot;
  /** Retrieval is parallelizable upstream; the engine takes resolved chunks. */
  ragChunks: RagChunkPayloadT[];
}): Promise<PipelineResult> {
  const { invoke, document, context, ragChunks } = deps;

  const extracted = await runExtractionStage(invoke, document);
  if (!extracted.ok) return { ok: false, stage: "EXTRACT", error: extracted.error };

  const classified = await runClassificationStage(invoke, extracted.extraction, context);
  if (!classified.ok) return { ok: false, stage: "CLASSIFY", error: classified.error };

  if (shouldShortCircuit(extracted.extraction, classified.classification)) {
    return {
      ok: true,
      shortCircuited: true,
      extraction: extracted.extraction,
      classification: classified.classification,
      diagnosis: null,
      complianceGatePassed: null,
      complianceGateNotes: [
        "Short-circuit gate: stated fee/operational reason with no funds held — lightweight report path, Sonnet stage skipped.",
      ],
    };
  }

  const diagnosed = await runDiagnosisStage(
    invoke,
    extracted.extraction,
    classified.classification,
    ragChunks,
  );
  if (!diagnosed.ok) return { ok: false, stage: "DIAGNOSE", error: diagnosed.error };

  // Programmatic gates — code is truth; model self-report only narrows.
  const letterGate = runComplianceGate(diagnosed.diagnosis.generatedAppealLetter);
  const citationGate = validateCitations(diagnosed.diagnosis, ragChunks);
  const gatePassed =
    diagnosed.diagnosis.complianceGatePassed && letterGate.passed && citationGate.passed;

  return {
    ok: true,
    shortCircuited: false,
    extraction: extracted.extraction,
    classification: classified.classification,
    diagnosis: diagnosed.diagnosis,
    complianceGatePassed: gatePassed,
    complianceGateNotes: [...letterGate.notes, ...citationGate.notes],
  };
}
