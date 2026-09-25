import type { CreativeFormat, CreativeMedia } from "@/lib/creative/options";

// Fal.ai model registry. Creative Studio only talks to this abstraction; switching a model
// means changing DEFAULT_FAL_MODELS (or adding a spec) — not rewriting the studio.
// Input/output shapes follow each endpoint's documented fal.ai schema.

export type FalMode = "text-to-image" | "image-to-image" | "text-to-video" | "image-to-video";

export interface FalJobRequest {
  media: CreativeMedia;
  format: CreativeFormat;
  durationSeconds: number | null;
  prompt: string;
  negativePrompt: string | null;
  referenceImageUrl: string | null;
}

export interface FalModelSpec {
  id: string;
  mode: FalMode;
  label: string;
  // "reference" = output aspect ratio follows the reference image.
  formats: readonly CreativeFormat[] | "reference";
  durations: readonly number[] | null;
  supportsNegativePrompt: boolean;
  maxPromptLength: number;
  buildInput(req: FalJobRequest): Record<string, unknown>;
  extract(output: unknown): { assetUrl: string; thumbnailUrl: string | null } | null;
}

const ALL_FORMATS: readonly CreativeFormat[] = ["9:16", "1:1", "16:9"];

const FLUX_IMAGE_SIZE: Record<CreativeFormat, string> = {
  "9:16": "portrait_16_9",
  "1:1": "square_hd",
  "16:9": "landscape_16_9",
};

function firstImage(output: unknown) {
  const url = (output as { images?: { url?: unknown }[] })?.images?.[0]?.url;
  return typeof url === "string" && url.startsWith("https://") ? { assetUrl: url, thumbnailUrl: url } : null;
}

function video(output: unknown) {
  const url = (output as { video?: { url?: unknown } })?.video?.url;
  return typeof url === "string" && url.startsWith("https://") ? { assetUrl: url, thumbnailUrl: null } : null;
}

export const FAL_MODELS: Record<string, FalModelSpec> = {
  "fal-ai/flux/dev": {
    id: "fal-ai/flux/dev",
    mode: "text-to-image",
    label: "FLUX.1 [dev]",
    formats: ALL_FORMATS,
    durations: null,
    supportsNegativePrompt: false,
    maxPromptLength: 4000,
    buildInput: (r) => ({
      prompt: r.prompt,
      image_size: FLUX_IMAGE_SIZE[r.format],
      num_images: 1,
      output_format: "jpeg",
      enable_safety_checker: true,
    }),
    extract: firstImage,
  },
  "fal-ai/flux-pro/kontext": {
    id: "fal-ai/flux-pro/kontext",
    mode: "image-to-image",
    label: "FLUX.1 Kontext [pro]",
    formats: ALL_FORMATS,
    durations: null,
    supportsNegativePrompt: false,
    maxPromptLength: 4000,
    buildInput: (r) => ({
      prompt: r.prompt,
      image_url: r.referenceImageUrl,
      aspect_ratio: r.format,
      num_images: 1,
      output_format: "jpeg",
    }),
    extract: firstImage,
  },
  "fal-ai/kling-video/v2.5-turbo/pro/text-to-video": {
    id: "fal-ai/kling-video/v2.5-turbo/pro/text-to-video",
    mode: "text-to-video",
    label: "Kling 2.5 Turbo Pro (text-to-video)",
    formats: ALL_FORMATS,
    durations: [5, 10],
    supportsNegativePrompt: true,
    maxPromptLength: 2500,
    buildInput: (r) => ({
      prompt: r.prompt,
      duration: String(r.durationSeconds),
      aspect_ratio: r.format,
      ...(r.negativePrompt ? { negative_prompt: r.negativePrompt } : {}),
    }),
    extract: video,
  },
  "fal-ai/kling-video/v2.5-turbo/pro/image-to-video": {
    id: "fal-ai/kling-video/v2.5-turbo/pro/image-to-video",
    mode: "image-to-video",
    label: "Kling 2.5 Turbo Pro (image-to-video)",
    formats: "reference",
    durations: [5, 10],
    supportsNegativePrompt: true,
    maxPromptLength: 2500,
    buildInput: (r) => ({
      prompt: r.prompt,
      image_url: r.referenceImageUrl,
      duration: String(r.durationSeconds),
      ...(r.negativePrompt ? { negative_prompt: r.negativePrompt } : {}),
    }),
    extract: video,
  },
};

export const DEFAULT_FAL_MODELS: Record<FalMode, string> = {
  "text-to-image": "fal-ai/flux/dev",
  "image-to-image": "fal-ai/flux-pro/kontext",
  "text-to-video": "fal-ai/kling-video/v2.5-turbo/pro/text-to-video",
  "image-to-video": "fal-ai/kling-video/v2.5-turbo/pro/image-to-video",
};

// Product videos prefer image-to-video when a product image exists (keeps the real product).
export function falModeFor(media: CreativeMedia, hasReference: boolean): FalMode {
  if (media === "image") return hasReference ? "image-to-image" : "text-to-image";
  return hasReference ? "image-to-video" : "text-to-video";
}

export function falModelFor(media: CreativeMedia, hasReference: boolean): FalModelSpec {
  return FAL_MODELS[DEFAULT_FAL_MODELS[falModeFor(media, hasReference)]];
}

// Checks format/duration against the configured model before anything is paid for.
export function checkFalCapabilities(
  media: CreativeMedia,
  format: CreativeFormat,
  durationSeconds: number | null,
  hasReference: boolean
): string | null {
  const spec = falModelFor(media, hasReference);
  if (spec.formats !== "reference" && !spec.formats.includes(format)) {
    return `${spec.label} does not support the ${format} format.`;
  }
  if (media === "video") {
    if (!durationSeconds || !spec.durations?.includes(durationSeconds)) {
      return `${spec.label} supports ${spec.durations?.join(" or ")} second videos; ${durationSeconds ?? "?"} sec needs a model that supports longer clips.`;
    }
  } else if (durationSeconds !== null) {
    return "Images do not have a duration.";
  }
  return null;
}

export type FalJobPlan =
  | { ok: true; modelId: string; mode: FalMode; input: Record<string, unknown> }
  | { ok: false; error: string };

export function planFalJob(req: FalJobRequest): FalJobPlan {
  const hasReference = req.referenceImageUrl !== null;
  if (hasReference && !/^https:\/\/\S+$/.test(req.referenceImageUrl!)) {
    return { ok: false, error: "The reference image must be an https URL." };
  }
  const capabilityError = checkFalCapabilities(req.media, req.format, req.durationSeconds, hasReference);
  if (capabilityError) return { ok: false, error: capabilityError };

  const spec = falModelFor(req.media, hasReference);
  const prompt = req.prompt.trim();
  if (!prompt) return { ok: false, error: "The generation prompt is empty." };
  if (prompt.length > spec.maxPromptLength) {
    return { ok: false, error: `The generation prompt exceeds ${spec.maxPromptLength} characters.` };
  }
  const negativePrompt = spec.supportsNegativePrompt ? req.negativePrompt?.trim().slice(0, 1000) || null : null;

  return { ok: true, modelId: spec.id, mode: spec.mode, input: spec.buildInput({ ...req, prompt, negativePrompt }) };
}

export function extractFalOutput(modelId: string, output: unknown) {
  return FAL_MODELS[modelId]?.extract(output) ?? null;
}

// Units billed by fal for this job: seconds for per-second video pricing, otherwise 1 output.
export function falBillingUnits(unit: string, durationSeconds: number | null): number {
  return /second/i.test(unit) && durationSeconds ? durationSeconds : 1;
}
