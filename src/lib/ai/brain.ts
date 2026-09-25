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
  isAITask,
  resolveRoute,
  type AIProviderId,
  type AITask,
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

// Server-only AI brain: routes each AI task to the admin-selected provider/model and
// normalizes the result. Configuration is read with the service role (after the caller's
// own permission checks), so sub-admins can use — but never read or change — the config.

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

// Per-request memoized routing configuration.
export const loadBrainConfig = cache(async (): Promise<BrainConfig> => {
  const db = createAdminClient();
  const [brain, providers, tasks] = await Promise.all([
    db.from("ai_brain_settings").select("default_provider, fallback_enabled, fallback_provider, fallback_model").maybeSingle(),
    db.from("ai_provider_settings").select("provider, enabled, default_model"),
    db.from("ai_task_models").select("task, provider, model, enabled"),
  ]);
  if (brain.error || providers.error || tasks.error) throw new IntegrationError("Could not load the AI brain configuration.");

  const config: BrainConfig = structuredClone(EMPTY_BRAIN_CONFIG);
  if (brain.data && isAIProvider(brain.data.default_provider)) {
    config.defaultProvider = brain.data.default_provider;
    config.fallback = {
      enabled: Boolean(brain.data.fallback_enabled),
      provider: isAIProvider(brain.data.fallback_provider) ? brain.data.fallback_provider : null,
      model: brain.data.fallback_model ?? null,
    };
  }
  for (const p of providers.data ?? []) {
    if (isAIProvider(p.provider) && p.enabled) config.providerDefaults[p.provider] = p.default_model ?? null;
  }
  for (const t of tasks.data ?? []) {
    if (isAITask(t.task) && isAIProvider(t.provider)) config.tasks[t.task] = { provider: t.provider, model: t.model, enabled: Boolean(t.enabled) };
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

export async function routeForTask(task: AITask): Promise<{ primary: ModelRef; fallback: ModelRef | null }> {
  const route = resolveRoute(await loadBrainConfig(), task);
  if (!route.ok) throw new IntegrationError(route.error);
  return route;
}

export interface AttemptRecord {
  ref: ModelRef;
  ok: boolean;
  durationMs: number;
  usage: { model: string; inputTokens: number; outputTokens: number } | null;
  error: unknown;
  fallback: boolean;
}

// Structured generation for a task. The fallback runs only if enabled by the Super Admin,
// only after a temporary (retryable) provider failure, and only if its provider is connected.
export async function brainStructured<T>(
  task: AITask,
  call: StructuredCall & { validate: (value: unknown) => { ok: true; value: T } | { ok: false; error: string } },
  onAttempt: (attempt: AttemptRecord) => Promise<void>
): Promise<StructuredResult<T> & { provider: AIProviderId; fallbackUsed: boolean }> {
  const { primary, fallback } = await routeForTask(task);
  if (!(await providerReady(primary.provider))) {
    throw new IntegrationError(`Connect ${AI_PROVIDER_LABELS[primary.provider]} in Settings → Integrations first.`);
  }

  const attempt = async (ref: ModelRef, isFallback: boolean) => {
    const started = Date.now();
    try {
      const raw = await ADAPTERS[ref.provider].structured({ ...call, model: ref.model });
      const result = finishStructured(raw, call.validate, AI_PROVIDER_LABELS[ref.provider]);
      await onAttempt({ ref, ok: true, durationMs: Date.now() - started, usage: result, error: null, fallback: isFallback });
      return { ...result, provider: ref.provider, fallbackUsed: isFallback };
    } catch (error) {
      const usage = error instanceof AIGenerationError ? error.usage : null;
      await onAttempt({ ref, ok: false, durationMs: Date.now() - started, usage, error, fallback: isFallback });
      throw error;
    }
  };

  try {
    return await attempt(primary, false);
  } catch (error) {
    const temporary = error instanceof AIGenerationError && error.retryable;
    if (!temporary || !fallback || !(await providerReady(fallback.provider))) throw error;
    return attempt(fallback, true);
  }
}

// One agent turn on the provider/model configured for Campaign Intelligence (no fallback:
// a run stays on one provider so the conversation history remains consistent).
export async function brainAgentTurn(req: AgentWireRequest & { timeoutMs: number }): Promise<NormalizedTurn & { provider: AIProviderId }> {
  const { primary } = await routeForTask("campaign_intelligence");
  if (!(await providerReady(primary.provider))) {
    throw new IntegrationError(`Connect ${AI_PROVIDER_LABELS[primary.provider]} in Settings → Integrations first.`);
  }
  const turn = await ADAPTERS[primary.provider].agentTurn(req, primary.model);
  return { ...turn, provider: primary.provider };
}

// Refreshes the discovered model list for a provider. Nothing is invented: rows come only
// from the provider's API; models no longer returned are marked unavailable (never deleted,
// so saved selections stay intact). On failure the stored list is left unchanged.
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

// Null when the provider routed for this task is usable; otherwise an admin-safe message.
export async function taskReadiness(task: AITask): Promise<string | null> {
  try {
    const { primary } = await routeForTask(task);
    return (await providerReady(primary.provider)) ? null : `Connect ${AI_PROVIDER_LABELS[primary.provider]} in Settings → Integrations first.`;
  } catch (error) {
    return error instanceof IntegrationError ? error.message : "The AI brain is not configured.";
  }
}
