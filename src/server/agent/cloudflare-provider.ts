import type { ContentBlock, ModelCompletionRequest, ModelCompletionResponse, ModelMessage, ModelProvider } from "./model-provider";

interface CfOpenAiMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}

/** Our ModelMessage/ContentBlock shape (Anthropic-style) -> Cloudflare's OpenAI-compatible chat messages. */
function toCfMessages(system: string, messages: ModelMessage[]): CfOpenAiMessage[] {
  const out: CfOpenAiMessage[] = [{ role: "system", content: system }];
  for (const m of messages) {
    if (m.role === "assistant") {
      const text = m.content.find((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text")?.text ?? null;
      const toolCalls = m.content.filter((b): b is Extract<ContentBlock, { type: "tool_use" }> => b.type === "tool_use");
      out.push({
        role: "assistant",
        content: text ?? "", // Cloudflare's schema rejects content: null even when tool_calls is present
        tool_calls: toolCalls.length
          ? toolCalls.map((tc) => ({ id: tc.id, type: "function", function: { name: tc.name, arguments: JSON.stringify(tc.input) } }))
          : undefined,
      });
      continue;
    }
    // role === "user": either a plain text turn, or a batch of tool results (OpenAI wants one "tool" message per result).
    const toolResults = m.content.filter((b): b is Extract<ContentBlock, { type: "tool_result" }> => b.type === "tool_result");
    if (toolResults.length) {
      for (const tr of toolResults) out.push({ role: "tool", tool_call_id: tr.tool_use_id, content: tr.content });
      continue;
    }
    const text = m.content.find((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text")?.text ?? "";
    out.push({ role: "user", content: text });
  }
  return out;
}

/**
 * Cloudflare Workers AI, called via its OpenAI-compatible chat-completions
 * shape (confirmed live: tool calling works on @cf/meta/llama-3.1-8b-instruct).
 * No SDK needed — it's a plain authenticated POST.
 */
export class CloudflareModelProvider implements ModelProvider {
  constructor(
    private readonly accountId: string,
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async complete(req: ModelCompletionRequest): Promise<ModelCompletionResponse> {
    // The per-model /ai/run/{model} endpoint's request schema rejects assistant
    // tool_calls + follow-up tool-role messages for this model (confirmed live);
    // /ai/v1/chat/completions is Cloudflare's actual OpenAI-compatible surface
    // and supports full multi-turn tool conversations.
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/v1/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages: toCfMessages(req.system, req.messages),
        tools: req.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.inputSchema } })),
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Cloudflare Workers AI request failed: ${res.status} ${body.slice(0, 300)}`);
    }

    const json = (await res.json()) as { error?: { message: string }; choices?: Array<{ message: CfOpenAiMessage; finish_reason: string }> };
    if (json.error) throw new Error(`Cloudflare Workers AI error: ${json.error.message}`);

    const choice = json.choices?.[0];
    if (!choice) throw new Error("Cloudflare Workers AI returned no choices.");

    const content: ContentBlock[] = [];
    if (choice.message.content) content.push({ type: "text", text: choice.message.content });
    for (const tc of choice.message.tool_calls ?? []) {
      let input: Record<string, unknown> = {};
      try {
        input = JSON.parse(tc.function.arguments);
      } catch {
        // leave empty rather than crash the agent loop on a malformed tool-call payload
      }
      content.push({ type: "tool_use", id: tc.id, name: tc.function.name, input });
    }

    const stopReason = choice.finish_reason === "tool_calls" ? "tool_use" : choice.finish_reason === "stop" ? "end_turn" : choice.finish_reason;
    return { content, stopReason };
  }
}
