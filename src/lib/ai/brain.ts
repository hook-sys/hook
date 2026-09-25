import { cache } from "react";
import {
  claudeAgentTurn,
  claudeListModels,
  claudeStructured,
  type StructuredCall,
} from "@/lib/ai/claude-json";
import {
  AIGenerationError,
  AI_PROVIDER_LABELS,
  EMPTY_BRAIN_CONFIG,
  finishStructured,
  isAIProvider,
  resolveRoute,
  type AIProviderId,
  type BrainConfig,
  type DiscoveredModel,
  type ModelRef,
  type ProviderResult,
  type StructuredResult,
} from "@/lib/ai/providers/common";
import { geminiAgentTurn, geminiListModels, geminiStructured } from "@/lib/ai/providers/gemini";
import { openAIAgentTurn, openAIListModels, openAIStructured } from "@/lib/ai/providers/openai";
import type { AgentWireRequest, NormalizedTurn } from "@/lib/ai/providers/wire";
import { getIntegration } from "@/lib/integrations/store";
import { IntegrationError } from "@/lib/integrations/types";
import { createAdminClient } from "@/lib/supabase/admin";

// Server-only AI brain: every AI brain operation (strategy, content, campaign intelligence /
// AI Agent, analytics report, creative brief) runs on the ONE provider + model the Super
// Admin selected. Other connected providers are never called and there is no automatic
// switching. The selection is read with the service role (after the caller's own permission
// checks), so sub-admins can use — but never read or change — it. Fal.ai is separate.

interface ProviderAdapter {
  structured(call: StructuredCall & { model: string }): Promise<ProviderResult>;
  agentTurn(req: AgentWireRequest & { timeoutMs: number }, model: string): Promise<NormalizedTurn>;
  listModels(): Promise<DiscoveredModel[]>;
}

const ADAPTERS: Record<AIProviderId, ProviderAdapter> = {
  claude: {
    structured: claudeStructured,
    agentTurn: async (req, model) => claudeAgentTurn(req, model, await claudeAdaptiveThinking(model)),
    listModels: claudeListModels,
  },
  openai: { structured: openAIStructured, agentTurn: openAIAgentTurn, listModels: () => openAIListModels() },
  gemini: { structured: geminiStructured, agentTurn: geminiAgentTurn, listModels: () => geminiListModels() },
};

// Per-request memoized selection.
export const loadBrainConfig = cache(async (): Promise<BrainConfig> => {
  const { data, error } = await createAdminClient()
    .from("ai_brain_settings")
    .select("default_provider, default_model")
    .maybeSingle();
  if (error) throw new IntegrationError("Could not load the AI brain configuration.");
  const config: BrainConfig = { ...EMPTY_BRAIN_CONFIG };
  if (data && isAIProvider(data.default_provider)) {
    config.provider = data.default_provider;
    config.model = data.default_model ?? null;
  }
  return config;
});

async function claudeAdaptiveThinking(model: string): Promise<boolean> {
  const { data } = await createAdminClient()
    .from("ai_provider_models")
    .select("supports_adaptive_thinking")
    .eq("provider", "claude")
    .eq("model_id", model)
    .maybeSingle();
  // No discovery row (e.g. the legacy default model) keeps the previous behavior.
  return data?.supports_adaptive_thinking ?? true;
}

// "configured" (saved, untested) or "connected" keys are usable; "error" is not.
export async function providerReady(provider: AIProviderId): Promise<boolean> {
  const status = (await getIntegration(provider)).status;
  return status === "connected" || status === "configured";
}

// The selected provider/model (throws an admin-safe error if no model is selected).
export async function brainRoute(): Promise<ModelRef> {
  const route = resolveRoute(await loadBrainConfig());
  if (!route.ok) throw new IntegrationError(route.error);
  return route.primary;
}

// Null when the selected AI brain provider/model is usable; otherwise an admin-safe message.
export async function brainReadiness(): Promise<string | null> {
  try {
    const ref = await brainRoute();
    return (await providerReady(ref.provider)) ? null : `Connect ${AI_PROVIDER_LABELS[ref.provider]} in Settings → Integrations first.`;
  } catch (error) {
    return error instanceof IntegrationError ? error.message : "The AI brain is not configured.";
  }
}

async function readyRoute(): Promise<ModelRef> {
  const issue = await brainReadiness();
  if (issue) throw new IntegrationError(issue);
  return brainRoute();
}

export interface AttemptRecord {
  ref: ModelRef;
  ok: boolean;
  durationMs: number;
  usage: { model: string; inputTokens: number; outputTokens: number } | null;
  error: unknown;
}

// Structured generation on the selected provider/model (no fallback to another provider).
export async function brainStructured<T>(
  call: StructuredCall & { validate: (value: unknown) => { ok: true; value: T } | { ok: false; error: string } },
  onAttempt: (attempt: AttemptRecord) => Promise<void>
): Promise<StructuredResult<T> & { provider: AIProviderId }> {
  const ref = await readyRoute();
  const started = Date.now();
  try {
    const raw = await ADAPTERS[ref.provider].structured({ ...call, model: ref.model });
    const result = finishStructured(raw, call.validate, AI_PROVIDER_LABELS[ref.provider]);
    await onAttempt({ ref, ok: true, durationMs: Date.now() - started, usage: result, error: null });
    return { ...result, provider: ref.provider };
  } catch (error) {
    const usage = error instanceof AIGenerationError ? error.usage : null;
    await onAttempt({ ref, ok: false, durationMs: Date.now() - started, usage, error });
    throw error;
  }
}

// One AI Agent turn on the selected provider/model (same tools and limits for every provider).
export async function brainAgentTurn(req: AgentWireRequest & { timeoutMs: number }): Promise<NormalizedTurn & { provider: AIProviderId }> {
  const ref = await readyRoute();
  const turn = await ADAPTERS[ref.provider].agentTurn(req, ref.model);
  return { ...turn, provider: ref.provider };
}

// Refreshes the discovered model list for a provider. Nothing is invented: rows come only
// from the provider's API; models no longer returned are marked unavailable (never deleted,
// so a saved selection stays intact). On failure the stored list is left unchanged.
export async function refreshProviderModels(provider: AIProviderId): Promise<{ total: number }> {
  if (!(await providerReady(provider))) throw new IntegrationError(`Connect ${AI_PROVIDER_LABELS[provider]} first.`);
  const models = await ADAPTERS[provider].listModels();
  const db = createAdminClient();
  const now = new Date().toISOString();
  if (models.length) {
    const { error } = await db.from("ai_provider_models").upsert(
      models.map((m) => ({
        provider,
        model_id: m.id,
        display_name: m.displayName.slice(0, 300),
        is_available: true,
        supports_structured: m.supportsStructured,
        supports_adaptive_thinking: m.supportsAdaptiveThinking,
        fetched_at: now,
      })),
      { onConflict: "provider,model_id" }
    );
    if (error) throw new IntegrationError("Could not save the model list.");
  }
  let stale = db.from("ai_provider_models").update({ is_available: false, fetched_at: now }).eq("provider", provider);
  if (models.length) stale = stale.not("model_id", "in", `(${models.map((m) => `"${m.id}"`).join(",")})`);
  await stale;
  return { total: models.length };
}
