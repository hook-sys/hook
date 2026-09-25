"use server";

import { revalidatePath } from "next/cache";
import { UNTRUSTED_DATA_RULE } from "@/lib/ai/claude-json";
import { getAiProviderReadiness } from "@/lib/ai/usage";
import { requirePermission, requireSuperAdmin } from "@/lib/auth/session";
import { extractFalOutput } from "@/lib/creative/fal-models";
import { getFalJobResult, getFalJobState } from "@/lib/integrations/fal";
import { logEvent } from "@/lib/observability";
import { getClientById } from "@/lib/services/clients";
import { listGeneratingCreatives } from "@/lib/services/creatives";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation/ids";
import { DriveUploadError, uploadCreativeToDrive } from "@/lib/workflows/drive-creatives";
import { buildBriefPrompt, parseCreativeRequest, startCreativeGeneration } from "@/lib/workflows/creatives";

export interface CreativeActionState {
  status: "idle" | "error" | "success";
  message?: string;
  preview?: { system: string; user: string };
  pending?: number;
}

const GENERATION_TIMEOUT_MS = 30 * 60 * 1000;

function studioPath(clientId: string) {
  return `/admin/clients/${clientId}/creative-studio`;
}

const formInput = (formData: FormData) =>
  Object.fromEntries(
    [
      "product_id",
      "media",
      "creative_type",
      "hatog_stage",
      "format",
      "duration_seconds",
      "reference_asset_id",
      "reference_drive_source_id",
      "reference_drive_file_id",
    ].map((k) => [
      k,
      String(formData.get(k) ?? ""),
    ])
  );

export async function generateCreative(
  clientId: string,
  _prev: CreativeActionState,
  formData: FormData
): Promise<CreativeActionState> {
  const profile = await requirePermission("content");
  const result = await startCreativeGeneration(profile, clientId, formInput(formData));
  revalidatePath(studioPath(clientId));
  return { status: result.ok ? "success" : "error", message: result.message };
}

