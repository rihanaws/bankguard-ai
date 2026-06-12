import { z } from "zod";

export interface ContractRepairContext<TInput> {
  originalInput: TInput;
  invalidOutput: string;
  validationIssues: string[];
}

export type JsonContractResult<T> =
  | { ok: true; data: T; repaired: boolean }
  | {
      ok: false;
      error: string;
      invalidOutput: string;
      validationIssues: string[];
    };

function cleanJson(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "");
}

export function parseJsonContract<TSchema extends z.ZodTypeAny>(
  raw: string,
  schema: TSchema,
): JsonContractResult<z.output<TSchema>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleanJson(raw));
  } catch (error) {
    const message = `JSON parse failed: ${
      error instanceof Error ? error.message : String(error)
    }`;
    return {
      ok: false,
      error: message,
      invalidOutput: raw,
      validationIssues: [message],
    };
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    const validationIssues = result.error.issues.map(
      (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
    );
    return {
      ok: false,
      error: `Schema validation failed: ${validationIssues.join("; ")}`,
      invalidOutput: raw,
      validationIssues,
    };
  }

  return { ok: true, data: result.data, repaired: false };
}

export async function runJsonContract<
  TInput,
  TSchema extends z.ZodTypeAny,
>(options: {
  contractName: string;
  originalInput: TInput;
  schema: TSchema;
  invokeInitial: () => Promise<string>;
  invokeRepair: (
    context: ContractRepairContext<TInput>,
  ) => Promise<string>;
}): Promise<JsonContractResult<z.output<TSchema>>> {
  const initialOutput = await options.invokeInitial();
  const initial = parseJsonContract(initialOutput, options.schema);
  if (initial.ok) return initial;

  const repairedOutput = await options.invokeRepair({
    originalInput: options.originalInput,
    invalidOutput: initial.invalidOutput,
    validationIssues: initial.validationIssues,
  });
  const repaired = parseJsonContract(repairedOutput, options.schema);
  if (repaired.ok) {
    return { ...repaired, repaired: true };
  }

  return {
    ...repaired,
    error: `${options.contractName} failed after repair: ${repaired.error}`,
  };
}

export function buildContractRepairInstruction<TInput>(
  contractName: string,
  context: ContractRepairContext<TInput>,
): string {
  return [
    `The previous ${contractName} output failed validation.`,
    "",
    "ORIGINAL INPUT:",
    JSON.stringify(context.originalInput, null, 2),
    "",
    "INVALID MODEL OUTPUT:",
    context.invalidOutput,
    "",
    "VALIDATION ISSUES:",
    context.validationIssues.join("\n"),
    "",
    "Return the corrected JSON object only. Preserve the original meaning and all verbatim language. Fix only JSON, schema, or typing defects. Do not produce a fresh analysis. No prose or markdown fences.",
  ].join("\n");
}
