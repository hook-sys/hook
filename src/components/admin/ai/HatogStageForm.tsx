"use client";

import { useActionState } from "react";
import { saveHatogStage, type AiActionState } from "@/lib/actions/ai";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { HatogStage } from "@/types/ai";

const initialState: AiActionState = { status: "idle" };

const TEXT_FIELDS = [
  { name: "objective", label: "Objective", rows: 2 },
  { name: "description", label: "Description", rows: 3 },
  { name: "audience", label: "Audience", rows: 2 },
  { name: "content_direction", label: "Content Direction", rows: 3 },
  { name: "ad_direction", label: "Ad Direction", rows: 3 },
  { name: "ai_instructions", label: "AI Instructions", rows: 4 },
] as const;

export function HatogStageForm({ stage }: { stage: HatogStage }) {
  const [state, formAction, pending] = useActionState(saveHatogStage.bind(null, stage.key), initialState);
  const id = (field: string) => `${stage.key}-${field}`;

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <Label htmlFor={id("name")}>Stage Name</Label>
          <Input id={id("name")} name="name" required maxLength={100} defaultValue={state.values?.name ?? stage.name} />
        </div>
        <label className="flex h-11 items-center gap-2 text-sm font-medium text-slate-700">
          <input type="checkbox" name="enabled" defaultChecked={state.values ? state.values.enabled === "on" : stage.enabled} className="h-4 w-4" />
          Enabled
        </label>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {TEXT_FIELDS.map((f) => (
          <div key={f.name}>
            <Label htmlFor={id(f.name)}>{f.label}</Label>
            <Textarea id={id(f.name)} name={f.name} rows={f.rows} defaultValue={state.values?.[f.name] ?? stage[f.name] ?? ""} />
          </div>
        ))}
      </div>
      <div>
        <Label htmlFor={id("example_ideas")}>Example Ideas</Label>
        <Textarea
          id={id("example_ideas")}
          name="example_ideas"
          rows={3}
          defaultValue={state.values?.example_ideas ?? stage.example_ideas.join("\n")}
          placeholder="One idea per line"
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving..." : `Save ${stage.letter} — ${stage.name}`}
        </Button>
        {!pending && state.message && (
          <p className={state.status === "error" ? "text-sm text-red-600" : "text-sm text-emerald-600"}>{state.message}</p>
        )}
      </div>
    </form>
  );
}
