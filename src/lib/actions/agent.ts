"use server";

import { revalidatePath } from "next/cache";
import { createAgentModelCaller } from "@/lib/agent/model";
import { AGENT_LIMITS, type AgentOptions } from "@/lib/agent/policy";
import { runAgentLoop } from "@/lib/agent/runner";
import { createToolExecutor } from "@/lib/agent/tools";
import { providerReady, routeForTask } from "@/lib/ai/brain";
import { AI_PROVIDER_LABELS, LOG_PROVIDER, estimateCostUsd } from "@/lib/ai/providers/common";
import { IntegrationError } from "@/lib/integrations/types";
import { enforceAiRateLimit, logGeneration } from "@/lib/ai/usage";
import { requirePermission } from "@/lib/auth/session";
import { logEvent } from "@/lib/observability";
import { getClientById } from "@/lib/services/clients";
import { createAdminClient } from "@/lib/supabase/admin";

export interface AgentActionState {
  status: "idle" | "error" | "success";
  message?: string;
  runId?: string;
}

export async function runAgentAction(clientId: string, _prev: AgentActionState, formData: FormData): Promise<AgentActionState> {
  const profile = await requirePermission("ai_ads");
  const client = await getClientById(clientId);
  if (!client) return { status: "error", message: "Client not found." };

  const request = String(formData.get("request") ?? "").trim();
  if (!request) return { status: "error", message: "Describe what you want the agent to do." };
  if (request.length > AGENT_LIMITS.maxRequestChars) return { status: "error", message: `Keep the request under ${AGENT_LIMITS.maxRequestChars} characters.` };
  // The agent runs on the provider/model configured for "Campaign Intelligence".
  try {
    const { primary } = await routeForTask("campaign_intelligence");
    if (!(await providerReady(primary.provider))) {
      return { status: "error", message: `Connect ${AI_PROVIDER_LABELS[primary.provider]} in Settings → Integrations first.` };
    }
  } catch (error) {
    return { status: "error", message: error instanceof IntegrationError ? error.message : "The AI brain is not configured." };
  }

  const options: AgentOptions = {
    allowPaidGeneration: formData.get("allow_paid_generation") === "on",
    // Drive uploads are super-admin only, regardless of the checkbox.
    allowDriveUpload: profile.role === "admin" && formData.get("allow_drive_upload") === "on",
  };

  const admin = createAdminClient();
  // One active run per user and client (prevents accidental parallel loops).
  const { count } = await admin
    .from("agent_runs")
    .select("id", { count: "exact", head: true })
    .eq("client_id", client.id)
    .eq("user_id", profile.id)
    .eq("status", "running")
    .gte("created_at", new Date(Date.now() - 10 * 60 * 1000).toISOString());
  if ((count ?? 0) > 0) return { status: "error", message: "An agent run is already in progress for this client." };

  const { data: run, error } = await admin
    .from("agent_runs")
    .insert({ client_id: client.id, user_id: profile.id, request, options, status: "running" })
    .select("id")
    .single();
  if (error || !run) return { status: "error", message: "Could not start the agent run." };

  const model = createAgentModelCaller();
  const started = Date.now();
  const outcome = await runAgentLoop({
    request,
    role: profile.role,
    permissions: profile.permissions,
    options,
    callModel: model.callModel,
    executeTool: createToolExecutor(profile, client.id),
    beforeTurn: () => enforceAiRateLimit(client.id),
  });

  const provider = model.provider;
  const cost = outcome.model && provider ? estimateCostUsd(provider, outcome.model, outcome.inputTokens, outcome.outputTokens) : null;
  await admin
    .from("agent_runs")
    .update({
      status: outcome.status,
      result: outcome.result.slice(0, 20000),
      error: outcome.error?.slice(0, 1000) ?? null,
      tool_calls: outcome.toolCalls,
      turns: outcome.turns,
      duration_ms: outcome.durationMs,
      input_tokens: outcome.inputTokens,
      output_tokens: outcome.outputTokens,
      estimated_cost_usd: cost,
      finished_at: new Date().toISOString(),
    })
    .eq("id", run.id);
  if (outcome.model && provider) {
    await logGeneration({
      clientId: client.id,
      productId: null,
      provider: LOG_PROVIDER[provider],
      task: "campaign_intelligence",
      durationMs: Date.now() - started,
      model: outcome.model,
      generationType: "agent",
      status: outcome.status === "failed" ? "failed" : "succeeded",
      inputTokens: outcome.inputTokens,
      outputTokens: outcome.outputTokens,
      estimatedCostUsd: cost,
      actorId: profile.id,
    });
  }
  logEvent(outcome.status === "failed" ? "warn" : "info", {
    provider: provider ?? "unknown",
    operation: "agent_run",
    clientId: client.id,
    userId: profile.id,
    status: outcome.status,
    durationMs: outcome.durationMs,
    error: outcome.error ?? undefined,
  });

  revalidatePath(`/admin/clients/${client.id}/ai-agent`);
  return {
    status: outcome.status === "failed" ? "error" : "success",
    message: outcome.status === "succeeded" ? "Agent finished." : `Agent ${outcome.status}: ${outcome.error ?? ""}`.trim(),
    runId: run.id,
  };
}
