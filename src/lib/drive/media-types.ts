// Pure rules for Google Drive assets (safe for client and server). Google Drive is used ONLY
// for image/video assets — never for prompts, documents, reports or general storage.

export const DRIVE_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const; // JPG, JPEG, PNG, WEBP
export const DRIVE_VIDEO_MIME_TYPES = ["video/mp4", "video/quicktime", "video/webm"] as const; // MP4, MOV, WEBM
export const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";

export type DriveMediaKind = "image" | "video";
export type DriveSourceMediaType = "image" | "video" | "mixed";
export const DRIVE_SOURCE_MEDIA_TYPES: readonly DriveSourceMediaType[] = ["image", "video", "mixed"];
export const DRIVE_SOURCE_MEDIA_LABELS: Record<DriveSourceMediaType, string> = { image: "Images", video: "Videos", mixed: "Mixed" };

// Media kind of a supported Drive file; null for anything else (ignored/rejected).
export function driveMediaKind(mimeType: string | null | undefined): DriveMediaKind | null {
  if (!mimeType) return null;
  if ((DRIVE_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType)) return "image";
  if ((DRIVE_VIDEO_MIME_TYPES as readonly string[]).includes(mimeType)) return "video";
  return null;
}

// Whether a file belongs in a source configured for images, videos or both.
export function sourceAccepts(sourceType: DriveSourceMediaType, mimeType: string | null | undefined): boolean {
  const kind = driveMediaKind(mimeType);
  return kind !== null && (sourceType === "mixed" || sourceType === kind);
}

const DRIVE_ID = /^[A-Za-z0-9_-]{10,200}$/;

export function isDriveId(value: unknown): value is string {
  return typeof value === "string" && DRIVE_ID.test(value);
}

// Drive folder or file link -> item ID. Accepts folder links (/drive/folders/ID,
// /drive/u/0/folders/ID), file links (/file/d/ID), ?id= links and bare IDs.
export function parseDriveLink(input: string): { id: string; hint: "folder" | "file" | "unknown" } | null {
  const value = input.trim();
  if (isDriveId(value)) return { id: value, hint: "unknown" };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || (host !== "drive.google.com" && host !== "docs.google.com")) return null;
  const folder = url.pathname.match(/\/folders\/([A-Za-z0-9_-]{10,200})/)?.[1];
  if (folder) return { id: folder, hint: "folder" };
  const file = url.pathname.match(/\/d\/([A-Za-z0-9_-]{10,200})/)?.[1];
  if (file) return { id: file, hint: "file" };
  const query = url.searchParams.get("id");
  return isDriveId(query) ? { id: query, hint: "unknown" } : null;
}

export function driveItemUrl(id: string, kind: "folder" | "file"): string {
  return kind === "folder" ? `https://drive.google.com/drive/folders/${id}` : `https://drive.google.com/file/d/${id}/view`;
}

// What the picker shows for one asset (no tokens, no Drive API URLs).
export interface DriveAssetSummary {
  sourceId: string;
  sourceName: string;
  fileId: string;
  name: string;
  mimeType: string;
  kind: DriveMediaKind;
  thumbnailUrl: string; // same-origin, permission-checked proxy
  webViewUrl: string;
}
