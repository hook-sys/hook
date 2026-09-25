"use client";

import { useActionState, useState } from "react";
import type { AiSettingsState } from "@/lib/actions/ai-settings";
import { AI_PROVIDERS, AI_PROVIDER_LABELS, type AIProviderId } from "@/lib/ai/providers/common";
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

// One provider + one model for every AI brain feature. The model list is filtered by the
// selected provider, so a model from one provider can't be picked with another (the server
// re-validates regardless).
export function AiBrainForm({
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
  const options = value.provider ? models.filter((m) => m.provider === value.provider) : [];

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="provider">AI Brain Provider</Label>
          <Select
            id="provider"
            name="provider"
            value={value.provider}
            onChange={(e) => {
              const provider = e.target.value as AIProviderId | "";
              setValue({ provider, model: models.find((m) => m.provider === provider)?.id ?? "" });
            }}
          >
            {!value.provider && <option value="">Select a provider</option>}
            {AI_PROVIDERS.map((p) => (
              <option key={p} value={p} disabled={!ready[p]}>
                {AI_PROVIDER_LABELS[p]}
                {ready[p] ? "" : " (not connected)"}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="model">AI Brain Model</Label>
          <Select
            id="model"
            name="model"
            value={value.model}
            onChange={(e) => setValue({ ...value, model: e.target.value })}
            disabled={!value.provider}
          >
            {options.length === 0 && <option value="">{value.provider ? "No models discovered — refresh the list" : "Select a provider first"}</option>}
            {options.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name === m.id ? m.id : `${m.name} (${m.id})`}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={pending || !value.model}>
          {pending ? "Saving…" : "Save AI Brain"}
        </Button>
        {state.message && (
          <p className={state.status === "error" ? "text-sm text-red-600" : "text-sm text-emerald-600"}>{state.message}</p>
        )}
      </div>
    </form>
  );
}
