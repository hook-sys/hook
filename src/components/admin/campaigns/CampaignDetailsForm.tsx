"use client";

import { useActionState, useState } from "react";
import type { CampaignActionState } from "@/lib/actions/campaigns";
import { META_CTAS, META_OBJECTIVES, META_OBJECTIVE_LABELS } from "@/lib/ai/campaign-strategy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type Action = (prev: CampaignActionState, formData: FormData) => Promise<CampaignActionState>;

const initialState: CampaignActionState = { status: "idle" };

export interface CampaignDetailsValues {
  name: string;
  objective: string;
  daily_budget: string;
  budget_currency: string;
  primary_text: string;
  headline: string;
  description: string;
  cta: string;
}

export function CampaignDetailsForm({
  action,
  initial,
  editable,
}: {
  action: Action;
  initial: CampaignDetailsValues;
  editable: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  // Controlled so edits survive React's post-action form reset when validation fails.
  const [values, setValues] = useState(initial);
  const bind = (key: keyof CampaignDetailsValues) => ({
    id: key,
    name: key,
    value: values[key],
    disabled: !editable,
    onChange: (e: { target: { value: string } }) => setValues((v) => ({ ...v, [key]: e.target.value })),
  });

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="name">Campaign Name</Label>
          <Input maxLength={200} {...bind("name")} />
        </div>
        <div>
          <Label htmlFor="objective">Objective</Label>
          <Select {...bind("objective")}>
            {META_OBJECTIVES.map((o) => (
              <option key={o} value={o}>
                {META_OBJECTIVE_LABELS[o]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="cta">Call to Action</Label>
          <Select {...bind("cta")}>
            <option value="">Select a CTA</option>
            {META_CTAS.map((c) => (
              <option key={c} value={c}>
                {c.replaceAll("_", " ")}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="daily_budget">Daily Budget</Label>
          <Input inputMode="decimal" {...bind("daily_budget")} />
        </div>
        <div>
          <Label htmlFor="budget_currency">Currency</Label>
          <Input maxLength={3} {...bind("budget_currency")} />
          <p className="mt-1 text-xs text-slate-400">Must match the Meta ad account currency.</p>
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="primary_text">Primary Text</Label>
          <Textarea rows={4} maxLength={2000} {...bind("primary_text")} />
        </div>
        <div>
          <Label htmlFor="headline">Headline</Label>
          <Input maxLength={255} {...bind("headline")} />
        </div>
        <div>
          <Label htmlFor="description">Description</Label>
          <Input maxLength={255} {...bind("description")} />
        </div>
      </div>

      {editable ? (
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving..." : "Save Campaign"}
          </Button>
          {state.message && (
            <p className={state.status === "error" ? "text-sm text-red-600" : "text-sm text-emerald-600"}>{state.message}</p>
          )}
        </div>
      ) : (
        <p className="text-xs text-slate-500">Move the campaign back to Draft to edit it.</p>
      )}
    </form>
  );
}
