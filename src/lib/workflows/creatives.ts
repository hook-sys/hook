import { buildAiContext, AiContextError } from "@/lib/ai/context";
import {
  buildCreativeBriefPrompt,
  validateCreativeBrief,
  CREATIVE_BRIEF_SCHEMA,
  type CreativeBrief,
  type CreativeBriefRequest,
} from "@/lib/ai/creative-brief";
import { aiErrorMessage, generateAndLog } from "@/lib/ai/generate";
import { brainReadiness } from "@/lib/ai/brain";
import { enforceAiRateLimit, getAiProviderReadiness, logGeneration } from "@/lib/ai/usage";
import { checkFalCapabilities, falBillingUnits, falModelFor, planFalJob } from "@/lib/creative/fal-models";
import { getFalModelSelection } from "@/lib/creative/fal-selection";
import { drivePublicDownloadUrl, isFalReferenceMime, probePublicDriveMedia } from "@/lib/integrations/drive-media";
import { IntegrationError } from "@/lib/integrations/types";
import {
  CREATIVE_FORMATS,
  CREATIVE_MEDIA,
  VIDEO_DURATIONS,
  isCreativeTypeFor,
  type CreativeFormat,
  type CreativeMedia,
} from "@/lib/creative/options";
import { getFalUnitPrice, submitFalJob } from "@/lib/integrations/fal";
import { logEvent } from "@/lib/observability";
import { getClientById } from "@/lib/services/clients";
import { getProduct, listProductAssets } from "@/lib/services/products";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation/ids";
import type { AdminProfile } from "@/types/admin";
import { HATOG_STAGE_KEYS, type HatogStageKey } from "@/types/ai";

// Server-only creative workflows shared by the Creative Studio and the AI agent. Callers
// must have checked the `content` permission.

export type CreativeRequest = CreativeBriefRequest & { productId: string; referenceAssetId: string | null };

export function parseCreativeRequest(input: Record<string, unknown>): CreativeRequest | { error: string } {
  const get = (k: string) => (typeof input[k] === "string" ? (input[k] as string).trim() : input[k] == null ? "" : String(input[k]));
  const productId = get("product_id");
  const media = get("media");
  const creativeType = get("creative_type");
  const hatogStage = get("hatog_stage");
  const format = get("format");
  const duration = get("duration_seconds");
  const referenceAssetId = get("reference_asset_id") || null;

  if (!isUuid(productId)) return { error: "Select a product." };
  if (!(CREATIVE_MEDIA as readonly string[]).includes(media)) return { error: "Select image or video." };
  if (!isCreativeTypeFor(media as CreativeMedia, creativeType)) return { error: "Select a creative type." };
  if (!(HATOG_STAGE_KEYS as readonly string[]).includes(hatogStage)) return { error: "Select a HATOG stage." };
  if (!(CREATIVE_FORMATS as readonly string[]).includes(format)) return { error: "Select a format." };
  if (referenceAssetId && !isUuid(referenceAssetId)) return { error: "Invalid reference image." };

  let durationSeconds: number | null = null;
  if (media === "video") {
    durationSeconds = Number(duration);
    if (!(VIDEO_DURATIONS as readonly number[]).includes(durationSeconds)) return { error: "Select a video duration." };
  }

  return {
    productId,
    media: media as CreativeMedia,
    creativeType,
    hatogStage: hatogStage as HatogStageKey,
    format: format as CreativeFormat,
    durationSeconds,
    hasReferenceImage: referenceAssetId !== null,
    referenceAssetId,
  };
}

