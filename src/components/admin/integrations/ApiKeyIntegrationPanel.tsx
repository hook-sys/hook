"use client";

import { useActionState, useState } from "react";
import {
  removeApiKey,
  saveApiKey,
  testApiKey,
  type IntegrationActionState,
} from "@/lib/actions/integrations";
import type { ApiKeyProvider } from "@/lib/integrations/types";
import { ActionButton } from "@/components/admin/ActionButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: IntegrationActionState = { status: "idle" };

export function ApiKeyIntegrationPanel({
  provider,
  label,
  keyHint,
  lastTested,
  lastError,
}: {
  provider: ApiKeyProvider;
  label: string;
  keyHint: string | null;
  lastTested: string | null;
  lastError: string | null;
}) {
  // Replace mode is tied to the key being replaced, so it closes once a new key is saved
  // (the masked hint changes) but stays open if the save fails.
  const [replacingHint, setReplacingHint] = useState<string | null>(null);
  const replacing = keyHint !== null && replacingHint === keyHint;
  const [saveState, saveAction, saving] = useActionState(saveApiKey.bind(null, provider), initialState);
  const showForm = !keyHint || replacing;

  return (
    <div className="space-y-4">
      {keyHint && (
        <div className="space-y-1 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-slate-500">API key</span>
            <code className="font-mono text-slate-900">{keyHint}</code>
          </div>
          {lastTested && (
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Last tested</span>
              <span className="text-slate-900">{lastTested}</span>
            </div>
          )}
          {lastError && <p className="text-red-600">{lastError}</p>}
        </div>
      )}

      {showForm && (
        <form action={saveAction} className="space-y-2">
          <Label htmlFor={`${provider}-api-key`}>{keyHint ? `New ${label} API key` : `${label} API key`}</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id={`${provider}-api-key`}
              name="api_key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              required
              placeholder="Paste API key"
            />
            <Button type="submit" size="md" disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
          <p className="text-xs text-slate-400">Stored encrypted on the server. It is never shown again after saving.</p>
        </form>
      )}
      {saveState.message && (saveState.status === "error" || !lastTested) && (
        <p className={saveState.status === "error" ? "text-sm text-red-600" : "text-sm text-emerald-600"}>
          {saveState.message}
        </p>
      )}

      {keyHint && (
        <div className="flex flex-wrap items-start gap-2">
          <ActionButton
            action={testApiKey.bind(null, provider)}
            label="Test Connection"
            pendingLabel="Testing..."
            variant="secondary"
            showResult={false}
          />
          {!replacing && (
            <Button type="button" size="sm" variant="outline" onClick={() => setReplacingHint(keyHint)}>
              Replace Key
            </Button>
          )}
          <ActionButton
            action={removeApiKey.bind(null, provider)}
            label="Remove"
            pendingLabel="Removing..."
            variant="ghost"
            confirmMessage={`Remove the ${label} API key?`}
          />
        </div>
      )}
    </div>
  );
}
