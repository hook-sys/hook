"use client";

import { useActionState, useState } from "react";
import type { CreativeActionState } from "@/lib/actions/creatives";
import { falModelFor } from "@/lib/creative/fal-models";
import {
  CREATIVE_FORMATS,
  CREATIVE_TYPES_BY_MEDIA,
  CREATIVE_TYPE_LABELS,
  VIDEO_DURATIONS,
  type CreativeFormat,
  type CreativeMedia,
} from "@/lib/creative/options";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { HATOG_STAGE_KEYS, HATOG_STAGE_LABELS } from "@/types/ai";

type Action = (prev: CreativeActionState, formData: FormData) => Promise<CreativeActionState>;

const initialState: CreativeActionState = { status: "idle" };

export interface GeneratorProduct {
  id: string;
  name: string;
  images: { id: string; label: string }[];
}

export function CreativeGeneratorForm({
  products,
  generateAction,
  previewAction,
  canGenerate,
}: {
  products: GeneratorProduct[];
  generateAction: Action;
  previewAction?: Action;
  canGenerate: boolean;
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
  const [referenceId, setReferenceId] = useState("");

  const images = products.find((p) => p.id === productId)?.images ?? [];
  const model = falModelFor(media, referenceId !== "");
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
          <Select
            id="product_id"
            name="product_id"
            value={productId}
            onChange={(e) => {
              setProductId(e.target.value);
              setReferenceId("");
            }}
          >
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
          <Label htmlFor="reference_asset_id">Reference Product Image</Label>
          <Select id="reference_asset_id" name="reference_asset_id" value={referenceId} onChange={(e) => setReferenceId(e.target.value)}>
            <option value="">None (text-to-{media})</option>
            {images.map((img) => (
              <option key={img.id} value={img.id}>
                {img.label}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-xs text-slate-400">
            {images.length === 0
              ? "This product has no image assets. Add one to keep the real product in the output."
              : "Recommended: keeps the real product in the output. Drive files must be shared “Anyone with the link”."}{" "}
            Model: {model.label}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={busy || !canGenerate}>
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
