/**
 * Which chat model the server talks to. Both providers speak the same OpenAI-style chat API, so the rest of the code
 * is provider-agnostic. DeepSeek is used when DEEPSEEK_API_KEY is set; otherwise Mistral. Server-side only.
 */
export type Llm = { provider: "deepseek" | "mistral"; key: string; base: string; model: string };

export function llm(): Llm | null {
  const d = process.env.DEEPSEEK_API_KEY;
  if (d) return { provider: "deepseek", key: d, base: (process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com").replace(/\/$/, ""), model: process.env.DEEPSEEK_MODEL ?? "deepseek-chat" };
  const m = process.env.MISTRAL_API_KEY;
  if (m) return { provider: "mistral", key: m, base: (process.env.MISTRAL_BASE_URL ?? "https://api.mistral.ai").replace(/\/$/, ""), model: process.env.MISTRAL_MODEL ?? "mistral-medium-latest" };
  return null;
}
