import {
  CREATIVE_MIME_TYPES,
  creativeFileName,
  isAllowedCreativeSource,
  type CreativeFolderIds,
} from "@/lib/integrations/drive-folders";
import {
  createOrSyncClientFolder,
  ensureClientCreativeFolders,
  findCreativeFile,
  getDriveFile,
  isGoogleDriveConnected,
  uploadFileToDrive,
} from "@/lib/integrations/google-drive";
import { IntegrationError } from "@/lib/integrations/types";
import { logEvent } from "@/lib/observability";
import { getClientById } from "@/lib/services/clients";
import { getProduct } from "@/lib/services/products";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { AdminProfile } from "@/types/admin";

// Server-only. Super-admin workflow: copies a Ready creative from the provider CDN into the
// client's Drive (Client / Creatives / Images|Videos). Callers must check super admin.

const MAX_BYTES = { image: 30 * 1024 * 1024, video: 200 * 1024 * 1024 } as const;
const STALE_UPLOAD_MS = 10 * 60 * 1000;

export class DriveUploadError extends Error {}

export type DriveUploadResult = { status: "uploaded" | "already_uploaded"; webUrl: string | null };

async function downloadAsset(url: string, media: "image" | "video"): Promise<{ bytes: ArrayBuffer; mimeType: string }> {
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    if (!isAllowedCreativeSource(current)) throw new DriveUploadError("The creative's file host is not allowed.");
    const res = await fetch(current, { redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(120_000) });
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      if (!next) throw new DriveUploadError("The creative file redirect is invalid.");
      current = new URL(next, current).toString();
      continue;
    }
    if (res.status === 404 || res.status === 410) throw new DriveUploadError("The creative file is no longer available at the provider.");
    if (!res.ok) throw new DriveUploadError(`Could not download the creative file (${res.status}).`);

    const mimeType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!CREATIVE_MIME_TYPES.includes(mimeType) || !mimeType.startsWith(`${media}/`)) {
      throw new DriveUploadError(`Unexpected creative file type (${mimeType || "unknown"}).`);
    }
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > MAX_BYTES[media]) throw new DriveUploadError("The creative file is too large.");
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES[media]) throw new DriveUploadError("The creative file is empty or too large.");
    return { bytes, mimeType };
  }
  throw new DriveUploadError("Too many redirects while downloading the creative.");
}

