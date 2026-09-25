import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AgentRequestForm } from "@/components/admin/agent/AgentRequestForm";
import { ProviderBanner } from "@/components/admin/ProviderBanner";
import { runAgentAction } from "@/lib/actions/agent";
import { AGENT_LIMITS, toolsFor } from "@/lib/agent/policy";
import { getAiProviderReadiness } from "@/lib/ai/usage";
import { requirePermission } from "@/lib/auth/session";
import { listAgentRuns } from "@/lib/services/agent-runs";
import { getClientById } from "@/lib/services/clients";

// The agent loop is capped at 4 minutes.
export const maxDuration = 300;

const STATUS_VARIANT = { running: "blue", succeeded: "green", failed: "red", stopped: "amber" } as const;
const CALL_VARIANT = { ok: "green", error: "red", denied: "red", skipped: "amber" } as const;

export default async function AiAgentPage({ params }: PageProps<"/admin/clients/[id]/ai-agent">) {
  const profile = await requirePermission("ai_ads");
  const isSuperAdmin = profile.role === "admin";
  const { id } = await params;
  const client = await getClientById(id);
  if (!client) notFound();

  const [readiness, runs] = await Promise.all([getAiProviderReadiness(), listAgentRuns(client.id)]);
  const available = toolsFor(profile.role, profile.permissions, { allowPaidGeneration: true, allowDriveUpload: isSuperAdmin });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">AI Marketing Agent</h1>
        <p className="mt-1 text-sm text-slate-500">
          A controlled assistant for {client.business_name}. It only uses the typed tools below, within your permissions, and every
          result is a draft for human approval.
        </p>
      </div>

      <ProviderBanner provider="Claude" state={readiness.claude} isSuperAdmin={isSuperAdmin} />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>New Request</CardTitle>
          </CardHeader>
          <CardContent className="py-6">
            <AgentRequestForm action={runAgentAction.bind(null, client.id)} isSuperAdmin={isSuperAdmin} disabled={readiness.claude !== "ready"} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Guardrails</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 py-6 text-xs text-slate-600">
            <p>
              Limits per run: {AGENT_LIMITS.maxToolCalls} tool calls, {AGENT_LIMITS.maxPaidToolCalls} paid calls, {AGENT_LIMITS.maxTurns} turns,{" "}
              {AGENT_LIMITS.maxDurationMs / 60000} minutes. Only read tools are retried.
            </p>
            <p>No SQL, web requests, shell, or Meta publishing tools exist.</p>
            <div>
              <p className="mb-1 font-semibold text-slate-500">Tools you can use</p>
              <ul className="flex flex-wrap gap-1">
                {available.map((t) => (
                  <li key={t.name}>
                    <Badge variant={t.kind === "read" ? "slate" : t.kind === "paid" ? "amber" : "blue"}>{t.name}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Activity Log</CardTitle>
        </CardHeader>
        {runs.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">No agent runs yet.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {runs.map((run) => (
              <li key={run.id} className="px-5 py-4">
                <details>
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
                    <Badge variant={STATUS_VARIANT[run.status]}>{run.status}</Badge>
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{run.request}</span>
                    <span className="text-xs text-slate-400">
                      {new Date(run.created_at).toLocaleString()}
                      {run.duration_ms !== null ? ` · ${(run.duration_ms / 1000).toFixed(1)}s` : ""}
                      {` · ${run.tool_calls.length} tool calls`}
                      {run.estimated_cost_usd !== null ? ` · ~$${Number(run.estimated_cost_usd).toFixed(3)} (agent turns)` : ""}
                    </span>
                  </summary>
                  <div className="mt-3 space-y-3">
                    {run.error && <p className="text-sm text-red-600">{run.error}</p>}
                    {run.result && <p className="whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-sm text-slate-700">{run.result}</p>}
                    {run.tool_calls.length > 0 && (
                      <ol className="space-y-2 text-xs">
                        {run.tool_calls.map((call, i) => (
                          <li key={i} className="rounded border border-slate-100 p-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono font-semibold text-slate-700">{call.name}</span>
                              <Badge variant={CALL_VARIANT[call.status]}>{call.status}</Badge>
                              <span className="text-slate-400">
                                {call.durationMs}ms{call.attempts > 1 ? ` · ${call.attempts} attempts` : ""}
                              </span>
                            </div>
                            <p className="mt-1 break-all font-mono text-slate-500">in: {call.input}</p>
                            <p className="mt-1 break-all font-mono text-slate-500">out: {call.output}</p>
                          </li>
                        ))}
                      </ol>
                    )}
                    <p className="text-xs text-slate-400">
                      Paid generation {run.options.allowPaidGeneration ? "allowed" : "not allowed"} · Drive upload{" "}
                      {run.options.allowDriveUpload ? "allowed" : "not allowed"} · {run.turns} turns · tokens {run.input_tokens ?? 0}/
                      {run.output_tokens ?? 0}
                    </p>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
