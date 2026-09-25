import { getDriveFile, isGoogleDriveConnected } from "@/lib/integrations/google-drive";
import { IntegrationError } from "@/lib/integrations/types";

// Google Drive is the only image/video asset source. This verifies what a Drive file really
// is (never trusting a user-declared type) and whether fal.ai can fetch it as a reference.
//
// The app's Drive scope (drive.file) only exposes files the app created itself (e.g. saved
// creatives). Other files are checked through Google's public download link, which is also
// exactly how fal.ai fetches a reference image — so a passing check means fal.ai can use it.

const DRIVE_ID = /^[A-Za-z0-9_-]{10,200}$/;
const MEDIA_MIME = /^(image|video)\/[a-z0-9.+-]+$/;

// Image formats accepted as a fal.ai reference image.
export const FAL_REFERENCE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export function isFalReferenceMime(mimeType: string | null | undefined): boolean {
  return !!mimeType && (FAL_REFERENCE_MIME_TYPES as readonly string[]).includes(mimeType);
}

export function drivePublicDownloadUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
}

function allowedDriveHost(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  return (
    url.protocol === "https:" &&
    (host === "drive.google.com" || host === "drive.usercontent.google.com" || host.endsWith(".googleusercontent.com"))
  );
}

// MIME type served by Google's public download link, or null if the file isn't publicly
// shared (Google then serves an HTML sign-in/permission page) or isn't an image/video.
export async function probePublicDriveMedia(fileId: string): Promise<string | null> {
  if (!DRIVE_ID.test(fileId)) return null;
  let current = drivePublicDownloadUrl(fileId);
  for (let hop = 0; hop < 5; hop++) {
    const url = new URL(current);
    if (!allowedDriveHost(url)) return null;
    let res: Response;
    try {
      res = await fetch(current, {
        redirect: "manual",
        cache: "no-store",
        headers: { Range: "bytes=0-1023" },
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new IntegrationError("Could not reach Google Drive to check the file.");
    }
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      if (!next) return null;
      current = new URL(next, current).toString();
      continue;
    }
    await res.body?.cancel().catch(() => {});
    if (res.status !== 200 && res.status !== 206) return null;
    const mimeType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    return MEDIA_MIME.test(mimeType) ? mimeType : null;
  }
  return null;
}

export interface DriveMediaInfo {
  mimeType: string;
  kind: "image" | "video";
  publiclyAccessible: boolean;
}

// Verified MIME type of a Drive file; throws an admin-safe error if it isn't a readable
// image or video.
export async function inspectDriveMedia(fileId: string): Promise<DriveMediaInfo> {
  if (!DRIVE_ID.test(fileId)) throw new IntegrationError("Enter a valid Google Drive file link or ID.");

  let apiMime: string | null = null;
  if (await isGoogleDriveConnected()) {
    try {
      apiMime = (await getDriveFile(fileId))?.mimeType ?? null;
    } catch {
      apiMime = null; // not visible to this app's drive.file scope — use the public check
    }
  }
  const publicMime = await probePublicDriveMedia(fileId);
  const mimeType = (apiMime ?? publicMime ?? "").toLowerCase();
  if (!MEDIA_MIME.test(mimeType)) {
    throw new IntegrationError(
      apiMime
        ? "Only image and video files can be used from Google Drive."
        : "Google Drive didn't return an image or video. Share the file as “Anyone with the link” (Viewer), or use a file saved to Drive by Hook. Only images and videos are allowed."
    );
  }
  return { mimeType, kind: mimeType.startsWith("image/") ? "image" : "video", publiclyAccessible: publicMime !== null };
}
