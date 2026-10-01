import Anthropic from "@anthropic-ai/sdk";
import type { ContentBlock, ModelCompletionRequest, ModelCompletionResponse, ModelProvider } from "./model-provider";

export class AnthropicModelProvider implements ModelProvider {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async complete(req: ModelCompletionRequest): Promise<ModelCompletionResponse> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 2048,
      system: req.system,
      // Anthropic's block shapes already match ContentBlock; tool_result only ever
      // appears inside a "user" message, matching the Messages API contract.
      messages: req.messages as unknown as Anthropic.MessageParam[],
      tools: req.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
      })),
    });

    const content: ContentBlock[] = response.content.map((block) => {
      if (block.type === "text") return { type: "text", text: block.text };
      if (block.type === "tool_use") {
        return { type: "tool_use", id: block.id, name: block.name, input: block.input as Record<string, unknown> };
      }
      return { type: "text", text: "" };
    });

    return { content, stopReason: response.stop_reason ?? "end_turn" };
  }
}
