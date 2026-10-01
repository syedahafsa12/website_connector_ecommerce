export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

export interface ModelMessage {
  role: "user" | "assistant";
  content: ContentBlock[];
}

export interface ModelTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ModelCompletionRequest {
  system: string;
  messages: ModelMessage[];
  tools: ModelTool[];
}

export interface ModelCompletionResponse {
  content: ContentBlock[];
  stopReason: "end_turn" | "tool_use" | "max_tokens" | string;
}

/**
 * The agent is written against this interface only. Swapping models means
 * writing a new implementation of this interface, not touching agent logic.
 */
export interface ModelProvider {
  complete(req: ModelCompletionRequest): Promise<ModelCompletionResponse>;
}