// Reference images come only from Google Drive. Before anything is paid for, the file is
// re-checked through Google's public download link — the same URL fal.ai fetches — so it
// must still exist, be shared "Anyone with the link", and be a format fal.ai accepts.
async function resolveReferenceImage(clientId: string, productId: string, assetId: string | null) {
  if (!assetId) return { url: null };
  const asset = (await listProductAssets(clientId, productId)).find((a) => a.id === assetId);
  if (!asset || asset.asset_type !== "image" || !asset.drive_file_id) {
    return { error: "The reference image must be one of this product's Google Drive images." };
  }
  if (!isFalReferenceMime(asset.mime_type)) return { error: "Fal.ai reference images must be JPEG, PNG or WebP." };
  let served: string | null;
  try {
    served = await probePublicDriveMedia(asset.drive_file_id);
  } catch (error) {
    return { error: error instanceof IntegrationError ? error.message : "Could not check the Google Drive reference image." };
  }
  if (!isFalReferenceMime(served)) {
    return { error: "Fal.ai can't read this Drive image. Share it as “Anyone with the link” (Viewer) and try again." };
  }
  return { url: drivePublicDownloadUrl(asset.drive_file_id) };
}

// Context + prompt are built before any paid call; builder errors (e.g. a disabled HATOG
// stage) are authored, admin-safe messages.
export async function buildBriefPrompt(clientId: string, request: CreativeRequest): Promise<{ system: string; user: string } | { error: string }> {
  try {
    const context = await buildAiContext({ clientId, productId: request.productId });
    return buildCreativeBriefPrompt(context, request);
  } catch (error) {
    if (error instanceof AiContextError) return { error: error.message };
    return { error: error instanceof Error ? error.message : "Could not build the creative request." };
  }
}

async function generateBrief(profile: AdminProfile, clientId: string, request: CreativeRequest): Promise<CreativeBrief> {
  const prompt = await buildBriefPrompt(clientId, request);
  if ("error" in prompt) throw new AiContextError(prompt.error);
  const result = await generateAndLog<CreativeBrief>({
    clientId,
    actorId: profile.id,
    productId: request.productId,
    generationType: "creative_brief",
    ...prompt,
    schema: CREATIVE_BRIEF_SCHEMA,
    maxTokens: 8000,
    validate: (value) => {
      const v = validateCreativeBrief(value, request);
      return v.ok ? { ok: true, value: v.brief } : v;
    },
  });
  return result.data;
}

export type WorkflowResult<T> = { ok: true; value: T; message: string } | { ok: false; message: string };

// Brief only (selected AI brain model), nothing stored or sent to Fal.ai.
export async function generateCreativeBriefOnly(
  profile: AdminProfile,
  clientId: string,
  input: Record<string, unknown>
): Promise<WorkflowResult<CreativeBrief>> {
  const request = parseCreativeRequest(input);
  if ("error" in request) return { ok: false, message: request.error };
  if (!(await getProduct(clientId, request.productId))) return { ok: false, message: "Product not found for this client." };
  try {
    return { ok: true, value: await generateBrief(profile, clientId, request), message: "Brief created." };
  } catch (error) {
    return { ok: false, message: aiErrorMessage(error, "Could not create the creative brief.") };
  }
}

