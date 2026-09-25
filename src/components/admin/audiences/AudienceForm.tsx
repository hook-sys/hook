"use client";

import { useActionState, useState } from "react";
import type { AudienceActionState } from "@/lib/actions/audiences";
import {
  AUDIENCE_TYPES,
  AUDIENCE_TYPE_LABELS,
  NOT_AUTOMATED_MESSAGE,
  RETENTION_DAYS,
  audienceSourceKind,
  type AudienceType,
} from "@/lib/meta/audiences";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { HATOG_STAGE_KEYS, HATOG_STAGE_LABELS } from "@/types/ai";

type Action = (prev: AudienceActionState, formData: FormData) => Promise<AudienceActionState>;

export function AudienceForm({
  action,
  initial,
  submitLabel,
}: {
  action: Action;
  initial?: Record<string, string>;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" });
  const [values, setValues] = useState<Record<string, string>>(
    initial ?? { name: "", audience_type: "website_visitors", retention_days: "30", hatog_stage: "", source: "", description: "" }
  );
  const bind = (name: string) => ({
    id: `${name}-${initial ? "edit" : "new"}`,
    name,
    value: values[name] ?? "",
    onChange: (e: { target: { value: string } }) => setValues((v) => ({ ...v, [name]: e.target.value })),
  });
  const kind = audienceSourceKind(values.audience_type as AudienceType);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor={`name-${initial ? "edit" : "new"}`}>Name</Label>
          <Input maxLength={200} {...bind("name")} />
        </div>
        <div>
          <Label htmlFor={`audience_type-${initial ? "edit" : "new"}`}>Type</Label>
          <Select {...bind("audience_type")}>
            {AUDIENCE_TYPES.map((t) => (
              <option key={t} value={t}>
                {AUDIENCE_TYPE_LABELS[t]}
                {audienceSourceKind(t) === "none" ? ` (${NOT_AUTOMATED_MESSAGE.toLowerCase()} in Meta)` : ""}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor={`retention_days-${initial ? "edit" : "new"}`}>Retention Window</Label>
          <Select {...bind("retention_days")}>
            {RETENTION_DAYS.map((d) => (
              <option key={d} value={d}>
                {d} days
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor={`hatog_stage-${initial ? "edit" : "new"}`}>Funnel Stage</Label>
          <Select {...bind("hatog_stage")}>
            <option value="">—</option>
            {HATOG_STAGE_KEYS.map((k) => (
              <option key={k} value={k}>
                {HATOG_STAGE_LABELS[k]}
              </option>
            ))}
          </Select>
        </div>
        {kind === "pixel" && (
          <div className="sm:col-span-2">
            <Label htmlFor={`source-${initial ? "edit" : "new"}`}>Meta Pixel ID</Label>
            <Input inputMode="numeric" maxLength={30} placeholder="e.g. 123456789012345" {...bind("source")} />
            <p className="mt-1 text-xs text-slate-400">Required before this audience can be created in Meta.</p>
          </div>
        )}
        {(kind === "page" || kind === "instagram") && (
          <p className="text-xs text-slate-500 sm:col-span-2">
            Source: the client&apos;s assigned {kind === "page" ? "Facebook Page" : "Instagram account"}.
          </p>
        )}
        <div className="sm:col-span-2">
          <Label htmlFor={`description-${initial ? "edit" : "new"}`}>Description</Label>
          <Textarea rows={2} maxLength={1000} {...bind("description")} />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving..." : submitLabel}
        </Button>
        {state.message && (
          <p className={state.status === "error" ? "text-sm text-red-600" : "text-sm text-emerald-600"}>{state.message}</p>
        )}
      </div>
    </form>
  );
}
