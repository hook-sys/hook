import { CREATIVE_FORMATS, type CreativeFormat } from "@/lib/creative/options";
import { DriveSourceError, resolveClientDriveAsset } from "@/lib/drive/sources";
import { createAdminClient } from "@/lib/supabase/admin";
import { HATOG_STAGE_KEYS, type HatogStageKey } from "@/types/ai";

// Server-only. Uses an EXISTING image/video from a client's Google Drive source as a ready
// creative (e.g. for an ad) — no AI brain call, no Fal.ai generation, no cost. Callers must
// have checked permissions and client access. The file is validated against the client's
// configured source before anything is written; only metadata is stored, never media bytes.

export interface DriveCreativeInput {
  productId: string;
  sourceId: string;
  fileId: string;
  hatogStage: string;
  format: string;
}

export async function registerDriveCreative(
  clientId: string,
  input: DriveCreativeInput,
  actorId: string
): Promise<{ creativeId: string; reused: boolean }> {
  if (!(HATOG_STAGE_KEYS as readonly string[]).includes(input.hatogStage)) throw new DriveSourceError("Select a HATOG stage.");
  if (!(CREATIVE_FORMATS as readonly string[]).includes(input.format)) throw new DriveSourceError("Select a format.");
  const asset = await resolveClientDriveAsset(clientId, input.sourceId, input.fileId);

  const admin = createAdminClient();
  // The same Drive file for the same product is registered once and reused.
  const { data: existing } = await admin
    .from("creatives")
    .select("id")
    .eq("client_id", clientId)
    .eq("product_id", input.productId)
    .eq("source", "drive")
    .eq("drive_file_id", asset.file.id)
    .neq("status", "archived")
    .limit(1)
    .maybeSingle();
  if (existing) return { creativeId: existing.id as string, reused: true };

  const now = new Date().toISOString();
  const viewUrl = `https://drive.google.com/file/d/${asset.file.id}/view`;
  const { data, error } = await admin
    .from("creatives")
    .insert({
      client_id: clientId,
      product_id: input.productId,
      media: asset.kind,
      creative_type: "product_showcase",
      hatog_stage: input.hatogStage as HatogStageKey,
      format: input.format as CreativeFormat,
      duration_seconds: null,
      status: "ready",
      brief: {},
      prompt: "",
      source: "drive",
      provider: "drive",
      provider_model: "google-drive",
      asset_url: viewUrl,
      drive_source_id: asset.source.id,
      drive_file_id: asset.file.id,
      drive_file_name: asset.file.name.slice(0, 500),
      drive_mime_type: asset.file.mimeType,
      drive_web_url: viewUrl,
      drive_upload_status: "uploaded",
      drive_uploaded_at: now,
      completed_at: now,
      created_by: actorId,
    })
    .select("id")
    .single();
  if (error || !data) throw new DriveSourceError("Could not add the Drive creative.");
  return { creativeId: data.id as string, reused: false };
}
