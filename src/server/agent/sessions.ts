import { query, queryOne } from "@/server/db/pool";

export interface AgentSessionRow {
  id: string;
  user_id: string | null;
  started_at: string;
  ended_at: string | null;
  metadata: Record<string, unknown>;
}

export interface AgentToolCallRow {
  id: string;
  session_id: string | null;
  user_id: string | null;
  tool_name: string;
  arguments: Record<string, unknown>;
  result_status: "success" | "error" | "blocked";
  result_summary: Record<string, unknown>;
  created_at: string;
}

export async function createAgentSession(userId: string, metadata: Record<string, unknown> = {}): Promise<AgentSessionRow> {
  const row = await queryOne<AgentSessionRow>(
    `insert into agent_sessions (user_id, metadata) values ($1, $2) returning *`,
    [userId, JSON.stringify(metadata)],
  );
  if (!row) throw new Error("failed to create agent session");
  return row;
}

export async function getAgentSession(sessionId: string): Promise<AgentSessionRow | undefined> {
  return queryOne<AgentSessionRow>(`select * from agent_sessions where id = $1`, [sessionId]);
}

/**
 * Resolves the session this tool call belongs to: reuses `sessionId` if it's
 * a real, existing session owned by this user, otherwise starts a new one.
 * Frontend-held session ids from another user are never trusted — a stale
 * or guessed id degrades to "new session" rather than leaking a tool-call
 * history onto a session that isn't the caller's.
 */
export async function resolveAgentSession(userId: string, sessionId: string | undefined | null): Promise<AgentSessionRow> {
  if (sessionId) {
    const existing = await getAgentSession(sessionId);
    if (existing && existing.user_id === userId) return existing;
  }
  return createAgentSession(userId);
}

export async function logToolCall(input: {
  sessionId: string | null;
  userId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  resultStatus: "success" | "error" | "blocked";
  resultSummary: Record<string, unknown>;
}): Promise<void> {
  await query(
    `insert into agent_tool_calls (session_id, user_id, tool_name, arguments, result_status, result_summary)
     values ($1,$2,$3,$4,$5,$6)`,
    [
      input.sessionId,
      input.userId,
      input.toolName,
      JSON.stringify(input.arguments),
      input.resultStatus,
      JSON.stringify(input.resultSummary),
    ],
  );
}
