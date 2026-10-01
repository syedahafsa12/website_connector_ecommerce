import { AnthropicModelProvider } from "./anthropic-provider";
import type { ModelProvider } from "./model-provider";

export function getModelProvider(): ModelProvider {
  const kind = process.env.MODEL_PROVIDER ?? "anthropic";
  if (kind === "anthropic") {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
    return new AnthropicModelProvider(apiKey, process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5");
  }
  throw new Error(`Unknown MODEL_PROVIDER '${kind}'`);
}
