// Pure, dependency-free client folder-tree logic. The Drive API calls are injected via
// DriveFolderOps so this can be unit-tested against an in-memory fake.

export const ROOT_FOLDER_NAME = "HOOK MARKETING DRIVE";
export const CLIENTS_FOLDER_NAME = "Clients";

export const CLIENT_SUBFOLDERS = [
  { key: "products", name: "Products" },
  { key: "images", name: "Images" },
  { key: "videos", name: "Videos" },
  { key: "logos", name: "Logos" },
  { key: "brand_assets", name: "Brand Assets" },
] as const;

export type ClientSubfolderKey = (typeof CLIENT_SUBFOLDERS)[number]["key"];
export type ClientSubfolderIds = Record<ClientSubfolderKey, string>;

export interface DriveFolderOps {
  // Finds a non-trashed folder under `parentId` tagged with appProperties.hookKey.
  findFolder(parentId: string, hookKey: string): Promise<string | null>;
  createFolder(name: string, parentId: string, hookKey: string): Promise<string>;
  getFolder(folderId: string): Promise<{ id: string; trashed: boolean; isFolder: boolean } | null>;
}

export class DriveFolderError extends Error {}

async function ensureFolder(ops: DriveFolderOps, name: string, parentId: string, hookKey: string) {
  return (await ops.findFolder(parentId, hookKey)) ?? (await ops.createFolder(name, parentId, hookKey));
}

// HOOK MARKETING DRIVE / Clients / <Client Name> / {Products, Images, Videos, Logos, Brand Assets}
// - A stored folder ID is always reused (never duplicated); it must still exist.
// - Without a stored ID, a folder previously created for this client is detected via
//   its tag, so a lost ID or a renamed folder never produces a duplicate.
// - Missing (or trashed) subfolders are recreated; existing ones are reused.
export async function syncClientFolderTree(
  ops: DriveFolderOps,
  client: { id: string; business_name: string; drive_folder_id: string | null }
): Promise<{ folderId: string; subfolders: ClientSubfolderIds }> {
  let folderId: string;

  if (client.drive_folder_id) {
    const existing = await ops.getFolder(client.drive_folder_id);
    if (!existing || existing.trashed || !existing.isFolder) {
      throw new DriveFolderError(
        "The stored Drive folder is missing, trashed, or not accessible to this app. Clear the Drive Folder ID to create a new one."
      );
    }
    folderId = existing.id;
  } else {
    const rootId = await ensureFolder(ops, ROOT_FOLDER_NAME, "root", "root");
    const clientsId = await ensureFolder(ops, CLIENTS_FOLDER_NAME, rootId, "clients");
    folderId = await ensureFolder(ops, client.business_name, clientsId, `client-${client.id}`);
  }

  const subfolders = {} as ClientSubfolderIds;
  for (const { key, name } of CLIENT_SUBFOLDERS) {
    subfolders[key] = await ensureFolder(ops, name, folderId, key);
  }

  return { folderId, subfolders };
}

// Client / Creatives / {Images, Videos} for generated creatives (Phase 13). Existing
// folders are reused via their tag; only missing ones are created.
export const CREATIVE_FOLDER_KEYS = {
  root: "creatives",
  image: "creatives_images",
  video: "creatives_videos",
} as const;

export type CreativeFolderIds = { creatives: string; creatives_images: string; creatives_videos: string };

export async function ensureCreativeFolders(ops: DriveFolderOps, clientFolderId: string): Promise<CreativeFolderIds> {
  const creatives = await ensureFolder(ops, "Creatives", clientFolderId, CREATIVE_FOLDER_KEYS.root);
  return {
    creatives,
    creatives_images: await ensureFolder(ops, "Images", creatives, CREATIVE_FOLDER_KEYS.image),
    creatives_videos: await ensureFolder(ops, "Videos", creatives, CREATIVE_FOLDER_KEYS.video),
  };
}

// Only provider-hosted creative files may be fetched server-side (SSRF guard).
export function isAllowedCreativeSource(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port) return false;
  const host = parsed.hostname.toLowerCase();
  return host === "fal.media" || host.endsWith(".fal.media");
}

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

export function creativeFileName(parts: {
  clientName: string;
  productName: string | null;
  creativeType: string;
  format: string;
  creativeId: string;
  mimeType: string;
}): string {
  const clean = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  const ext = EXT[parts.mimeType] ?? "bin";
  return [clean(parts.clientName), parts.productName ? clean(parts.productName) : null, parts.creativeType, parts.format.replace(":", "x"), parts.creativeId.slice(0, 8)]
    .filter(Boolean)
    .join(" - ")
    .concat(`.${ext}`);
}

export const CREATIVE_MIME_TYPES = Object.keys(EXT);
