"use client";

import { useState, useTransition } from "react";
import { listClientDriveAssetsAction } from "@/lib/actions/drive-sources";
import type { DriveAssetSummary, DriveMediaKind } from "@/lib/drive/media-types";
import { Button } from "@/components/ui/button";

type Filter = "all" | DriveMediaKind;
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "image", label: "Images" },
  { key: "video", label: "Videos" },
];

export interface PickerSource {
  id: string;
  name: string;
}

// Browses the current client's configured Google Drive sources (server-side listing; only
// image/video files). The selection is submitted as `<namePrefix>_source_id` / `_file_id`.
export function DriveAssetPicker({
  clientId,
  sources,
  namePrefix,
  value,
  onChange,
  sourceId = null,
  buttonLabel = "Select from Client Drive",
  disabled = false,
}: {
  clientId: string;
  sources: PickerSource[];
  namePrefix: string;
  value: DriveAssetSummary | null;
  onChange: (asset: DriveAssetSummary | null) => void;
  sourceId?: string | null; // restrict to one source
  buttonLabel?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [assets, setAssets] = useState<DriveAssetSummary[] | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();

  const load = () =>
    startLoading(async () => {
      const result = await listClientDriveAssetsAction(clientId, sourceId);
      setLoadedFor(sourceId ?? "all");
      if (!result.ok) {
        setAssets([]);
        setMessage(result.message);
        return;
      }
      setAssets(result.assets);
      setMessage(result.errors.length ? result.errors.join(" · ") : null);
    });

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && (assets === null || loadedFor !== (sourceId ?? "all"))) load();
  };

  const visible = (assets ?? []).filter((a) => filter === "all" || a.kind === filter);

  if (sources.length === 0) {
    return <p className="text-sm text-slate-500">No Google Drive sources are configured for this client yet (client profile → Google Drive Sources).</p>;
  }

  return (
    <div className="space-y-2">
      <input type="hidden" name={`${namePrefix}_source_id`} value={value?.sourceId ?? ""} />
      <input type="hidden" name={`${namePrefix}_file_id`} value={value?.fileId ?? ""} />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={toggle} disabled={disabled}>
          {open ? "Close Drive" : buttonLabel}
        </Button>
        {value ? (
          <span className="flex items-center gap-2 text-sm text-slate-700">
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs uppercase text-slate-500">{value.kind}</span>
            <span className="max-w-[16rem] truncate">{value.name}</span>
            <span className="text-xs text-slate-400">({value.sourceName})</span>
            <button type="button" className="text-xs text-brand-blue hover:underline" onClick={() => onChange(null)}>
              Clear
            </button>
          </span>
        ) : (
          <span className="text-sm text-slate-400">No Drive asset selected</span>
        )}
      </div>

      {open && (
        <div className="space-y-3 rounded-md border border-slate-200 p-3">
          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${filter === f.key ? "bg-brand-navy text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
              >
                {f.label}
              </button>
            ))}
            <button type="button" onClick={load} className="ml-auto text-xs text-brand-blue hover:underline" disabled={loading}>
              Refresh
            </button>
          </div>
          {loading && <p className="text-sm text-slate-500">Loading Drive assets…</p>}
          {!loading && message && <p className="text-xs text-amber-700">{message}</p>}
          {!loading && assets !== null && visible.length === 0 && <p className="text-sm text-slate-500">No matching images or videos.</p>}
          {!loading && visible.length > 0 && (
            <ul className="grid max-h-80 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((asset) => {
                const selected = value?.fileId === asset.fileId && value.sourceId === asset.sourceId;
                return (
                  <li key={`${asset.sourceId}:${asset.fileId}`}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange(asset);
                        setOpen(false);
                      }}
                      className={`flex w-full gap-2 rounded-md border p-2 text-left text-xs ${selected ? "border-brand-blue bg-blue-50" : "border-slate-200 hover:border-brand-blue"}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- same-origin, permission-checked Drive thumbnail */}
                      <img
                        src={asset.thumbnailUrl}
                        alt=""
                        loading="lazy"
                        className="h-14 w-14 shrink-0 rounded bg-slate-100 object-cover"
                        onError={(e) => {
                          e.currentTarget.style.visibility = "hidden";
                        }}
                      />
                      <span className="min-w-0 space-y-0.5">
                        <span className="block truncate font-medium text-slate-900">{asset.name}</span>
                        <span className="block truncate text-slate-500">{asset.sourceName}</span>
                        <span className="block uppercase text-slate-400">
                          {asset.kind} · {asset.mimeType.split("/")[1]}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
