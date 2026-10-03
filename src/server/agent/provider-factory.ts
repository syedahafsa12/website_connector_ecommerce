import { AnthropicModelProvider } from "./anthropic-provider";
import { CloudflareModelProvider } from "./cloudflare-provider";
import type { ModelProvider } from "./model-provider";

export function getModelProvider(): ModelProvider {
  const kind = process.env.MODEL_PROVIDER ?? "anthropic";
  if (kind === "anthropic") {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
    return new AnthropicModelProvider(apiKey, process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5");
  }
  if (kind === "cloudflare") {
    const apiKey = process.env.CLOUDFLARE_API_KEY;
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    if (!apiKey) throw new Error("CLOUDFLARE_API_KEY is not set");
    if (!accountId) throw new Error("CLOUDFLARE_ACCOUNT_ID is not set");
    return new CloudflareModelProvider(accountId, apiKey, process.env.CLOUDFLARE_MODEL ?? "@cf/meta/llama-3.3-70b-instruct-fp8-fast");
  }
  throw new Error(`Unknown MODEL_PROVIDER '${kind}'`);
}
