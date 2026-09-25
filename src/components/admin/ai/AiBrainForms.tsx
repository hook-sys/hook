"use client";

import { useActionState, useState } from "react";
import type { AiSettingsState } from "@/lib/actions/ai-settings";
import { AI_PROVIDERS, AI_PROVIDER_LABELS, AI_TASKS, AI_TASK_LABELS, type AIProviderId, type AITask } from "@/lib/ai/providers/common";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

type Action = (prev: AiSettingsState, formData: FormData) => Promise<AiSettingsState>;

// Only selectable (discovered, available) models are passed in — never keys.
export interface ModelOption {
  provider: AIProviderId;
  id: string;
  name: string;
}

export interface ProviderChoice {
  provider: AIProviderId | "";
  model: string;
}

const initial: AiSettingsState = { status: "idle" };

function Result({ state }: { state: AiSettingsState }) {
  if (!state.message) return null;
  return <p className={state.status === "error" ? "text-sm text-red-600" : "text-sm text-emerald-600"}>{state.message}</p>;
}

// Provider + model pair; the model list is filtered by the selected provider, so a model
// from one provider can't be picked with another (the server re-validates regardless).
function ProviderModelFields({
  prefix,
  value,
  onChange,
  models,
  ready,
  allowDefault,
}: {
  prefix: string;
  value: ProviderChoice;
  onChange: (next: ProviderChoice) => void;
  models: ModelOption[];
  ready: Record<AIProviderId, boolean>;
  allowDefault?: boolean;
}) {
  const options = value.provider ? models.filter((m) => m.provider === value.provider) : [];
  const providerName = prefix ? `${prefix}_provider` : "provider";
  const modelName = prefix ? `${prefix}_model` : "model";
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <Label htmlFor={providerName}>Provider</Label>
        <Select
          id={providerName}
          name={providerName}
          value={value.provider}
          onChange={(e) => {
            const provider = e.target.value as AIProviderId | "";
            const first = models.find((m) => m.provider === provider)?.id ?? "";
            onChange({ provider, model: first });
          }}
        >
          {allowDefault && <option value="">Use default</option>}
          {AI_PROVIDERS.map((p) => (
            <option key={p} value={p} disabled={!ready[p]}>
              {AI_PROVIDER_LABELS[p]}
              {ready[p] ? "" : " (not connected)"}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor={modelName}>Model</Label>
        <Select
          id={modelName}
          name={modelName}
          value={value.model}
          onChange={(e) => onChange({ ...value, model: e.target.value })}
          disabled={!value.provider}
        >
          {!value.provider && <option value="">Default model</option>}
          {value.provider && options.length === 0 && <option value="">No models discovered — refresh the list</option>}
          {options.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name === m.id ? m.id : `${m.name} (${m.id})`}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}

export function DefaultBrainForm({
  action,
  models,
  ready,
  initialValue,
}: {
  action: Action;
  models: ModelOption[];
  ready: Record<AIProviderId, boolean>;
  initialValue: ProviderChoice;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  const [value, setValue] = useState(initialValue);
  return (
    <form action={formAction} className="space-y-3">
      <ProviderModelFields prefix="" value={value} onChange={setValue} models={models} ready={ready} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={pending || !value.model}>
          {pending ? "Saving…" : "Save Default"}
        </Button>
        <Result state={state} />
      </div>
    </form>
  );
}

export function TaskRoutingForm({
  action,
  models,
  ready,
  initialValue,
}: {
  action: Action;
  models: ModelOption[];
  ready: Record<AIProviderId, boolean>;
  initialValue: Record<AITask, ProviderChoice>;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  const [values, setValues] = useState(initialValue);
  return (
    <form action={formAction} className="space-y-5">
      {AI_TASKS.map((task) => (
        <div key={task} className="space-y-2">
          <div>
            <p className="text-sm font-semibold text-slate-900">{AI_TASK_LABELS[task].label}</p>
            <p className="text-xs text-slate-500">{AI_TASK_LABELS[task].description}</p>
          </div>
          <ProviderModelFields
            prefix={task}
            value={values[task]}
            onChange={(next) => setValues((prev) => ({ ...prev, [task]: next }))}
            models={models}
            ready={ready}
            allowDefault
          />
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save Task Routing"}
        </Button>
        <Result state={state} />
      </div>
    </form>
  );
}

export function FallbackForm({
  action,
  models,
  ready,
  initialEnabled,
  initialValue,
}: {
  action: Action;
  models: ModelOption[];
  ready: Record<AIProviderId, boolean>;
  initialEnabled: boolean;
  initialValue: ProviderChoice;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [value, setValue] = useState(initialValue);
  return (
    <form action={formAction} className="space-y-3">
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          name="fallback_enabled"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300"
        />
        AI Fallback {enabled ? "ON" : "OFF"}
      </label>
      <p className="text-xs text-slate-500">
        When ON, a request that fails with a temporary provider error (rate limit, timeout, outage) is retried once on the
        fallback model and logged as a fallback. Invalid output, refusals and missing keys never trigger it. The AI Agent
        never switches providers mid-run.
      </p>
      {enabled && <ProviderModelFields prefix="" value={value} onChange={setValue} models={models} ready={ready} />}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={pending || (enabled && !value.model)}>
          {pending ? "Saving…" : "Save Fallback"}
        </Button>
        <Result state={state} />
      </div>
    </form>
  );
}
