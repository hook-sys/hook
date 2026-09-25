import type { ProviderResult, StopKind } from "@/lib/ai/providers/common";

// Pure request/response translation between the app's normalized format (Anthropic-style
// content blocks, used by the agent runner) and the OpenAI Chat Completions / Gemini
// generateContent wire formats. Every provider response is normalized to the same shapes.

export interface NormalizedBlock {
  type: string;
  id?: string;
  name?: string;
  input?: unknown;
  text?: string;
  [key: string]: unknown;
}

export interface NormalizedTurn {
  content: NormalizedBlock[];
  stop_reason: "end_turn" | "tool_use" | "max_tokens" | "refusal";
  usage: { input_tokens: number; output_tokens: number };
  model: string;
}

export interface AgentWireRequest {
  system: string;
  tools: { name: string; description: string; input_schema: unknown }[];
  messages: { role: "user" | "assistant"; content: unknown }[];
  maxTokens: number;
}

type ToolResult = { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

const isToolResults = (content: unknown): content is ToolResult[] =>
  Array.isArray(content) && content.every((c) => (c as { type?: string })?.type === "tool_result");
const asBlocks = (content: unknown): NormalizedBlock[] => (Array.isArray(content) ? (content as NormalizedBlock[]) : []);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

// ---------------------------------------------------------------------------
// OpenAI Chat Completions
// ---------------------------------------------------------------------------

export function openAIStructuredBody(model: string, system: string, user: string, schema: Record<string, unknown>, maxTokens: number) {
  return {
    model,
    messages: [
      { role: "developer", content: system },
      { role: "user", content: user },
    ],
    max_completion_tokens: maxTokens,
    response_format: { type: "json_schema", json_schema: { name: "hook_marketing_output", schema, strict: true } },
  };
}

interface OpenAIChatResponse {
  model?: string;
  choices?: {
    finish_reason?: string;
    message?: {
      content?: string | null;
      refusal?: string | null;
      tool_calls?: { id?: string; type?: string; function?: { name?: string; arguments?: string } }[];
    };
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

function openAIStop(finish: string | undefined, refusal: unknown): StopKind {
  if (refusal) return "refusal";
  if (finish === "length") return "max_tokens";
  if (finish === "content_filter") return "refusal";
  return "complete";
}

export function normalizeOpenAIStructured(json: unknown, requestedModel: string): ProviderResult {
  const r = (json ?? {}) as OpenAIChatResponse;
  const choice = r.choices?.[0];
  return {
    text: choice?.message?.content ?? "",
    model: r.model ?? requestedModel,
    inputTokens: num(r.usage?.prompt_tokens),
    outputTokens: num(r.usage?.completion_tokens),
    stop: openAIStop(choice?.finish_reason, choice?.message?.refusal),
  };
}

export function openAIAgentBody(model: string, req: AgentWireRequest) {
  const messages: Record<string, unknown>[] = [{ role: "developer", content: req.system }];
  for (const m of req.messages) {
    if (m.role === "user") {
      if (isToolResults(m.content)) {
        for (const r of m.content) messages.push({ role: "tool", tool_call_id: r.tool_use_id, content: r.content });
      } else {
        messages.push({ role: "user", content: typeof m.content === "string" ? m.content : JSON.stringify(m.content) });
      }
      continue;
    }
    const blocks = asBlocks(m.content);
    const text = blocks.filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n");
    const calls = blocks
      .filter((b) => b.type === "tool_use")
      .map((b) => ({ id: String(b.id), type: "function", function: { name: String(b.name), arguments: JSON.stringify(b.input ?? {}) } }));
    messages.push({ role: "assistant", content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });
  }
  return {
    model,
    messages,
    max_completion_tokens: req.maxTokens,
    tools: req.tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.input_schema, strict: true },
    })),
  };
}

export function normalizeOpenAIAgentTurn(json: unknown, requestedModel: string): NormalizedTurn {
  const r = (json ?? {}) as OpenAIChatResponse;
  const choice = r.choices?.[0];
  const content: NormalizedBlock[] = [];
  if (choice?.message?.content) content.push({ type: "text", text: choice.message.content });
  for (const call of choice?.message?.tool_calls ?? []) {
    let input: unknown = {};
    try {
      input = JSON.parse(call.function?.arguments ?? "{}");
    } catch {
      input = {};
    }
    content.push({ type: "tool_use", id: call.id ?? "", name: call.function?.name ?? "", input });
  }
  const hasCalls = content.some((b) => b.type === "tool_use");
  const stop = openAIStop(choice?.finish_reason, choice?.message?.refusal);
  return {
    content,
    stop_reason: hasCalls ? "tool_use" : stop === "complete" ? "end_turn" : stop,
    usage: { input_tokens: num(r.usage?.prompt_tokens), output_tokens: num(r.usage?.completion_tokens) },
    model: r.model ?? requestedModel,
  };
}

// ---------------------------------------------------------------------------
// Gemini generateContent
// ---------------------------------------------------------------------------

