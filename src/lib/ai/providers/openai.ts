import { UNTRUSTED_DATA_RULE, type StructuredCall } from "@/lib/ai/claude-json";
import { filterOpenAIModels, type DiscoveredModel, type ProviderResult } from "@/lib/ai/providers/common";
import { providerFetch } from "@/lib/ai/providers/http";
import {
  normalizeOpenAIAgentTurn,
  normalizeOpenAIStructured,
  openAIAgentBody,
  openAIStructuredBody,
  type AgentWireRequest,
  type NormalizedTurn,
} from "@/lib/ai/providers/wire";
import { getIntegrationSecret } from "@/lib/integrations/store";
import { IntegrationError, type ConnectionTestResult } from "@/lib/integrations/types";

// Server-only OpenAI adapter (Chat Completions with Structured Outputs / function calling).
const API = "https://api.openai.com/v1";
const LABEL = "OpenAI";

async function requireKey(): Promise<string> {
  const key = await getIntegrationSecret("openai");
  if (!key) throw new IntegrationError("Connect OpenAI in Settings → Integrations first.");
  return key;
}

const headers = (key: string) => ({ Authorization: `Bearer ${key}` });

export async function openAIStructured(call: StructuredCall & { model: string }): Promise<ProviderResult> {
  const json = await providerFetch(LABEL, `${API}/chat/completions`, {
    method: "POST",
    headers: headers(await requireKey()),
    body: openAIStructuredBody(call.model, `${call.system}\n\n${UNTRUSTED_DATA_RULE}`, call.user, call.schema, call.maxTokens),
    timeoutMs: call.timeoutMs ?? 180_000,
  });
  return normalizeOpenAIStructured(json, call.model);
}

export async function openAIAgentTurn(req: AgentWireRequest & { timeoutMs: number }, model: string): Promise<NormalizedTurn> {
  const json = await providerFetch(LABEL, `${API}/chat/completions`, {
    method: "POST",
    headers: headers(await requireKey()),
    body: openAIAgentBody(model, { ...req, system: `${req.system}\n\n${UNTRUSTED_DATA_RULE}` }),
    timeoutMs: req.timeoutMs,
  });
  return normalizeOpenAIAgentTurn(json, model);
}

export async function openAIListModels(apiKey?: string): Promise<DiscoveredModel[]> {
  const json = (await providerFetch(LABEL, `${API}/models`, {
    headers: headers(apiKey ?? (await requireKey())),
    timeoutMs: 20_000,
  })) as { data?: { id?: unknown }[] } | null;
  return filterOpenAIModels((json?.data ?? []).filter((m): m is { id: string } => typeof m.id === "string"));
}

// Lists models: validates the key without spending tokens.
export async function testOpenAIKey(apiKey: string): Promise<ConnectionTestResult> {
  try {
    const models = await openAIListModels(apiKey);
    return models.length
      ? { ok: true, message: `Connected to OpenAI (${models.length} chat models available).` }
      : { ok: false, message: "The key works but no chat models are available to it." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not reach OpenAI." };
  }
}
