import {
  DRIVE_FOLDER_MIME,
  DRIVE_IMAGE_MIME_TYPES,
  DRIVE_VIDEO_MIME_TYPES,
  driveMediaKind,
  isDriveId,
  sourceAccepts,
  type DriveAssetSummary,
  type DriveMediaKind,
  type DriveSourceMediaType,
} from "@/lib/drive/media-types";
import { getDriveItemMeta, hasDriveReadAccess, listDriveFolderFiles, type DriveItemMeta } from "@/lib/integrations/google-drive";
import { IntegrationError } from "@/lib/integrations/types";
import { createClient } from "@/lib/supabase/server";

// Server-only. Client Google Drive sources: the ONLY place Hook reads image/video assets from.
// Every file is resolved through a source configured for that client, so no arbitrary Drive
// item can be read, and its type is checked from Drive metadata before it is used.

export interface DriveSource {
  id: string;
  client_id: string;
  name: string;
  drive_url: string;
  drive_id: string;
  item_kind: "folder" | "file";
  media_type: DriveSourceMediaType;
  status: "available" | "unavailable" | "unchecked";
  status_detail: string | null;
  checked_at: string | null;
  created_at: string;
}

export class DriveSourceError extends Error {}

const READ_ACCESS_MESSAGE = "Reconnect Google Drive in Settings → Integrations to grant read-only access to client Drive folders.";

// Caller's session: RLS returns sources to super admins and to staff assigned to the client.
export async function listClientDriveSources(clientId: string): Promise<DriveSource[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("client_drive_sources").select("*").eq("client_id", clientId).order("created_at");
  return (data ?? []) as DriveSource[];
}

export async function getClientDriveSource(clientId: string, sourceId: string): Promise<DriveSource | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("client_drive_sources").select("*").eq("client_id", clientId).eq("id", sourceId).maybeSingle();
  return (data as DriveSource | null) ?? null;
}

function mimeTypesFor(mediaType: DriveSourceMediaType): readonly string[] {
  if (mediaType === "image") return DRIVE_IMAGE_MIME_TYPES;
  if (mediaType === "video") return DRIVE_VIDEO_MIME_TYPES;
  return [...DRIVE_IMAGE_MIME_TYPES, ...DRIVE_VIDEO_MIME_TYPES];
}

async function requireReadAccess(): Promise<void> {
  if (!(await hasDriveReadAccess())) throw new DriveSourceError(READ_ACCESS_MESSAGE);
}

// Checks a Drive link before it is saved as a source: it must be a folder, or a single
// supported image/video file, visible to the connected Google account.
export async function inspectDriveSourceLink(
  driveId: string,
  mediaType: DriveSourceMediaType
): Promise<{ ok: true; kind: "folder" | "file"; name: string } | { ok: false; detail: string }> {
  await requireReadAccess();
  let item: DriveItemMeta | null;
  try {
    item = await getDriveItemMeta(driveId);
  } catch (error) {
    return { ok: false, detail: error instanceof IntegrationError ? error.message : "Could not reach Google Drive." };
  }
  if (!item) return { ok: false, detail: "Not found, trashed, or not shared with the connected Google account." };
  if (item.mimeType === DRIVE_FOLDER_MIME) return { ok: true, kind: "folder", name: item.name };
  if (!driveMediaKind(item.mimeType)) return { ok: false, detail: "Only folders or JPG, PNG, WEBP, MP4, MOV and WEBM files can be used." };
  if (!sourceAccepts(mediaType, item.mimeType)) return { ok: false, detail: `This file is not a${mediaType === "image" ? "n image" : " video"}.` };
  return { ok: true, kind: "file", name: item.name };
}

export function driveThumbnailPath(clientId: string, sourceId: string, fileId: string): string {
  return `/api/drive/thumbnail?${new URLSearchParams({ client: clientId, source: sourceId, file: fileId })}`;
}

function summarize(clientId: string, source: DriveSource, item: DriveItemMeta): DriveAssetSummary {
  return {
    sourceId: source.id,
    sourceName: source.name,
    fileId: item.id,
    name: item.name,
    mimeType: item.mimeType,
    kind: driveMediaKind(item.mimeType)!,
    thumbnailUrl: driveThumbnailPath(clientId, source.id, item.id),
    webViewUrl: `https://drive.google.com/file/d/${item.id}/view`,
  };
}

async function sourceItems(source: DriveSource): Promise<DriveItemMeta[]> {
  if (source.item_kind === "folder") return listDriveFolderFiles(source.drive_id, mimeTypesFor(source.media_type));
  const item = await getDriveItemMeta(source.drive_id);
  return item && sourceAccepts(source.media_type, item.mimeType) ? [item] : [];
}

// Image/video assets of a client's sources (optionally one source). Other file types are ignored.
export async function listClientDriveAssets(
  clientId: string,
  sourceId?: string | null
): Promise<{ assets: DriveAssetSummary[]; errors: string[] }> {
  await requireReadAccess();
  const sources = (await listClientDriveSources(clientId)).filter((s) => !sourceId || s.id === sourceId);
  const assets: DriveAssetSummary[] = [];
  const errors: string[] = [];
  for (const source of sources) {
    try {
      for (const item of await sourceItems(source)) {
        if (sourceAccepts(source.media_type, item.mimeType)) assets.push(summarize(clientId, source, item));
      }
    } catch (error) {
      errors.push(`${source.name}: ${error instanceof IntegrationError ? error.message : "could not be read"}`);
    }
  }
  return { assets, errors };
}

export interface ResolvedDriveAsset {
  source: DriveSource;
  file: DriveItemMeta;
  kind: DriveMediaKind;
}

// The only way a Drive file is used: it must belong to one of this client's sources (inside
// the configured folder, or be the configured file) and be a supported image/video.
export async function resolveClientDriveAsset(clientId: string, sourceId: string, fileId: string): Promise<ResolvedDriveAsset> {
  if (!isDriveId(fileId)) throw new DriveSourceError("Select a Google Drive file.");
  const source = await getClientDriveSource(clientId, sourceId);
  if (!source) throw new DriveSourceError("That Google Drive source is not configured for this client.");
  await requireReadAccess();
  if (source.item_kind === "file" && fileId !== source.drive_id) throw new DriveSourceError("That file is not part of this Drive source.");

  let file: DriveItemMeta | null;
  try {
    file = await getDriveItemMeta(fileId);
  } catch (error) {
    throw new DriveSourceError(error instanceof IntegrationError ? error.message : "Could not read the Google Drive file.");
  }
  if (!file) throw new DriveSourceError("The Google Drive file no longer exists or is not accessible.");
  if (source.item_kind === "folder" && !file.parents.includes(source.drive_id)) {
    throw new DriveSourceError("That file is not in this client's Drive source folder.");
  }
  const kind = driveMediaKind(file.mimeType);
  if (!kind || !sourceAccepts(source.media_type, file.mimeType)) {
    throw new DriveSourceError("Only JPG, PNG, WEBP images and MP4, MOV, WEBM videos can be used.");
  }
  return { source, file, kind };
}
