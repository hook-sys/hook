"use client";

import { useActionState, useState } from "react";
import type { CreativeActionState } from "@/lib/actions/creatives";
import { checkReferenceCompatibility, falModelFor, type FalModelSelection } from "@/lib/creative/fal-models";
import {
  CREATIVE_FORMATS,
  CREATIVE_TYPES_BY_MEDIA,
  CREATIVE_TYPE_LABELS,
  VIDEO_DURATIONS,
  type CreativeFormat,
  type CreativeMedia,
} from "@/lib/creative/options";
import type { DriveAssetSummary } from "@/lib/drive/media-types";
import { DriveAssetPicker, type PickerSource } from "@/components/admin/drive/DriveAssetPicker";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { HATOG_STAGE_KEYS, HATOG_STAGE_LABELS } from "@/types/ai";

type Action = (prev: CreativeActionState, formData: FormData) => Promise<CreativeActionState>;

const initialState: CreativeActionState = { status: "idle" };

export interface GeneratorProduct {
  id: string;
  name: string;
}

export function CreativeGeneratorForm({
  clientId,
  products,
  driveSources,
  generateAction,
  previewAction,
  canGenerate,
  falModels,
  brain,
}: {
  clientId: string;
  products: GeneratorProduct[];
  driveSources: PickerSource[];
  generateAction: Action;
  previewAction?: Action;
  canGenerate: boolean;
  // The Fal.ai model saved by the Super Admin for each mode (Settings → Integrations).
  falModels: FalModelSelection;
  // The selected AI Brain (Settings → AI Brain); null when nothing is selected.
  brain: { providerLabel: string; model: string } | null;
}) {
  const [state, formAction, pending] = useActionState(generateAction, initialState);
  const [previewState, previewFormAction, previewPending] = useActionState(
    previewAction ?? (async () => initialState),
    initialState
  );

  // Controlled so selections survive React's post-action form reset.
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [media, setMedia] = useState<CreativeMedia>("image");
  const [creativeType, setCreativeType] = useState<string>(CREATIVE_TYPES_BY_MEDIA.image[0]);
  const [hatogStage, setHatogStage] = useState<string>("hook");
  const [format, setFormat] = useState<CreativeFormat>("9:16");
  const [duration, setDuration] = useState("5");
  const [reference, setReference] = useState<DriveAssetSummary | null>(null);

  // The model that will actually run for this media + reference combination.
  const model = falModelFor(media, reference !== null, falModels);
  const compatibilityError = checkReferenceCompatibility(media, reference?.kind ?? null, falModels);
  const busy = pending || previewPending;

  const changeMedia = (next: CreativeMedia) => {
    setMedia(next);
    setCreativeType(CREATIVE_TYPES_BY_MEDIA[next][0]);
  };

  if (products.length === 0) {
    return <p className="text-sm text-slate-500">Add a product for this client before generating creatives.</p>;
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="product_id">Product</Label>
          <Select id="product_id" name="product_id" value={productId} onChange={(e) => setProductId(e.target.value)}>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="media">Media</Label>
          <Select id="media" name="media" value={media} onChange={(e) => changeMedia(e.target.value as CreativeMedia)}>
            <option value="image">Image</option>
            <option value="video">Video</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="creative_type">Creative Type</Label>
          <Select id="creative_type" name="creative_type" value={creativeType} onChange={(e) => setCreativeType(e.target.value)}>
            {CREATIVE_TYPES_BY_MEDIA[media].map((t) => (
              <option key={t} value={t}>
                {CREATIVE_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="hatog_stage">HATOG Stage</Label>
          <Select id="hatog_stage" name="hatog_stage" value={hatogStage} onChange={(e) => setHatogStage(e.target.value)}>
            {HATOG_STAGE_KEYS.map((k) => (
              <option key={k} value={k}>
                {HATOG_STAGE_LABELS[k]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="format">Format</Label>
          <Select id="format" name="format" value={format} onChange={(e) => setFormat(e.target.value as CreativeFormat)}>
            {CREATIVE_FORMATS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </Select>
          {model.formats === "reference" && (
            <p className="mt-1 text-xs text-slate-400">Image-to-video output follows the reference image&apos;s aspect ratio.</p>
          )}
        </div>
        {media === "video" && (
          <div>
            <Label htmlFor="duration_seconds">Duration</Label>
            <Select id="duration_seconds" name="duration_seconds" value={duration} onChange={(e) => setDuration(e.target.value)}>
              {VIDEO_DURATIONS.map((d) => {
                const supported = model.durations?.includes(d) ?? false;
                return (
                  <option key={d} value={d} disabled={!supported}>
                    {d} sec{supported ? "" : " (not supported by the current model)"}
                  </option>
                );
              })}
            </Select>
          </div>
        )}
        <div className="sm:col-span-2">
          <Label>Reference Product Asset (optional)</Label>
          <DriveAssetPicker
            clientId={clientId}
            sources={driveSources}
            namePrefix="reference_drive"
            value={reference}
            onChange={setReference}
          />
          <p className="mt-1 text-xs text-slate-400">
            A Drive image keeps the real product in the output ({media === "image" ? "image-reference" : "image-to-video"} model).
            Drive videos can&apos;t be used as a reference by the selected Fal.ai models.
          </p>
          {compatibilityError && <p className="mt-1 text-sm text-red-600">{compatibilityError}</p>}
        </div>
      </div>

      <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm" aria-live="polite">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">This request will use</p>
        <p className="mt-1 text-slate-700">
          AI Brain:{" "}
          {brain ? (
            <span className="font-medium text-slate-900">
              {brain.providerLabel} → {brain.model}
            </span>
          ) : (
            <span className="text-amber-700">not selected (Settings → AI Brain)</span>
          )}
        </p>
        <p className="text-slate-700">
          {reference ? (media === "image" ? "Image + Reference" : "Video + Reference") : media === "image" ? "Image Generation" : "Video Generation"}:{" "}
          <span className="font-medium text-slate-900">Fal.ai → {model.label}</span> <span className="text-xs text-slate-400">({model.id})</span>
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={busy || !canGenerate || compatibilityError !== null}>
          {pending ? "Generating brief…" : "Generate Creative"}
        </Button>
        {previewAction && (
          <Button type="submit" variant="outline" formAction={previewFormAction} disabled={busy}>
            {previewPending ? "Building…" : "Preview AI Request"}
          </Button>
        )}
      </div>

      {state.message && (
        <p className={state.status === "error" ? "text-sm text-red-600" : "text-sm text-emerald-600"}>{state.message}</p>
      )}
      {previewState.status === "error" && previewState.message && (
        <p className="text-sm text-red-600">{previewState.message}</p>
      )}
      {previewState.preview && (
        <details open className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs">
          <summary className="cursor-pointer font-medium text-slate-700">AI request (not sent)</summary>
          <p className="mt-2 font-semibold text-slate-600">System</p>
          <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap text-slate-700">{previewState.preview.system}</pre>
          <p className="mt-3 font-semibold text-slate-600">User</p>
          <pre className="mt-1 max-h-96 overflow-auto whitespace-pre-wrap text-slate-700">{previewState.preview.user}</pre>
        </details>
      )}
    </form>
  );
}
