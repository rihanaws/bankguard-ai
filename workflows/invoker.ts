/**
 * Production ModelInvoker — Anthropic Messages API via @anthropic-ai/sdk.
 * Reads ANTHROPIC_API_KEY from env (bun auto-loads .env). Temperature 0
 * across all pipeline stages (deterministic contracts).
 */
import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import type { ModelCall, ModelInvoker } from "./engine";

const DEFAULT_MAX_TOKENS: Record<string, number> = {
  "claude-haiku-4-5-20251001": 4096,
  "claude-sonnet-4-6": 8192,
};

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  client ??= new Anthropic({ maxRetries: 2 });
  return client;
}

export const anthropicInvoker: ModelInvoker = async (call: ModelCall) => {
  const content =
    typeof call.user === "string"
      ? call.user
      : (call.user as MessageParam["content"]);

  const response = await getClient().messages.create({
    model: call.model,
    system: call.system,
    temperature: 0,
    max_tokens: call.maxTokens ?? DEFAULT_MAX_TOKENS[call.model] ?? 4096,
    messages: [{ role: "user", content }],
  });

  const text = response.content.find((block) => block.type === "text");
  if (!text || text.type !== "text") {
    throw new Error(
      `Model ${call.model} returned no text block (stop_reason: ${response.stop_reason})`,
    );
  }
  return text.text;
};