export function geminiStructuredBody(system: string, user: string, schema: Record<string, unknown>, maxTokens: number) {
  return {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: { responseMimeType: "application/json", responseJsonSchema: schema, maxOutputTokens: maxTokens },
  };
}

interface GeminiPart {
  text?: string;
  thought?: boolean;
  functionCall?: { id?: string; name?: string; args?: unknown };
  [key: string]: unknown;
}

interface GeminiResponse {
  modelVersion?: string;
  promptFeedback?: { blockReason?: string };
  candidates?: { finishReason?: string; content?: { parts?: GeminiPart[] } }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
}

const LOCAL_CALL_PREFIX = "gemini_call_";
const GEMINI_REFUSALS =new Set(["SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "LANGUAGE"]);

function geminiStop(r: GeminiResponse): StopKind {
  if (r.promptFeedback?.blockReason) return "refusal";
  const reason = r.candidates?.[0]?.finishReason;
  if (reason === "MAX_TOKENS") return "max_tokens";
  if (reason && GEMINI_REFUSALS.has(reason)) return "refusal";
  return "complete";
}

const geminiUsage = (r: GeminiResponse) => ({
  input: num(r.usageMetadata?.promptTokenCount),
  output: num(r.usageMetadata?.candidatesTokenCount) + num(r.usageMetadata?.thoughtsTokenCount),
});

export function normalizeGeminiStructured(json: unknown, requestedModel: string): ProviderResult {
  const r = (json ?? {}) as GeminiResponse;
  const parts = r.candidates?.[0]?.content?.parts ?? [];
  const usage = geminiUsage(r);
  return {
    text: parts.filter((p) => typeof p.text === "string" && !p.thought).map((p) => p.text).join(""),
    model: r.modelVersion ?? requestedModel,
    inputTokens: usage.input,
    outputTokens: usage.output,
    stop: geminiStop(r),
  };
}

export function geminiAgentBody(req: AgentWireRequest) {
  const toolNames = new Map<string, string>();
  const contents: { role: "user" | "model"; parts: unknown[] }[] = [];
  for (const m of req.messages) {
    if (m.role === "assistant") {
      const blocks = asBlocks(m.content);
      for (const b of blocks) if (b.type === "tool_use" && b.id) toolNames.set(String(b.id), String(b.name));
      // Replay the model's own parts verbatim (keeps Gemini thought signatures intact).
      const raw = blocks.find((b) => Array.isArray(b._geminiParts))?._geminiParts as unknown[] | undefined;
      const parts =
        raw ??
        blocks.map((b) =>
          b.type === "tool_use"
            ? {
                functionCall: {
                  ...(String(b.id).startsWith(LOCAL_CALL_PREFIX) ? {} : { id: b.id }),
                  name: b.name,
                  args: b.input ?? {},
                },
              }
            : { text: b.text ?? "" }
        );
      contents.push({ role: "model", parts });
      continue;
    }
    if (isToolResults(m.content)) {
      contents.push({
        role: "user",
        parts: m.content.map((r) => ({
          functionResponse: {
            // IDs we generated locally (Gemini sent none) are not echoed back.
            ...(r.tool_use_id.startsWith(LOCAL_CALL_PREFIX) ? {} : { id: r.tool_use_id }),
            name: toolNames.get(r.tool_use_id) ?? "tool",
            response: r.is_error ? { error: r.content } : { result: r.content },
          },
        })),
      });
    } else {
      contents.push({ role: "user", parts: [{ text: typeof m.content === "string" ? m.content : JSON.stringify(m.content) }] });
    }
  }
  return {
    systemInstruction: { parts: [{ text: req.system }] },
    contents,
    tools: [{ functionDeclarations: req.tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.input_schema })) }],
    generationConfig: { maxOutputTokens: req.maxTokens },
  };
}

export function normalizeGeminiAgentTurn(json: unknown, requestedModel: string): NormalizedTurn {
  const r = (json ?? {}) as GeminiResponse;
  const parts = r.candidates?.[0]?.content?.parts ?? [];
  const content: NormalizedBlock[] = [];
  parts.forEach((p, i) => {
    if (p.functionCall?.name) {
      content.push({ type: "tool_use", id: p.functionCall.id || `${LOCAL_CALL_PREFIX}${i}`, name: p.functionCall.name, input: p.functionCall.args ?? {} });
    } else if (typeof p.text === "string" && !p.thought && p.text) {
      content.push({ type: "text", text: p.text });
    }
  });
  // Keep the raw parts on the turn so the next request replays them unchanged.
  if (content.length) content[0] = { ...content[0], _geminiParts: parts };
  else if (parts.length) content.push({ type: "text", text: "", _geminiParts: parts });

  const usage = geminiUsage(r);
  const stop = geminiStop(r);
  const hasCalls = content.some((b) => b.type === "tool_use");
  return {
    content,
    stop_reason: hasCalls ? "tool_use" : stop === "complete" ? "end_turn" : stop,
    usage: { input_tokens: usage.input, output_tokens: usage.output },
    model: r.modelVersion ?? requestedModel,
  };
}
