import Link from "next/link";
import { ActionButton } from "@/components/admin/ActionButton";
import { DefaultBrainForm, FallbackForm, TaskRoutingForm, type ModelOption, type ProviderChoice } from "@/components/admin/ai/AiBrainForms";
import { formatTimestamp, STATUS_BADGE } from "@/components/admin/integrations/IntegrationCard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { refreshModelsAction, saveDefaultBrainAction, saveFallbackAction, saveTaskRoutingAction } from "@/lib/actions/ai-settings";
import { loadBrainConfig } from "@/lib/ai/brain";
import {
  AI_PROVIDERS,
  AI_PROVIDER_LABELS,
  AI_TASKS,
  LEGACY_CLAUDE_MODEL,
  selectableModels,
  type AIProviderId,
  type AITask,
  type StoredModel,
} from "@/lib/ai/providers/common";
import { requireSuperAdmin } from "@/lib/auth/session";
import { listIntegrations } from "@/lib/integrations/store";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

// Super Admin only. The browser receives provider status and discovered model IDs — never keys.
export default async function AiBrainSettingsPage() {
  await requireSuperAdmin();
  const supabase = await createClient();
  const [integrations, config, modelRows] = await Promise.all([
    listIntegrations(),
    loadBrainConfig(),
    supabase
      .from("ai_provider_models")
      .select("provider, model_id, display_name, is_available, supports_structured, fetched_at")
      .order("model_id"),
  ]);

  const stored = (modelRows.data ?? []) as (StoredModel & { fetched_at: string })[];
  const ready = Object.fromEntries(
    AI_PROVIDERS.map((p) => [p, integrations[p].status === "connected" || integrations[p].status === "configured"])
  ) as Record<AIProviderId, boolean>;
  const options: ModelOption[] = AI_PROVIDERS.flatMap((p) =>
    ready[p] ? selectableModels(stored, p).map((m) => ({ provider: p, id: m.model_id, name: m.display_name })) : []
  );

  // Pre-select the saved model only if it's still selectable; otherwise the first discovered one.
  const choice = (provider: AIProviderId | null, model: string | null | undefined): ProviderChoice => {
    if (!provider) return { provider: "", model: "" };
    const own = options.filter((m) => m.provider === provider);
    return { provider, model: own.some((m) => m.id === model) ? (model as string) : (own[0]?.id ?? "") };
  };

  const defaultModel = config.providerDefaults[config.defaultProvider];
  const taskInitial = Object.fromEntries(
    AI_TASKS.map((t) => {
      const route = config.tasks[t];
      return [t, route?.enabled ? choice(route.provider, route.model) : { provider: "", model: "" }];
    })
  ) as Record<AITask, ProviderChoice>;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/settings" className="text-sm text-brand-blue hover:underline">
          &larr; Settings
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">AI Brain</h1>
        <p className="mt-1 text-sm text-slate-500">
          Choose which AI provider and model power strategy, content, the AI Agent, reports and creative briefs. API keys are
          managed in{" "}
          <Link href="/admin/settings/integrations" className="text-brand-blue hover:underline">
            Integrations
          </Link>
          . Fal.ai media generation is separate.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Providers &amp; Models</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 py-5 md:grid-cols-3">
          {AI_PROVIDERS.map((p) => {
            const rows = stored.filter((m) => m.provider === p);
            const available = rows.filter((m) => m.is_available).length;
            const fetched = rows.reduce<string | null>((latest, m) => (!latest || m.fetched_at > latest ? m.fetched_at : latest), null);
            const badge = STATUS_BADGE[integrations[p].status];
            return (
              <div key={p} className="space-y-2 rounded-md border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-slate-900">{AI_PROVIDER_LABELS[p]}</p>
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                </div>
                <p className="text-sm text-slate-600">
                  {available} model{available === 1 ? "" : "s"} available
                  {fetched && <span className="block text-xs text-slate-400">Refreshed {formatTimestamp(fetched)}</span>}
                </p>
                {ready[p] ? (
                  <ActionButton action={refreshModelsAction.bind(null, p)} label="Refresh Models" pendingLabel="Refreshing…" />
                ) : (
                  <p className="text-xs text-slate-400">Connect in Integrations to load models.</p>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Default Provider &amp; Model</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 py-5">
          <p className="text-sm text-slate-500">
            Current: {AI_PROVIDER_LABELS[config.defaultProvider]} ·{" "}
            {defaultModel ?? (config.defaultProvider === "claude" ? `${LEGACY_CLAUDE_MODEL} (built-in default)` : "no model selected")}
            . Used by every task without a task-specific model.
          </p>
          <DefaultBrainForm
            action={saveDefaultBrainAction}
            models={options}
            ready={ready}
            initialValue={choice(config.defaultProvider, defaultModel)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Task-Specific Models</CardTitle>
        </CardHeader>
        <CardContent className="py-5">
          <TaskRoutingForm action={saveTaskRoutingAction} models={options} ready={ready} initialValue={taskInitial} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI Fallback</CardTitle>
        </CardHeader>
        <CardContent className="py-5">
          <FallbackForm
            action={saveFallbackAction}
            models={options}
            ready={ready}
            initialEnabled={config.fallback.enabled}
            initialValue={choice(config.fallback.provider ?? AI_PROVIDERS.find((p) => ready[p]) ?? null, config.fallback.model)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
