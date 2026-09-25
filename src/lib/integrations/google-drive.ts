import { getGoogleOAuthConfig, type OAuthAppConfig } from "@/lib/integrations/env";
import {
  clearIntegration,
  getIntegration,
  getIntegrationSecret,
  saveIntegration,
  setIntegrationSecret,
} from "@/lib/integrations/store";
import { IntegrationError } from "@/lib/integrations/types";
import {
  DriveFolderError,
  ensureCreativeFolders,
  syncClientFolderTree,
  type ClientSubfolderIds,
  type CreativeFolderIds,
  type DriveFolderOps,
} from "@/lib/integrations/drive-folders";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const FOLDER_MIME = "application/vnd.google-apps.folder";

// drive.file: the app can only see/manage files and folders it created itself.
const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/drive.file"];

interface GoogleTokenSet {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

interface GoogleTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
}

function requireConfig(): OAuthAppConfig {
  const config = getGoogleOAuthConfig();
  if (!config) throw new IntegrationError("Google OAuth credentials are not configured on the server.");
  return config;
}

export function buildGoogleAuthUrl(config: OAuthAppConfig, state: string, codeChallenge: string): string {
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

async function tokenRequest(body: Record<string, string>): Promise<GoogleTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    cache: "no-store",
  });
  return (await res.json()) as GoogleTokenResponse;
}

export async function connectGoogleDrive(code: string, codeVerifier: string, actorId: string): Promise<void> {
  const config = requireConfig();
  const token = await tokenRequest({
    code,
    code_verifier: codeVerifier,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
  });

  if (!token.access_token || !token.refresh_token) {
    throw new IntegrationError("Google did not return an offline access token.");
  }

  const userinfo = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${token.access_token}` },
    cache: "no-store",
  }).then((r) => (r.ok ? (r.json() as Promise<{ email?: string }>) : {}));

  const tokenSet: GoogleTokenSet = {
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expires_at: Date.now() + (token.expires_in ?? 3600) * 1000,
  };

  await setIntegrationSecret("google_drive", JSON.stringify(tokenSet));
  await saveIntegration(
    "google_drive",
    {
      status: "connected",
      config: { account_email: (userinfo as { email?: string }).email ?? undefined, last_error: null },
      connected_at: new Date().toISOString(),
    },
    actorId
  );
}

async function markError(message: string): Promise<never> {
  const current = await getIntegration("google_drive");
  await saveIntegration(
    "google_drive",
    { status: "error", config: { ...current.config, last_error: message }, connected_at: current.connected_at },
    null
  );
  throw new IntegrationError(message);
}

async function getAccessToken(): Promise<string> {
  const raw = await getIntegrationSecret("google_drive");
  if (!raw) throw new IntegrationError("Google Drive is not connected.");

  const tokenSet = JSON.parse(raw) as GoogleTokenSet;
  if (tokenSet.expires_at - 60_000 > Date.now()) return tokenSet.access_token;

  const config = requireConfig();
  const refreshed = await tokenRequest({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: tokenSet.refresh_token,
    grant_type: "refresh_token",
  });

  if (!refreshed.access_token) {
    return markError("Google authorization expired or was revoked. Reconnect Google Drive.");
  }

  const next: GoogleTokenSet = {
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token ?? tokenSet.refresh_token,
    expires_at: Date.now() + (refreshed.expires_in ?? 3600) * 1000,
  };
  await setIntegrationSecret("google_drive", JSON.stringify(next));
  return next.access_token;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// GETs are retried with exponential backoff on network errors, 429 and 5xx; writes are not.
async function driveFetch<T>(path: string, init: RequestInit = {}): Promise<{ status: number; data: T | null }> {
  const accessToken = await getAccessToken();
  const isRead = !init.method || init.method === "GET";
  const attempts = isRead ? 3 : 1;

  for (let attempt = 1; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${DRIVE_API}${path}`, {
        ...init,
        headers: { ...init.headers, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      if (attempt < attempts) {
        await sleep(500 * 2 ** (attempt - 1));
        continue;
      }
      throw new IntegrationError("Could not reach Google Drive (timeout or network error).");
    }

    if (res.status === 401) {
      return markError("Google Drive rejected the stored authorization. Reconnect Google Drive.");
    }
    if ((res.status === 429 || res.status >= 500) && attempt < attempts) {
      await sleep(500 * 2 ** (attempt - 1));
      continue;
    }

    const data = res.status === 204 ? null : ((await res.json().catch(() => null)) as T | null);
    return { status: res.status, data };
  }
}

// Drive API implementation of the folder operations used by syncClientFolderTree.
// Folders are tagged with appProperties.hookKey, which drive.file-scoped queries can match.
const driveFolderOps: DriveFolderOps = {
  async findFolder(parentId, hookKey) {
    const q = [
      `mimeType='${FOLDER_MIME}'`,
      "trashed=false",
      `'${parentId}' in parents`,
      `appProperties has { key='hookKey' and value='${hookKey}' }`,
    ].join(" and ");

    const found = await driveFetch<{ files: { id: string }[] }>(
      `/files?${new URLSearchParams({ q, fields: "files(id)", pageSize: "1", spaces: "drive" })}`
    );
    if (found.status !== 200) throw new IntegrationError("Could not search Google Drive.");
    return found.data?.files[0]?.id ?? null;
  },

  async createFolder(name, parentId, hookKey) {
    const created = await driveFetch<{ id: string }>("/files?fields=id", {
      method: "POST",
      body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId], appProperties: { hookKey } }),
    });
    if (created.status !== 200 || !created.data) throw new IntegrationError("Could not create a Google Drive folder.");
    return created.data.id;
  },

  async getFolder(folderId) {
    const res = await driveFetch<{ id: string; trashed: boolean; mimeType: string }>(
      `/files/${encodeURIComponent(folderId)}?fields=id,trashed,mimeType`
    );
    if (res.status === 404) return null;
    if (res.status !== 200 || !res.data) throw new IntegrationError("Could not read the Google Drive folder.");
    return { id: res.data.id, trashed: res.data.trashed, isFolder: res.data.mimeType === FOLDER_MIME };
  },
};

