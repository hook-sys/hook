import { loadBrainConfig } from "@/lib/ai/brain";
import { AI_PROVIDER_LABELS, resolveRoute, type AIProviderId, type AITask } from "@/lib/ai/providers/common";
import { getIntegration } from "@/lib/integrations/store";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export interface GenerationLogEntry {
  clientId: string;
  productId: string | null;
  creativeId?: string | null;
  campaignId?: string | null;
  provider: "anthropic" | "openai" | "gemini" | "fal";
  model: string;
  generationType:
    | "creative_brief"
    | "campaign_strategy"
    | "image"
    | "video"
    | "content_calendar"
    | "calendar_item"
    | "marketing_report"
    | "agent";
  status: "succeeded" | "failed" | "submitted";
  inputTokens?: number | null;
  outputTokens?: number | null;
  units?: number | null;
  estimatedCostUsd?: number | null;
  actorId: string;
  task?: AITask | null;
  durationMs?: number | null;
}

// Usage tracking must never break a generation: failures are logged and swallowed.
export async function logGeneration(entry: GenerationLogEntry): Promise<void> {
  const { error } = await createAdminClient().from("ai_generation_logs").insert({
    client_id: entry.clientId,
    product_id: entry.productId,
    creative_id: entry.creativeId ?? null,
    campaign_id: entry.campaignId ?? null,
    provider: entry.provider,
    model: entry.model,
    generation_type: entry.generationType,
    status: entry.status,
    task: entry.task ?? null,
    duration_ms: entry.durationMs ?? null,
    input_tokens: entry.inputTokens ?? null,
    output_tokens: entry.outputTokens ?? null,
    units: entry.units ?? null,
    estimated_cost_usd: entry.estimatedCostUsd ?? null,
    created_by: entry.actorId,
  });
  if (error) console.error("AI usage log failed:", error.message);
}

// Guard against accidental loops / runaway spend: caps paid AI calls per client per hour.
// Counted server-side from the usage log (service role), so it can't be bypassed by the UI.
export const AI_HOURLY_CALL_LIMIT = Math.max(1, Number(process.env.AI_HOURLY_CALL_LIMIT) || 60);

export class AiRateLimitError extends Error {}

export async function enforceAiRateLimit(clientId: string): Promise<void> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await createAdminClient()
    .from("ai_generation_logs")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .gte("created_at", since);
  if (error) throw new AiRateLimitError("Could not verify the AI usage limit. Try again.");
  if ((count ?? 0) >= AI_HOURLY_CALL_LIMIT) {
    throw new AiRateLimitError(`AI usage limit reached for this client (${AI_HOURLY_CALL_LIMIT} calls/hour). Try again later.`);
  }
}

export interface UsageSummary {
  anthropic: { calls: number; costUsd: number };
  openai: { calls: number; costUsd: number };
  gemini: { calls: number; costUsd: number };
  fal: { calls: number; costUsd: number };
}

// Caller's session: RLS returns usage rows to super admins only (others get zeros).
export async function getClientUsageSummary(clientId: string, sinceDays = 30): Promise<UsageSummary> {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();
  const supabase = await createClient();
  const { data } = await supabase
    .from("ai_generation_logs")
    .select("provider, estimated_cost_usd")
    .eq("client_id", clientId)
    .gte("created_at", since)
    .limit(5000);

  const summary: UsageSummary = {
    anthropic: { calls: 0, costUsd: 0 },
    openai: { calls: 0, costUsd: 0 },
    gemini: { calls: 0, costUsd: 0 },
    fal: { calls: 0, costUsd: 0 },
  };
  for (const row of data ?? []) {
    const bucket = summary[row.provider as keyof UsageSummary];
    if (!bucket) continue;
    bucket.calls++;
    bucket.costUsd += Number(row.estimated_cost_usd ?? 0);
  }
  return summary;
}

export type ProviderReadiness = "ready" | "not_configured" | "error";

export interface AiReadiness {
  claude: ProviderReadiness;
  openai: ProviderReadiness;
  gemini: ProviderReadiness;
  fal: ProviderReadiness;
  // The globally selected AI brain provider (used by every page that needs the AI brain).
  brain: ProviderReadiness;
  brainProvider: AIProviderId;
  brainLabel: string;
  // Set when no model is selected for that provider.
  brainDetail?: string;
}

// A saved key (tested or not) is usable; a key that failed its last test is not.
export async function getAiProviderReadiness(): Promise<AiReadiness> {
  const [claude, openai, gemini, fal, config] = await Promise.all([
    getIntegration("claude"),
    getIntegration("openai"),
    getIntegration("gemini"),
    getIntegration("fal"),
    loadBrainConfig(),
  ]);
  const state = (status: string): ProviderReadiness =>
    status === "connected" || status === "configured" ? "ready" : status === "error" ? "error" : "not_configured";
  const providers = { claude: state(claude.status), openai: state(openai.status), gemini: state(gemini.status) };
  const brainProvider = config.provider;
  const route = resolveRoute(config);
  return {
    ...providers,
    fal: state(fal.status),
    brain: route.ok ? providers[brainProvider] : "not_configured",
    brainProvider,
    brainLabel: AI_PROVIDER_LABELS[brainProvider],
    ...(route.ok ? {} : { brainDetail: route.error }),
  };
}
