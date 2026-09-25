"use client";

import { useActionState, useState } from "react";
import type { FalSettingsState } from "@/lib/actions/fal-settings";
import { FAL_MODES, FAL_MODE_LABELS, falModelsForMode, type FalModelSelection } from "@/lib/creative/fal-models";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

type Action = (prev: FalSettingsState, formData: FormData) => Promise<FalSettingsState>;

// One Fal.ai model per generation mode; each list only offers models built for that mode.
export function FalModelsForm({ action, initialSelection }: { action: Action; initialSelection: FalModelSelection }) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" });
  const [selection, setSelection] = useState(initialSelection);

  return (
    <form action={formAction} className="space-y-3 border-t border-slate-100 pt-4">
      <p className="text-sm font-semibold text-slate-900">Generation models</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {FAL_MODES.map((mode) => (
          <div key={mode}>
            <Label htmlFor={`fal-${mode}`}>{FAL_MODE_LABELS[mode]}</Label>
            <Select
              id={`fal-${mode}`}
              name={mode}
              value={selection[mode]}
              onChange={(e) => setSelection((prev) => ({ ...prev, [mode]: e.target.value }))}
            >
              {falModelsForMode(mode).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} ({m.id})
                </option>
              ))}
            </Select>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Checking with Fal.ai…" : "Save Fal.ai Models"}
        </Button>
        {state.message && (
          <p className={state.status === "error" ? "text-sm text-red-600" : "text-sm text-emerald-600"}>{state.message}</p>
        )}
      </div>
    </form>
  );
}
