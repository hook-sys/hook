"use client";

import { useActionState } from "react";
import type { CampaignActionState } from "@/lib/actions/campaigns";
import { Button } from "@/components/ui/button";

type Action = (prev: CampaignActionState, formData: FormData) => Promise<CampaignActionState>;

const initialState: CampaignActionState = { status: "idle" };

export interface PickerCreative {
  id: string;
  label: string;
  media: "image" | "video";
  previewUrl: string | null;
}

export function CampaignCreativePicker({
  action,
  creatives,
  selectedIds,
  editable,
  submitLabel = "Save Creative Selection",
  pendingLabel = "Saving...",
  emptyMessage = "No ready creatives for this client yet. Generate them in the Creative Studio.",
}: {
  action: Action;
  creatives: PickerCreative[];
  selectedIds: string[];
  editable: boolean;
  submitLabel?: string;
  pendingLabel?: string;
  emptyMessage?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  if (creatives.length === 0) {
    return <p className="text-sm text-slate-500">{emptyMessage}</p>;
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {creatives.map((c) => (
          <label
            key={c.id}
            className="flex cursor-pointer gap-3 rounded-md border border-slate-200 p-2 text-xs text-slate-700 has-[:checked]:border-brand-blue has-[:checked]:bg-blue-50"
          >
            <input
              type="checkbox"
              name="creative_ids"
              value={c.id}
              defaultChecked={selectedIds.includes(c.id)}
              disabled={!editable}
              className="mt-1"
            />
            {c.previewUrl && c.media === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element -- provider-hosted asset, shown as-is
              <img src={c.previewUrl} alt="" className="h-14 w-14 shrink-0 rounded bg-slate-100 object-cover" />
            ) : (
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded bg-slate-100 text-[10px] uppercase text-slate-400">
                {c.media}
              </span>
            )}
            <span className="line-clamp-3">{c.label}</span>
          </label>
        ))}
      </div>
      {editable && (
        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" variant="secondary" disabled={pending}>
            {pending ? pendingLabel : submitLabel}
          </Button>
          {state.message && (
            <p className={state.status === "error" ? "text-sm text-red-600" : "text-sm text-emerald-600"}>{state.message}</p>
          )}
        </div>
      )}
    </form>
  );
}
