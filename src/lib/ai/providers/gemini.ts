import { UNTRUSTED_DATA_RULE, type StructuredCall } from "@/lib/ai/claude-json";
import { filterGeminiModels, type DiscoveredModel, type ProviderResult } from "@/lib/ai/providers/common";
import { providerFetch } from "@/lib/ai/providers/http";
import {
  geminiAgentBody,
  geminiStructuredBody,
  normalizeGeminiAgentTurn,
  normalizeGeminiStructured,
  type AgentWireRequest,
  type NormalizedTurn,
} from "@/lib/ai/providers/wire";
import { getIntegrationSecret } from "@/lib/integrations/store";
import { IntegrationError, type ConnectionTestResult } from "@/lib/integrations/types";

// Server-only Google Gemini adapter (generateContent with JSON schema / function calling).
const API = "https://generativelanguage.googleapis.com/v1beta";
const LABEL = "Gemini";
const MODEL_ID = /^[A-Za-z0-9._-]{1,200}$/;

async function requireKey(): Promise<string> {
  const key = await getIntegrationSecret("gemini");
  if (!key) throw new IntegrationError("Connect Google Gemini in Settings → Integrations first.");
  return key;
}

const headers = (key: string) => ({ "x-goog-api-key": key });

function modelPath(model: string): string {
  if (!MODEL_ID.test(model)) throw new IntegrationError("Invalid Gemini model.");
  return `${API}/models/${model}:generateContent`;
}

export async function geminiStructured(call: StructuredCall & { model: string }): Promise<ProviderResult> {
  const json = await providerFetch(LABEL, modelPath(call.model), {
    method: "POST",
    headers: headers(await requireKey()),
    body: geminiStructuredBody(`${call.system}\n\n${UNTRUSTED_DATA_RULE}`, call.user, call.schema, call.maxTokens),
    timeoutMs: call.timeoutMs ?? 180_000,
  });
  return normalizeGeminiStructured(json, call.model);
}

export async function geminiAgentTurn(req: AgentWireRequest & { timeoutMs: number }, model: string): Promise<NormalizedTurn> {
  const json = await providerFetch(LABEL, modelPath(model), {
    method: "POST",
    headers: headers(await requireKey()),
    body: geminiAgentBody({ ...req, system: `${req.system}\n\n${UNTRUSTED_DATA_RULE}` }),
    timeoutMs: req.timeoutMs,
  });
  return normalizeGeminiAgentTurn(json, model);
}

export async function geminiListModels(apiKey?: string): Promise<DiscoveredModel[]> {
  const key = apiKey ?? (await requireKey());
  const all: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[] = [];
  let pageToken = "";
  for (let page = 0; page < 5; page++) {
    const json = (await providerFetch(LABEL, `${API}/models?pageSize=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`, {
      headers: headers(key),
      timeoutMs: 20_000,
    })) as { models?: { name?: unknown; displayName?: unknown; supportedGenerationMethods?: unknown }[]; nextPageToken?: string } | null;
    for (const m of json?.models ?? []) {
      if (typeof m.name !== "string") continue;
      all.push({
        name: m.name,
        displayName: typeof m.displayName === "string" ? m.displayName : undefined,
        supportedGenerationMethods: Array.isArray(m.supportedGenerationMethods) ? m.supportedGenerationMethods.map(String) : [],
      });
    }
    pageToken = json?.nextPageToken ?? "";
    if (!pageToken) break;
  }
  return filterGeminiModels(all);
}

export async function testGeminiKey(apiKey: string): Promise<ConnectionTestResult> {
  try {
    const models = await geminiListModels(apiKey);
    return models.length
      ? { ok: true, message: `Connected to Google Gemini (${models.length} text models available).` }
      : { ok: false, message: "The key works but no text-generation models are available to it." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not reach Google Gemini." };
  }
}