export async function createOrSyncClientFolder(client: {
  id: string;
  business_name: string;
  drive_folder_id: string | null;
}): Promise<{ folderId: string; subfolders: ClientSubfolderIds }> {
  try {
    return await syncClientFolderTree(driveFolderOps, client);
  } catch (error) {
    if (error instanceof DriveFolderError) throw new IntegrationError(error.message);
    throw error;
  }
}

export async function ensureClientCreativeFolders(clientFolderId: string): Promise<CreativeFolderIds> {
  try {
    return await ensureCreativeFolders(driveFolderOps, clientFolderId);
  } catch (error) {
    if (error instanceof DriveFolderError) throw new IntegrationError(error.message);
    throw error;
  }
}

export interface DriveFileRef {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string | null;
  trashed: boolean;
}

const FILE_FIELDS = "id,name,mimeType,webViewLink,trashed";

// Existing (non-trashed) file this app uploaded for a creative, found via its tag.
export async function findCreativeFile(folderId: string, creativeId: string): Promise<DriveFileRef | null> {
  const q = [
    "trashed=false",
    `'${folderId}' in parents`,
    `appProperties has { key='hookCreativeId' and value='${creativeId}' }`,
  ].join(" and ");
  const res = await driveFetch<{ files: DriveFileRef[] }>(
    `/files?${new URLSearchParams({ q, fields: `files(${FILE_FIELDS})`, pageSize: "1", spaces: "drive" })}`
  );
  if (res.status === 403) throw new IntegrationError("Google Drive denied access (insufficient permission). Reconnect Google Drive.");
  if (res.status !== 200) throw new IntegrationError("Could not search Google Drive.");
  return res.data?.files[0] ?? null;
}

// null = deleted/not accessible (e.g. removed by a user). Renames don't matter: files are tracked by ID.
export async function getDriveFile(fileId: string): Promise<DriveFileRef | null> {
  const res = await driveFetch<DriveFileRef>(`/files/${encodeURIComponent(fileId)}?fields=${FILE_FIELDS}`);
  if (res.status === 404) return null;
  if (res.status === 403) throw new IntegrationError("Google Drive denied access (insufficient permission). Reconnect Google Drive.");
  if (res.status !== 200 || !res.data) throw new IntegrationError("Could not read the Google Drive file.");
  return res.data.trashed ? null : res.data;
}

// Resumable upload (single PUT): suitable for images and multi-MB videos.
export async function uploadFileToDrive(options: {
  name: string;
  folderId: string;
  mimeType: string;
  bytes: ArrayBuffer;
  appProperties: Record<string, string>;
}): Promise<DriveFileRef> {
  const accessToken = await getAccessToken();
  const init = await fetch(`${DRIVE_UPLOAD_API}/files?uploadType=resumable&fields=${FILE_FIELDS}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": options.mimeType,
      "X-Upload-Content-Length": String(options.bytes.byteLength),
    },
    body: JSON.stringify({ name: options.name, parents: [options.folderId], mimeType: options.mimeType, appProperties: options.appProperties }),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (init.status === 401) return markError("Google Drive rejected the stored authorization. Reconnect Google Drive.");
  if (init.status === 403) throw new IntegrationError("Google Drive denied the upload (insufficient permission or quota).");
  if (init.status === 404) throw new IntegrationError("The Drive folder is missing. Sync the client's Drive folder and retry.");
  const session = init.headers.get("location");
  if (!init.ok || !session || !session.startsWith(`${DRIVE_UPLOAD_API}/`)) {
    throw new IntegrationError(`Google Drive did not start the upload (${init.status}).`);
  }

  const put = await fetch(session, {
    method: "PUT",
    headers: { "Content-Length": String(options.bytes.byteLength), "Content-Type": options.mimeType },
    body: options.bytes,
    cache: "no-store",
    signal: AbortSignal.timeout(240_000),
  });
  const file = (await put.json().catch(() => null)) as DriveFileRef | null;
  if (!(put.status === 200 || put.status === 201) || !file?.id || !/^[A-Za-z0-9_-]{10,200}$/.test(file.id)) {
    throw new IntegrationError(`Google Drive upload failed (${put.status}).`);
  }
  return file;
}

export async function isGoogleDriveConnected(): Promise<boolean> {
  return (await getIntegration("google_drive")).status === "connected";
}

export async function disconnectGoogleDrive(actorId: string): Promise<void> {
  const raw = await getIntegrationSecret("google_drive");
  if (raw) {
    const { refresh_token } = JSON.parse(raw) as GoogleTokenSet;
    await fetch(REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: refresh_token }),
      cache: "no-store",
    }).catch(() => undefined);
  }
  await clearIntegration("google_drive", actorId);
}