export async function uploadCreativeToDrive(profile: AdminProfile, clientId: string, creativeId: string): Promise<DriveUploadResult> {
  if (profile.role !== "admin") throw new DriveUploadError("Only super admins can upload to Drive.");
  if (!(await isGoogleDriveConnected())) throw new DriveUploadError("Connect Google Drive.");

  const client = await getClientById(clientId);
  if (!client) throw new DriveUploadError("Client not found.");
  const supabase = await createClient();
  const { data: creative } = await supabase
    .from("creatives")
    .select("id, product_id, media, creative_type, format, status, asset_url, drive_file_id, drive_upload_status, drive_upload_started_at, source")
    .eq("client_id", client.id)
    .eq("id", creativeId)
    .maybeSingle();
  if (!creative) throw new DriveUploadError("Creative not found.");
  if (creative.source === "drive") throw new DriveUploadError("This creative is already a Google Drive file.");
  if (creative.status !== "ready" || !creative.asset_url) throw new DriveUploadError("Only Ready creatives can be uploaded.");

  const admin = createAdminClient();
  const record = (values: Record<string, unknown>) => admin.from("creatives").update(values).eq("client_id", client.id).eq("id", creative.id);
  const markUploaded = async (file: { id: string; name?: string; webViewLink: string | null; mimeType: string }, folderId: string | null) => {
    await record({
      drive_file_id: file.id,
      drive_file_name: file.name ? file.name.slice(0, 500) : null,
      drive_web_url: file.webViewLink && /^https:\/\/(drive|docs)\.google\.com\//i.test(file.webViewLink) ? file.webViewLink : null,
      drive_mime_type: /^(image|video)\/[a-z0-9.+-]+$/.test(file.mimeType) ? file.mimeType : null,
      ...(folderId ? { drive_folder_id: folderId } : {}),
      drive_uploaded_at: new Date().toISOString(),
      drive_upload_status: "uploaded",
      drive_upload_started_at: null,
      drive_error: null,
    });
  };

  // Duplicate protection 1: the stored file still exists (renamed files are fine).
  if (creative.drive_file_id) {
    const existing = await getDriveFile(creative.drive_file_id);
    if (existing) {
      if (creative.drive_upload_status !== "uploaded") await markUploaded(existing, null);
      return { status: "already_uploaded", webUrl: existing.webViewLink };
    }
    // Deleted/trashed in Drive: fall through and upload again.
  }

  // Concurrency guard: claim the upload (a stale claim older than 10 minutes can be retaken).
  const staleBefore = new Date(Date.now() - STALE_UPLOAD_MS).toISOString();
  const { data: claimed } = await admin
    .from("creatives")
    .update({ drive_upload_status: "uploading", drive_upload_started_at: new Date().toISOString(), drive_error: null, drive_file_id: null })
    .eq("client_id", client.id)
    .eq("id", creative.id)
    .or(`drive_upload_status.neq.uploading,drive_upload_started_at.lt."${staleBefore}"`)
    .select("id");
  if (!claimed?.length) throw new DriveUploadError("An upload for this creative is already in progress.");

  const started = Date.now();
  try {
    // Only missing folders are created; existing ones are reused.
    const tree = await createOrSyncClientFolder(client);
    const creativeFolders: CreativeFolderIds = await ensureClientCreativeFolders(tree.folderId);
    await admin
      .from("clients")
      .update({
        drive_folder_id: tree.folderId,
        drive_subfolder_ids: { ...client.drive_subfolder_ids, ...tree.subfolders, ...creativeFolders },
        drive_synced_at: new Date().toISOString(),
      })
      .eq("id", client.id);
    const folderId = creative.media === "video" ? creativeFolders.creatives_videos : creativeFolders.creatives_images;

    // Duplicate protection 2: a previous upload succeeded but its ID was never recorded.
    const orphan = await findCreativeFile(folderId, creative.id);
    if (orphan) {
      await markUploaded(orphan, folderId);
      return { status: "already_uploaded", webUrl: orphan.webViewLink };
    }

    const { bytes, mimeType } = await downloadAsset(creative.asset_url, creative.media);
    const product = await getProduct(client.id, creative.product_id);
    const file = await uploadFileToDrive({
      name: creativeFileName({
        clientName: client.business_name,
        productName: product?.name ?? null,
        creativeType: creative.creative_type,
        format: creative.format,
        creativeId: creative.id,
        mimeType,
      }),
      folderId,
      mimeType,
      bytes,
      appProperties: { hookCreativeId: creative.id, hookClientId: client.id },
    });
    // Marked uploaded only because Google returned a real file ID.
    await markUploaded(file, folderId);
    logEvent("info", { provider: "google_drive", operation: "upload_creative", clientId: client.id, userId: profile.id, status: "succeeded", durationMs: Date.now() - started });
    return { status: "uploaded", webUrl: file.webViewLink };
  } catch (error) {
    const message =
      error instanceof DriveUploadError || error instanceof IntegrationError ? error.message : "Drive upload failed unexpectedly.";
    await record({ drive_upload_status: "failed", drive_upload_started_at: null, drive_error: message.slice(0, 1000) });
    logEvent("warn", {
      provider: "google_drive",
      operation: "upload_creative",
      clientId: client.id,
      userId: profile.id,
      status: "failed",
      durationMs: Date.now() - started,
      error: error instanceof Error ? error.message : "unknown",
    });
    throw new DriveUploadError(message);
  }
}
