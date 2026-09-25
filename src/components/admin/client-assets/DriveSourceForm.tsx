"use client";

import { useActionState } from "react";
import type { DriveSourceState } from "@/lib/actions/drive-sources";
import { DRIVE_SOURCE_MEDIA_LABELS, DRIVE_SOURCE_MEDIA_TYPES, type DriveSourceMediaType } from "@/lib/drive/media-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

type Action = (prev: DriveSourceState, formData: FormData) => Promise<DriveSourceState>;

// Add or edit one Google Drive source (a folder, or a single image/video file).
export function DriveSourceForm({
  action,
  idPrefix,
  initial,
  submitLabel,
}: {
  action: Action;
  idPrefix: string;
  initial?: { name: string; url: string; mediaType: DriveSourceMediaType };
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" });
  return (
    <form action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
        <div>
          <Label htmlFor={`${idPrefix}-name`}>Name</Label>
          <Input id={`${idPrefix}-name`} name="name" required maxLength={100} defaultValue={initial?.name} placeholder="e.g. Product Images" />
        </div>
        <div>
          <Label htmlFor={`${idPrefix}-type`}>Type</Label>
          <Select id={`${idPrefix}-type`} name="media_type" defaultValue={initial?.mediaType ?? "image"}>
            {DRIVE_SOURCE_MEDIA_TYPES.map((t) => (
              <option key={t} value={t}>
                {DRIVE_SOURCE_MEDIA_LABELS[t]}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-url`}>Google Drive folder or file link</Label>
        <Input
          id={`${idPrefix}-url`}
          name="url"
          required
          defaultValue={initial?.url}
          placeholder="https://drive.google.com/drive/folders/…"
        />
        <p className="mt-1 text-xs text-slate-400">
          Only JPG, JPEG, PNG, WEBP images and MP4, MOV, WEBM videos are used; other files are ignored.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Checking Drive…" : submitLabel}
        </Button>
        {!pending && state.message && (
          <p className={state.status === "error" ? "text-sm text-red-600" : "text-sm text-emerald-600"}>{state.message}</p>
        )}
      </div>
    </form>
  );
}