// Full pipeline: Drive reference -> brief (selected AI brain model) -> selected Fal.ai model. The creative row is created as "generating";
// the Fal.ai poller later records ready/failed.
export async function startCreativeGeneration(
  profile: AdminProfile,
  clientId: string,
  input: Record<string, unknown>
): Promise<WorkflowResult<{ creativeId: string | null }>> {
  const client = await getClientById(clientId);
  if (!client) return { ok: false, message: "Client not found." };
  const request = parseCreativeRequest(input);
  if ("error" in request) return { ok: false, message: request.error };
  const product = await getProduct(client.id, request.productId);
  if (!product) return { ok: false, message: "Product not found for this client." };

  const reference = await resolveReferenceImage(client.id, product.id, request.referenceAssetId);
  if ("error" in reference) return { ok: false, message: reference.error! };

  // Everything checkable for free is checked before paying for an AI brain call.
  const falModels = await getFalModelSelection();
  const capabilityError = checkFalCapabilities(request.media, request.format, request.durationSeconds, reference.url !== null, falModels);
  if (capabilityError) return { ok: false, message: capabilityError };

  const readiness = await getAiProviderReadiness();
  const brainIssue = await brainReadiness();
  if (brainIssue) return { ok: false, message: brainIssue };
  if (readiness.fal !== "ready") return { ok: false, message: "Connect Fal.ai in Settings → Integrations first." };

  let brief: CreativeBrief;
  try {
    brief = await generateBrief(profile, client.id, request);
  } catch (error) {
    return { ok: false, message: aiErrorMessage(error, "Could not create the creative brief.") };
  }

  const plan = planFalJob(
    {
      media: request.media,
      format: request.format,
      durationSeconds: request.durationSeconds,
      prompt: brief.generation_prompt,
      negativePrompt: brief.negative_prompt,
      referenceImageUrl: reference.url,
    },
    falModels
  );

  const supabase = await createClient();
  const base = {
    client_id: client.id,
    product_id: product.id,
    media: request.media,
    creative_type: request.creativeType,
    hatog_stage: request.hatogStage,
    format: request.format,
    duration_seconds: request.durationSeconds,
    brief,
    prompt: brief.generation_prompt,
    negative_prompt: brief.negative_prompt,
    reference_image_url: reference.url,
    provider: "fal",
    provider_model: plan.ok ? plan.modelId : falModelFor(request.media, reference.url !== null, falModels).id,
    created_by: profile.id,
  };

  // The brief is kept even if the media job can't start, so the paid-for work isn't lost.
  const recordFailure = async (message: string): Promise<WorkflowResult<{ creativeId: string | null }>> => {
    await supabase.from("creatives").insert({ ...base, status: "failed", error: message.slice(0, 1000) });
    return { ok: false, message };
  };

  if (!plan.ok) return recordFailure(plan.error);

  try {
    await enforceAiRateLimit(client.id);
  } catch (error) {
    return recordFailure(aiErrorMessage(error, "AI usage limit reached."));
  }

  let submission;
  const started = Date.now();
  try {
    submission = await submitFalJob(plan.modelId, plan.input);
  } catch (error) {
    await logGeneration({
      clientId: client.id,
      productId: product.id,
      provider: "fal",
      model: plan.modelId,
      generationType: request.media,
      status: "failed",
      actorId: profile.id,
    });
    logEvent("warn", { provider: "fal", operation: "submit", clientId: client.id, userId: profile.id, status: "failed", durationMs: Date.now() - started, error: error instanceof Error ? error.message : "unknown" });
    return recordFailure(aiErrorMessage(error, "Fal.ai could not start the generation."));
  }

  const { data: inserted, error: insertError } = await supabase
    .from("creatives")
    .insert({
      ...base,
      status: "generating",
      provider_request_id: submission.requestId,
      provider_status_url: submission.statusUrl,
      provider_response_url: submission.responseUrl,
    })
    .select("id")
    .single();
  if (insertError || !inserted) return { ok: false, message: "Generation started, but saving it failed." };

  const price = await getFalUnitPrice(plan.modelId);
  const units = price ? falBillingUnits(price.unit, request.durationSeconds) : null;
  await logGeneration({
    clientId: client.id,
    productId: product.id,
    creativeId: inserted.id,
    provider: "fal",
    model: plan.modelId,
    generationType: request.media,
    status: "submitted",
    units,
    estimatedCostUsd: price && units ? Math.round(price.unitPrice * units * 10_000) / 10_000 : null,
    actorId: profile.id,
  });
  logEvent("info", { provider: "fal", operation: "submit", clientId: client.id, userId: profile.id, status: "submitted", durationMs: Date.now() - started, requestId: submission.requestId });

  return {
    ok: true,
    value: { creativeId: inserted.id },
    message: "Brief created and generation started. The library updates automatically.",
  };
}
