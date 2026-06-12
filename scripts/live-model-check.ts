/**
 * Live Anthropic connectivity check — run with: bun scripts/live-model-check.ts
 * Sends one minimal Haiku request through the production invoker to verify
 * ANTHROPIC_API_KEY + network path. Costs a few hundred tokens.
 */
import { anthropicInvoker } from "../workflows/invoker";
import { EXTRACTION_MODEL } from "../workflows/contracts/extract.contract";

async function main() {
  const out = await anthropicInvoker({
    model: EXTRACTION_MODEL,
    system: "Reply with exactly the word: ok",
    user: "ping",
    maxTokens: 16,
  });
  console.log(`model: ${EXTRACTION_MODEL}`);
  console.log(`reply: ${out.trim()}`);
  if (!/ok/i.test(out)) {
    console.error("Unexpected reply");
    process.exit(1);
  }
  console.log("Live invoker check passed.");
}

main().catch((e) => {
  console.error(`Live check failed: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
