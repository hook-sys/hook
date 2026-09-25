"use server";

import { revalidatePath } from "next/cache";
import { hasPermission, requireAdmin, requireSuperAdmin } from "@/lib/auth/session";
import { DRIVE_SOURCE_MEDIA_TYPES, driveItemUrl, parseDriveLink, type DriveAssetSummary, type DriveSourceMediaType } from "@/lib/drive/media-types";
import { DriveSourceError, getClientDriveSource, inspectDriveSourceLink, listClientDriveAssets } from "@/lib/drive/sources";
import { getClientById } from "@/lib/services/clients";
import { createClient } from "@/lib/supabase/server";

export interface DriveSourceState {
  status: "idle" | "error" | "success";
  message?: string;
}

const clientPath = (clientId: string) => `/admin/clients/${clientId}`;

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof DriveSourceError ? error.message : fallback;
}

// Super Admin: add (sourceId = null) or edit a client's Drive source. The link is checked
// with Google Drive first; a link that can't be read as a folder or supported image/video
// is not saved. Without the read-only grant yet, it is saved as "unchecked".
export async function saveDriveSourceAction(
  clientId: string,
  sourceId: string | null,
  _prev: DriveSourceState,
  formData: FormData
): Promise<DriveSourceState> {
  const admin = await requireSuperAdmin();
  const client = await getClientById(clientId);
  if (!client) return { status: "error", message: "Client not found." };
  if (sourceId && !(await getClientDriveSource(client.id, sourceId))) return { status: "error", message: "Drive source not found." };

  const name = String(formData.get("name") ?? "").trim();
  if (!name || name.length > 100) return { status: "error", message: "Enter a name (up to 100 characters)." };
  const mediaType = String(formData.get("media_type") ?? "") as DriveSourceMediaType;
  if (!DRIVE_SOURCE_MEDIA_TYPES.includes(mediaType)) return { status: "error", message: "Select Images, Videos or Mixed." };
  const link = parseDriveLink(String(formData.get("url") ?? ""));
  if (!link) return { status: "error", message: "Enter a Google Drive folder or file link." };

  let kind: "folder" | "file" = link.hint === "file" ? "file" : "folder";
  let status: "available" | "unchecked" = "unchecked";
  let detail: string | null = null;
  try {
    const checked = await inspectDriveSourceLink(link.id, mediaType);
    if (!checked.ok) return { status: "error", message: `Not saved: ${checked.detail}` };
    kind = checked.kind;
    status = "available";
  } catch (error) {
    if (!(error instanceof DriveSourceError)) return { status: "error", message: "Could not check the Google Drive link." };
    detail = error.message; // no read access yet: saved, checked once Drive is reconnected
  }

  const values = {
    name,
    media_type: mediaType,
    drive_id: link.id,
    drive_url: driveItemUrl(link.id, kind),
    item_kind: kind,
    status,
    status_detail: detail,
    checked_at: status === "available" ? new Date().toISOString() : null,
  };
  const supabase = await createClient();
  const { error } = sourceId
    ? await supabase.from("client_drive_sources").update(values).eq("client_id", client.id).eq("id", sourceId)
    : await supabase.from("client_drive_sources").insert({ ...values, client_id: client.id, created_by: admin.id });
  if (error) {
    return { status: "error", message: error.code === "23505" ? "That Drive link is already a source for this client." : "Could not save the Drive source." };
  }
  revalidatePath(clientPath(client.id));
  return {
    status: "success",
    message: status === "available" ? `${sourceId ? "Updated" : "Added"} “${name}” (${kind}).` : `Saved “${name}”. ${detail}`,
  };
}

export async function removeDriveSourceAction(clientId: string, sourceId: string): Promise<DriveSourceState> {
  await requireSuperAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.from("client_drive_sources").delete().eq("client_id", clientId).eq("id", sourceId).select("id");
  if (error || !data?.length) return { status: "error", message: "Could not remove the Drive source." };
  revalidatePath(clientPath(clientId));
  return { status: "success", message: "Drive source removed. Files in Google Drive are not affected." };
}

// Re-checks a source with Google Drive and records Available / Unavailable.
export async function recheckDriveSourceAction(clientId: string, sourceId: string): Promise<DriveSourceState> {
  await requireSuperAdmin();
  const source = await getClientDriveSource(clientId, sourceId);
  if (!source) return { status: "error", message: "Drive source not found." };
  let values: { status: "available" | "unavailable"; status_detail: string | null };
  try {
    const checked = await inspectDriveSourceLink(source.drive_id, source.media_type);
    values = checked.ok ? { status: "available", status_detail: null } : { status: "unavailable", status_detail: checked.detail };
  } catch (error) {
    return { status: "error", message: errorMessage(error, "Could not check the Google Drive link.") };
  }
  const supabase = await createClient();
  await supabase
    .from("client_drive_sources")
    .update({ ...values, checked_at: new Date().toISOString() })
    .eq("client_id", clientId)
    .eq("id", sourceId);
  revalidatePath(clientPath(clientId));
  return values.status === "available" ? { status: "success", message: "Available." } : { status: "error", message: values.status_detail ?? "Unavailable." };
}

// Assets for the Drive pickers (Creative Studio, campaigns). Staff need content or campaigns
// access to the client; files come only from that client's configured sources.
export async function listClientDriveAssetsAction(
  clientId: string,
  sourceId: string | null
): Promise<{ ok: true; assets: DriveAssetSummary[]; errors: string[] } | { ok: false; message: string }> {
  const profile = await requireAdmin();
  if (!hasPermission(profile, "content") && !hasPermission(profile, "campaigns")) return { ok: false, message: "Access denied." };
  const client = await getClientById(clientId);
  if (!client) return { ok: false, message: "Client not found." };
  if (sourceId !== null && !/^[0-9a-f-]{36}$/i.test(sourceId)) return { ok: false, message: "Invalid Drive source." };
  try {
    return { ok: true, ...(await listClientDriveAssets(client.id, sourceId)) };
  } catch (error) {
    return { ok: false, message: errorMessage(error, "Could not load Google Drive assets.") };
  }
}
