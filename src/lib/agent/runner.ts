import {
  AGENT_LIMITS,
  AGENT_SYSTEM_PROMPT,
  authorizeTool,
  getToolSpec,
  redactForLog,
  toolResultText,
  toolsFor,
  type AgentOptions,
} from "@/lib/agent/policy";
import type { AdminRole } from "@/types/admin";
import type { PermissionKey } from "@/types/permission";

// The bounded agent loop. Model and tool execution are injected, so the loop's safety
// properties (allowlist, permission re-checks, call/turn/time limits, no retries of writes)
// are unit-tested without network access.

export interface ContentBlock {
  type: string;
  id?: string;
  name?: string;
  input?: unknown;
  text?: string;
  [key: string]: unknown;
}

export interface ModelResponse {
  content: ContentBlock[];
  stop_reason: string | null;
  usage: { input_tokens: number; output_tokens: number };
  model: string;
}

export interface ModelRequest {
  system: string;
  tools: { name: string; description: string; input_schema: unknown; strict: true }[];
  messages: { role: "user" | "assistant"; content: unknown }[];
  maxTokens: number;
  timeoutMs: number;
}

export interface ToolCallLog {
  name: string;
  input: string;
  status: "ok" | "error" | "denied" | "skipped";
  output: string;
  durationMs: number;
  attempts: number;
}

export interface AgentRunOutcome {
  status: "succeeded" | "failed" | "stopped";
  result: string;
  error: string | null;
  toolCalls: ToolCallLog[];
  turns: number;
  inputTokens: number;
  outputTokens: number;
  model: string | null;
  durationMs: number;
}

export class ToolError extends Error {}

export async function runAgentLoop(params: {
  request: string;
  role: AdminRole;
  permissions: PermissionKey[];
  options: AgentOptions;
  callModel: (req: ModelRequest) => Promise<ModelResponse>;
  executeTool: (name: string, input: Record<string, unknown>) => Promise<unknown>;
  beforeTurn?: () => Promise<void>; // e.g. per-client AI rate limit
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<AgentRunOutcome> {
  const now = params.now ?? Date.now;
  const sleep = params.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const started = now();
  const tools = toolsFor(params.role, params.permissions, params.options).map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
    strict: true as const,
  }));

  const messages: ModelRequest["messages"] = [{ role: "user", content: params.request.slice(0, AGENT_LIMITS.maxRequestChars) }];
  const toolCalls: ToolCallLog[] = [];
  let paidCalls = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let model: string | null = null;
  let lastText = "";

  const finish = (status: AgentRunOutcome["status"], result: string, error: string | null, turns: number): AgentRunOutcome => ({
    status,
    result,
    error,
    toolCalls,
    turns,
    inputTokens,
    outputTokens,
    model,
    durationMs: now() - started,
  });

  for (let turn = 1; turn <= AGENT_LIMITS.maxTurns; turn++) {
    const remaining = AGENT_LIMITS.maxDurationMs - (now() - started);
    if (remaining < 5_000) return finish("stopped", lastText, "Time limit reached.", turn - 1);
    if (params.beforeTurn) {
      try {
        await params.beforeTurn();
      } catch (error) {
        return finish("stopped", lastText, error instanceof Error ? error.message : "Stopped.", turn - 1);
      }
    }

    let response: ModelResponse;
    try {
      response = await params.callModel({
        system: AGENT_SYSTEM_PROMPT,
        tools,
        messages,
        maxTokens: AGENT_LIMITS.maxOutputTokensPerTurn,
        timeoutMs: Math.min(remaining, 120_000),
      });
    } catch (error) {
      return finish("failed", lastText, error instanceof Error ? error.message : "The model call failed.", turn - 1);
    }
    inputTokens += response.usage.input_tokens;
    outputTokens += response.usage.output_tokens;
    model = response.model;
    const text = response.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n").trim();
    if (text) lastText = text;
    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "refusal") return finish("failed", lastText, "The model declined this request.", turn);
    if (response.stop_reason === "max_tokens") return finish("stopped", lastText, "The response was cut off (token limit).", turn);
    if (response.stop_reason !== "tool_use") return finish("succeeded", lastText || "(no answer)", null, turn);

    const results: { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }[] = [];
    for (const block of response.content.filter((b) => b.type === "tool_use")) {
      const name = String(block.name ?? "");
      const input = (block.input && typeof block.input === "object" ? block.input : {}) as Record<string, unknown>;
      const id = String(block.id ?? "");
      const log = (entry: Omit<ToolCallLog, "name" | "input">) => toolCalls.push({ name, input: redactForLog(input), ...entry });

      if (toolCalls.length >= AGENT_LIMITS.maxToolCalls) {
        log({ status: "skipped", output: "Tool call limit reached.", durationMs: 0, attempts: 0 });
        results.push({ type: "tool_result", tool_use_id: id, content: "Tool call limit reached. Stop calling tools and summarize.", is_error: true });
        continue;
      }
      // Permission and allowlist are re-checked for every call.
      const denied = authorizeTool(name, params.role, params.permissions, params.options);
      if (denied) {
        log({ status: "denied", output: denied, durationMs: 0, attempts: 0 });
        results.push({ type: "tool_result", tool_use_id: id, content: denied, is_error: true });
        continue;
      }
      const spec = getToolSpec(name)!;
      if (spec.kind === "paid" && paidCalls >= AGENT_LIMITS.maxPaidToolCalls) {
        log({ status: "skipped", output: "Paid tool limit reached.", durationMs: 0, attempts: 0 });
        results.push({ type: "tool_result", tool_use_id: id, content: "Paid tool limit reached for this run.", is_error: true });
        continue;
      }
      if (spec.kind === "paid") paidCalls++;

      // Only read tools are retried (once); writes and paid calls never are.
      const maxAttempts = spec.kind === "read" ? 2 : 1;
      const t0 = now();
      for (let attempt = 1; ; attempt++) {
        try {
          const output = await params.executeTool(name, input);
          log({ status: "ok", output: redactForLog(output), durationMs: now() - t0, attempts: attempt });
          results.push({ type: "tool_result", tool_use_id: id, content: toolResultText(output) });
          break;
        } catch (error) {
          const message = error instanceof Error ? error.message : "Tool failed.";
          if (attempt < maxAttempts && !(error instanceof ToolError)) {
            await sleep(1000);
            continue;
          }
          log({ status: "error", output: redactForLog(message), durationMs: now() - t0, attempts: attempt });
          results.push({ type: "tool_result", tool_use_id: id, content: `Error: ${message}`, is_error: true });
          break;
        }
      }
    }
    messages.push({ role: "user", content: results });
  }
  return finish("stopped", lastText, "Turn limit reached.", AGENT_LIMITS.maxTurns);
}
