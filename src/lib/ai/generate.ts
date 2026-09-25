import {
  CLAUDE_MODEL,
  ClaudeGenerationError,
  estimateClaudeCostUsd,
  generateStructured,
  type StructuredResult,
} from "@/lib/ai/claude-json";
import { AiRateLimitError, enforceAiRateLimit, getAiProviderReadiness, logGeneration, type GenerationLogEntry } from "@/lib/ai/usage";
import { AiContextError } from "@/lib/ai/context";
import { IntegrationError } from "@/lib/integrations/types";
import { logEvent } from "@/lib/observability";

// Server-only: readiness check + per-client rate limit + structured Claude call + usage log.
// Every Claude feature added after Phase 9 goes through here.
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
}): Promise<StructuredResult<T>> {
  const readiness = await getAiProviderReadiness();
  if (readiness.claude !== "ready") throw new IntegrationError("Connect Claude in Settings → Integrations first.");
  await enforceAiRateLimit(options.clientId);

  const started = Date.now();
  const base = {
    clientId: options.clientId,
    productId: options.productId ?? null,
    campaignId: options.campaignId ?? null,
    provider: "anthropic" as const,
    generationType: options.generationType,
    actorId: options.actorId,
  };

  try {
    const result = await generateStructured(options);
    await logGeneration({
      ...base,
      model: result.model,
      status: "succeeded",
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      estimatedCostUsd: estimateClaudeCostUsd(result.model, result.inputTokens, result.outputTokens),
    });
    logEvent("info", { provider: "anthropic", operation: options.generationType, clientId: options.clientId, userId: options.actorId, status: "succeeded", durationMs: Date.now() - started });
    return result;
  } catch (error) {
    const usage = error instanceof ClaudeGenerationError ? error.usage : null;
    await logGeneration({
      ...base,
      model: usage?.model ?? CLAUDE_MODEL,
      status: "failed",
      inputTokens: usage?.inputTokens,
      outputTokens: usage?.outputTokens,
      estimatedCostUsd: usage ? estimateClaudeCostUsd(usage.model, usage.inputTokens, usage.outputTokens) : null,
    });
    logEvent("warn", {
      provider: "anthropic",
      operation: options.generationType,
      clientId: options.clientId,
      userId: options.actorId,
      status: "failed",
      durationMs: Date.now() - started,
      error: error instanceof Error ? error.message : "unknown",
    });
    throw error;
  }
}

// Admin-safe message for anything thrown by the AI pipeline.
export function aiErrorMessage(error: unknown, fallback: string): string {
  if (
    error instanceof IntegrationError ||
    error instanceof ClaudeGenerationError ||
    error instanceof AiContextError ||
    error instanceof AiRateLimitError
  ) {
    return error.message;
  }
  logEvent("error", { operation: "ai", status: "error", error: error instanceof Error ? error.message : "unknown" });
  return fallback;
}