// Polls Fal.ai for this client's in-flight jobs and records results. Safe to call repeatedly.
// Results are written with the service role (after the permission/assignment checks), so
// signed-in users can never mark a creative ready themselves.
export async function refreshCreativeStatuses(clientId: string): Promise<CreativeActionState> {
  const profile = await requirePermission("content");
  const client = await getClientById(clientId);
  if (!client) return { status: "error", message: "Client not found." };

  const generating = await listGeneratingCreatives(client.id);
  if (generating.length === 0) return { status: "success", pending: 0 };

  const readiness = await getAiProviderReadiness();
  if (readiness.fal !== "ready") return { status: "error", message: "Connect Fal.ai to check generation status.", pending: generating.length };

  const admin = createAdminClient();
  let pending = 0;
  const finish = (id: string, values: Record<string, unknown>) =>
    admin
      .from("creatives")
      .update({ ...values, completed_at: new Date().toISOString() })
      .eq("client_id", client.id)
      .eq("id", id)
      .eq("status", "generating");

  for (const creative of generating) {
    try {
      if (Date.now() - new Date(creative.created_at).getTime() > GENERATION_TIMEOUT_MS) {
        await finish(creative.id, { status: "failed", error: "Generation timed out." });
        continue;
      }
      if (!creative.provider_status_url || !creative.provider_response_url) {
        await finish(creative.id, { status: "failed", error: "Missing provider job reference." });
        continue;
      }
      const state = await getFalJobState(creative.provider_status_url);
      if (state.state === "pending") {
        pending++;
      } else if (state.state === "failed") {
        await finish(creative.id, { status: "failed", error: state.error });
      } else {
        const output = extractFalOutput(creative.provider_model, await getFalJobResult(creative.provider_response_url));
        await finish(
          creative.id,
          output
            ? { status: "ready", asset_url: output.assetUrl, thumbnail_url: output.thumbnailUrl }
            : { status: "failed", error: "Fal.ai returned no usable asset URL." }
        );
      }
    } catch (error) {
      pending++;
      logEvent("warn", {
        provider: "fal",
        operation: "status_check",
        clientId: client.id,
        userId: profile.id,
        status: "error",
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  revalidatePath(studioPath(client.id));
  return { status: "success", pending };
}

export async function archiveCreative(clientId: string, creativeId: string): Promise<CreativeActionState> {
  await requirePermission("content");
  if (!isUuid(creativeId)) return { status: "error", message: "Invalid creative." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("creatives")
    .update({ status: "archived" })
    .eq("client_id", clientId)
    .eq("id", creativeId)
    .select("id");
  if (error) return { status: "error", message: "Only ready or failed creatives can be archived." };
  if (!data?.length) return { status: "error", message: "Creative not found." };

  revalidatePath(studioPath(clientId));
  return { status: "success", message: "Archived." };
}

// ---------------------------------------------------------------------------
// Google Drive (super admin only). A creative is marked uploaded only after Drive returns
// a real file ID.
// ---------------------------------------------------------------------------

const DRIVE_BATCH_LIMIT = 10;

export async function uploadCreativeToDriveAction(clientId: string, creativeId: string): Promise<CreativeActionState> {
  const profile = await requireSuperAdmin();
  if (!isUuid(creativeId)) return { status: "error", message: "Invalid creative." };
  try {
    const result = await uploadCreativeToDrive(profile, clientId, creativeId);
    revalidatePath(studioPath(clientId));
    return { status: "success", message: result.status === "already_uploaded" ? "Already in Drive." : "Uploaded to Drive." };
  } catch (error) {
    revalidatePath(studioPath(clientId));
    return { status: "error", message: error instanceof DriveUploadError ? error.message : "Drive upload failed." };
  }
}

async function uploadMany(clientId: string, ids: string[]): Promise<CreativeActionState> {
  const profile = await requireSuperAdmin();
  let uploaded = 0;
  let skipped = 0;
  const failures: string[] = [];
  // Sequential and capped per request to stay within the server time limit.
  for (const id of ids.slice(0, DRIVE_BATCH_LIMIT)) {
    try {
      const result = await uploadCreativeToDrive(profile, clientId, id);
      if (result.status === "uploaded") uploaded++;
      else skipped++;
    } catch (error) {
      failures.push(error instanceof DriveUploadError ? error.message : "Upload failed.");
      if (error instanceof DriveUploadError && /Connect Google Drive|Reconnect/.test(error.message)) break;
    }
  }
  revalidatePath(studioPath(clientId));
  const remaining = Math.max(0, ids.length - DRIVE_BATCH_LIMIT);
  const parts = [
    `${uploaded} uploaded`,
    skipped ? `${skipped} already in Drive` : null,
    failures.length ? `${failures.length} failed (${failures[0]})` : null,
    remaining ? `${remaining} remaining — run again` : null,
  ];
  return { status: failures.length && !uploaded ? "error" : "success", message: parts.filter(Boolean).join(" · ") };
}

export async function uploadSelectedToDriveAction(
  clientId: string,
  _prev: CreativeActionState,
  formData: FormData
): Promise<CreativeActionState> {
  await requireSuperAdmin();
  const ids = [...new Set(formData.getAll("creative_ids").map(String))];
  if (ids.length === 0) return { status: "error", message: "Select at least one creative." };
  if (ids.some((id) => !isUuid(id))) return { status: "error", message: "Invalid selection." };
  return uploadMany(clientId, ids);
}

export async function uploadAllReadyToDriveAction(clientId: string): Promise<CreativeActionState> {
  await requireSuperAdmin();
  const supabase = await createClient();
  const { data } = await supabase
    .from("creatives")
    .select("id")
    .eq("client_id", clientId)
    .eq("status", "ready")
    .in("drive_upload_status", ["not_uploaded", "failed"])
    .order("created_at")
    .limit(100);
  const ids = (data ?? []).map((r) => r.id as string);
  if (ids.length === 0) return { status: "success", message: "All ready creatives are already in Drive." };
  return uploadMany(clientId, ids);
}

// Super-admin transparency tool: shows exactly what would be sent to Claude. No API call.
export async function previewCreativeRequest(
  clientId: string,
  _prev: CreativeActionState,
  formData: FormData
): Promise<CreativeActionState> {
  await requireSuperAdmin();
  const client = await getClientById(clientId);
  if (!client) return { status: "error", message: "Client not found." };
  const request = parseCreativeRequest(formInput(formData));
  if ("error" in request) return { status: "error", message: request.error };

  const prompt = await buildBriefPrompt(client.id, request);
  if ("error" in prompt) return { status: "error", message: prompt.error };
  return { status: "success", preview: { system: `${prompt.system}\n\n${UNTRUSTED_DATA_RULE}`, user: prompt.user } };
}
