import { brainStructured } from "@/lib/ai/brain";
import { AIGenerationError, AI_PROVIDER_LABELS, LOG_PROVIDER, estimateCostUsd, taskForGeneration, type AIProviderId, type StructuredResult } from "@/lib/ai/providers/common";
import { AiRateLimitError, enforceAiRateLimit, logGeneration, type GenerationLogEntry } from "@/lib/ai/usage";
import { AiContextError } from "@/lib/ai/context";
import { IntegrationError } from "@/lib/integrations/types";
import { logEvent } from "@/lib/observability";

// Server-only: per-client rate limit + structured generation on the AI brain provider/model
// the Super Admin selected (one for all tasks) + usage log for every call.
// Every AI feature goes through here, so context/prompts are identical for all providers.
export async function generateAndLog<T>(options: {
  clientId: string;
  actorId: string;
  productId?: string | null;
  campaignId?: string | null;
  generationType: GenerationLogEntry["generationType"];
  system: string;
  user: string;
  schema: Record<string, unknown>;
  maxTokens: number;
  timeoutMs?: number;
  validate: (value: unknown) => { ok: true; value: T } | { ok: false; error: string };
}): Promise<StructuredResult<T> & { provider: AIProviderId }> {
  const task = taskForGeneration(options.generationType);
  if (!task) throw new IntegrationError("This generation type is not routed to an AI provider.");
  await enforceAiRateLimit(options.clientId);

  const result = await brainStructured(options, async (attempt) => {
    const usage = attempt.usage;
    const model = usage?.model ?? attempt.ref.model;
    await logGeneration({
      clientId: options.clientId,
      productId: options.productId ?? null,
      campaignId: options.campaignId ?? null,
      provider: LOG_PROVIDER[attempt.ref.provider],
      model,
      generationType: options.generationType,
      task,
      status: attempt.ok ? "succeeded" : "failed",
      inputTokens: usage?.inputTokens,
      outputTokens: usage?.outputTokens,
      estimatedCostUsd: usage ? estimateCostUsd(attempt.ref.provider, usage.model, usage.inputTokens, usage.outputTokens) : null,
      durationMs: attempt.durationMs,
      actorId: options.actorId,
    });
    logEvent(attempt.ok ? "info" : "warn", {
      provider: attempt.ref.provider,
      operation: options.generationType,
      clientId: options.clientId,
      userId: options.actorId,
      status: attempt.ok ? "succeeded" : "failed",
      durationMs: attempt.durationMs,
      error: attempt.ok ? undefined : attempt.error instanceof Error ? attempt.error.message : "unknown",
    });
  });
  return { data: result.data, model: result.model, inputTokens: result.inputTokens, outputTokens: result.outputTokens, provider: result.provider };
}

// Admin-safe message for anything thrown by the AI pipeline.
export function aiErrorMessage(error: unknown, fallback: string): string {
  if (
    error instanceof IntegrationError ||
    error instanceof AIGenerationError ||
    error instanceof AiContextError ||
    error instanceof AiRateLimitError
  ) {
    return error.message;
  }
  logEvent("error", { operation: "ai", status: "error", error: error instanceof Error ? error.message : "unknown" });
  return fallback;
}

export { AI_PROVIDER_LABELS };
