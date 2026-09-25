"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { CampaignActionState } from "@/lib/actions/campaigns";
import { CREATIVE_FORMATS } from "@/lib/creative/options";
import type { DriveAssetSummary } from "@/lib/drive/media-types";
import { DriveAssetPicker, type PickerSource } from "@/components/admin/drive/DriveAssetPicker";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { HATOG_STAGE_KEYS, HATOG_STAGE_LABELS } from "@/types/ai";

type Action = (prev: CampaignActionState, formData: FormData) => Promise<CampaignActionState>;

// Ad creative source: generate a new creative (AI brain + Fal.ai, in Creative Studio) or use
// an existing image/video from the client's configured Google Drive sources (no generation).
export function CampaignCreativeSource({
  clientId,
  studioHref,
  sources,
  action,
  defaultHatogStage,
}: {
  clientId: string;
  studioHref: string;
  sources: PickerSource[];
  action: Action;
  defaultHatogStage: string | null;
}) {
  const [mode, setMode] = useState<"generate" | "drive">(sources.length ? "drive" : "generate");
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? "");
  const [asset, setAsset] = useState<DriveAssetSummary | null>(null);
  const [state, formAction, pending] = useActionState(action, { status: "idle" });

  return (
    <div className="space-y-3 rounded-md border border-slate-200 p-3">
      <p className="text-sm font-semibold text-slate-900">Creative Source</p>
      <div className="flex flex-wrap gap-4 text-sm text-slate-700">
        <label className="flex items-center gap-2">
          <input type="radio" name="creative_source_mode" checked={mode === "generate"} onChange={() => setMode("generate")} />
          Generate new creative
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="creative_source_mode" checked={mode === "drive"} onChange={() => setMode("drive")} />
          Use existing Drive creative
        </label>
      </div>

      {mode === "generate" ? (
        <p className="text-sm text-slate-600">
          New creatives are made in{" "}
          <Link href={studioHref} className="text-brand-blue hover:underline">
            Creative Studio
          </Link>{" "}
          (client context → selected AI brain model → brief → selected Fal.ai model). Ready creatives then appear in the list
          below to select.
        </p>
      ) : sources.length === 0 ? (
        <p className="text-sm text-slate-500">No Google Drive sources are configured for this client (client profile → Google Drive Sources).</p>
      ) : (
        <form action={formAction} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="drive-source">Google Drive Source</Label>
              <Select
                id="drive-source"
                value={sourceId}
                onChange={(e) => {
                  setSourceId(e.target.value);
                  setAsset(null);
                }}
              >
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="drive-format">Format</Label>
              <Select id="drive-format" name="format" defaultValue="1:1">
                {CREATIVE_FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="drive-hatog">HATOG Stage</Label>
              <Select id="drive-hatog" name="hatog_stage" defaultValue={defaultHatogStage ?? "hook"}>
                {HATOG_STAGE_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {HATOG_STAGE_LABELS[k]}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <Label>Asset</Label>
            <DriveAssetPicker
              key={sourceId}
              clientId={clientId}
              sources={sources}
              sourceId={sourceId}
              namePrefix="drive_creative"
              value={asset}
              onChange={setAsset}
              buttonLabel="Select image/video"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="sm" variant="secondary" disabled={pending || !asset}>
              {pending ? "Adding…" : "Use in Campaign"}
            </Button>
            <span className="text-xs text-slate-400">No Fal.ai generation or AI cost for existing Drive creatives.</span>
            {!pending && state.message && (
              <p className={state.status === "error" ? "text-sm text-red-600" : "text-sm text-emerald-600"}>{state.message}</p>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
