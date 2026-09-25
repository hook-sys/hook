import { createHmac } from "crypto";
import { getMetaOAuthConfig, type OAuthAppConfig } from "@/lib/integrations/env";
import {
  clearIntegration,
  getIntegration,
  getIntegrationSecret,
  saveIntegration,
  setIntegrationSecret,
} from "@/lib/integrations/store";
import { IntegrationError } from "@/lib/integrations/types";
import {
  META_ASSET_LABEL,
  type MetaAssetKind,
  type MetaAssetSummary,
  type MetaNamedAsset,
} from "@/lib/integrations/meta-assets";
import { logEvent } from "@/lib/observability";
import { createAdminClient } from "@/lib/supabase/admin";

const GRAPH_VERSION = "v26.0";
const GRAPH_API = `https://graph.facebook.com/${GRAPH_VERSION}`;
const DIALOG_URL = `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`;

// Read-level access to the Business Manager and its assets. Optional scope groups are only
// requested when explicitly enabled on the server (reconnect Meta after enabling), because
// Meta rejects the whole login ("Invalid Scopes") if any requested permission isn't
// configured for the app:
// - Instagram: needs the Instagram permission/use case added in the Meta app dashboard.
// - Publishing: needs Marketing API ad-management access.
const READ_SCOPES = ["business_management", "ads_read", "pages_show_list"];
const INSTAGRAM_SCOPES = ["instagram_basic"];
const PUBLISH_SCOPES = ["ads_management", "pages_manage_ads", "pages_read_engagement"];

export function isMetaPublishingEnabled(): boolean {
  return process.env.META_PUBLISHING_ENABLED === "true";
}

export function isMetaInstagramEnabled(): boolean {
  return process.env.META_INSTAGRAM_ENABLED === "true";
}

export function metaOAuthScopes(): string[] {
  return [
    ...READ_SCOPES,
    ...(isMetaInstagramEnabled() ? INSTAGRAM_SCOPES : []),
    ...(isMetaPublishingEnabled() ? PUBLISH_SCOPES : []),
  ];
}

interface MetaTokenSet {
  access_token: string;
  expires_at: number | null;
}

interface GraphError {
  error?: { message?: string; code?: number };
}

export type { MetaAssetSummary, MetaNamedAsset };

function requireConfig(): OAuthAppConfig {
  const config = getMetaOAuthConfig();
  if (!config) throw new IntegrationError("Meta app credentials are not configured on the server.");
  return config;
}

export function buildMetaAuthUrl(config: OAuthAppConfig, state: string): string {
  const url = new URL(DIALOG_URL);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: metaOAuthScopes().join(","),
    state,
  }).toString();
  return url.toString();
}

// Graph rate-limit / transient error codes worth retrying for idempotent reads.
const RETRYABLE_GRAPH_CODES = new Set([1, 2, 4, 17, 32, 341, 613, 80000, 80003, 80004]);
const GRAPH_TIMEOUT_MS = 20_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function graph<T>(
  path: string,
  accessToken: string,
  params: Record<string, string> = {},
  method: "GET" | "DELETE" = "GET"
): Promise<T> {
  const { clientSecret } = requireConfig();
  const proof = createHmac("sha256", clientSecret).update(accessToken).digest("hex");
  const url = `${GRAPH_API}${path}?${new URLSearchParams({ ...params, appsecret_proof: proof })}`;
  // Only GETs are retried (safe/idempotent), with exponential backoff.
  const attempts = method === "GET" ? 3 : 1;

  for (let attempt = 1; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
        signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS),
      });
    } catch {
      if (attempt < attempts) {
        await sleep(500 * 2 ** (attempt - 1));
        continue;
      }
      throw new IntegrationError("Could not reach Meta (timeout or network error).");
    }

    const body = (await res.json().catch(() => ({}))) as T & GraphError;
    if (res.ok && !body.error) return body;

    const code = body.error?.code;
    if (code === 190) await markError("Meta authorization expired or was revoked. Reconnect Meta.");
    const retryable = res.status >= 500 || res.status === 429 || (code !== undefined && RETRYABLE_GRAPH_CODES.has(code));
    if (retryable && attempt < attempts) {
      await sleep(500 * 2 ** (attempt - 1));
      continue;
    }
    if (code === 4 || code === 17 || code === 32 || code === 613 || res.status === 429) {
      throw new IntegrationError(`Meta rate limit reached (${code ?? 429}). Try again later.`);
    }
    throw new IntegrationError(`Meta API error${code ? ` (${code})` : ` (HTTP ${res.status})`}.`);
  }
}

// Marketing API writes (form-encoded; object values JSON-encoded per Graph API convention).
export async function metaGraphPost<T>(path: string, params: Record<string, unknown>): Promise<T> {
  const token = await getAccessToken();
  const { clientSecret } = requireConfig();
  const proof = createHmac("sha256", clientSecret).update(token).digest("hex");
  const body = new URLSearchParams({ appsecret_proof: proof });
  for (const [key, value] of Object.entries(params)) {
    body.set(key, typeof value === "string" ? value : JSON.stringify(value));
  }

  // Writes are never retried automatically (not idempotent).
  let res: Response;
  try {
    res = await fetch(`${GRAPH_API}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS),
    });
  } catch {
    throw new IntegrationError("Could not reach Meta (timeout or network error). Check Ads Manager before retrying.");
  }
  const json = (await res.json().catch(() => ({}))) as T & GraphError & { error?: { error_user_msg?: string } };
  if (!res.ok || json.error) {
    if (json.error?.code === 190) await markError("Meta authorization expired or was revoked. Reconnect Meta.");
    const detail = json.error?.error_user_msg ?? json.error?.message ?? "";
    throw new IntegrationError(`Meta API error${json.error?.code ? ` (${json.error.code})` : ""}. ${detail.slice(0, 300)}`.trim());
  }
  return json;
}

// Read-only Graph call with the stored token (ads_read level).
export async function metaGraphGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  return graph<T>(path, await getAccessToken(), params);
}

export async function metaGraphDelete(path: string): Promise<void> {
  await graph(path, await getAccessToken(), {}, "DELETE");
}

async function exchangeCode(config: OAuthAppConfig, code: string): Promise<MetaTokenSet> {
  const tokenUrl = (params: Record<string, string>) =>
    `${GRAPH_API}/oauth/access_token?${new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      ...params,
    })}`;

  const short = (await fetch(tokenUrl({ redirect_uri: config.redirectUri, code }), { cache: "no-store" }).then((r) =>
    r.json()
  )) as { access_token?: string };
  if (!short.access_token) throw new IntegrationError("Meta did not accept the authorization code.");

  const long = (await fetch(
    tokenUrl({ grant_type: "fb_exchange_token", fb_exchange_token: short.access_token }),
    { cache: "no-store" }
  ).then((r) => r.json())) as { access_token?: string; expires_in?: number };

  const accessToken = long.access_token ?? short.access_token;
  return {
    access_token: accessToken,
    expires_at: long.expires_in ? Date.now() + long.expires_in * 1000 : null,
  };
}

async function getAccessToken(): Promise<string> {
  const raw = await getIntegrationSecret("meta");
  if (!raw) throw new IntegrationError("Meta is not connected.");
  const token = JSON.parse(raw) as MetaTokenSet;
  if (token.expires_at && token.expires_at < Date.now()) {
    return markError("The Meta access token has expired. Reconnect Meta.");
  }
  return token.access_token;
}

async function markError(message: string): Promise<never> {
  const current = await getIntegration("meta");
  await saveIntegration(
    "meta",
    { status: "error", config: { ...current.config, last_error: message }, connected_at: current.connected_at },
    null
  );
  throw new IntegrationError(message);
}

export async function listMetaBusinesses(accessToken?: string): Promise<MetaNamedAsset[]> {
  const token = accessToken ?? (await getAccessToken());
  const res = await graph<{ data: MetaNamedAsset[] }>("/me/businesses", token, { fields: "id,name", limit: "100" });
  return res.data;
}

export async function connectMeta(code: string, actorId: string): Promise<void> {
  const config = requireConfig();
  const token = await exchangeCode(config, code);
  const me = await graph<{ id: string; name: string }>("/me", token.access_token, { fields: "id,name" });

  await setIntegrationSecret("meta", JSON.stringify(token));
  await saveIntegration(
    "meta",
    {
      status: "connected",
      config: {
        account_id: me.id,
        account_name: me.name,
        expires_at: token.expires_at ? new Date(token.expires_at).toISOString() : undefined,
        last_error: null,
      },
      connected_at: new Date().toISOString(),
    },
    actorId
  );
}


// Assets owned by or shared (as client assets) with the Business Manager. Each type is
// fetched independently so one missing permission doesn't hide the others; a type with
// any failed request is flagged so it can't be used for assignment validation.
export async function getMetaAssets(businessId: string): Promise<MetaAssetSummary> {
  if (!/^\d+$/.test(businessId)) throw new IntegrationError("Invalid Business Manager ID.");
  const token = await getAccessToken();
  const errors: string[] = [];
  const failed: Record<MetaAssetKind, boolean> = { adAccounts: false, pages: false, instagramAccounts: false };

  const fetchList = async (
    kind: MetaAssetKind,
    paths: string[],
    fields: string,
    toAsset: (row: Record<string, string>) => MetaNamedAsset
  ) => {
    const results = await Promise.allSettled(
      paths.map((p) => graph<{ data: Record<string, string>[] }>(p, token, { fields, limit: "100" }))
    );
    const items = new Map<string, MetaNamedAsset>();
    for (const [index, result] of results.entries()) {
      if (result.status === "rejected") {
        failed[kind] = true;
        errors.push(
          `${META_ASSET_LABEL[kind]}s: ${result.reason instanceof Error ? result.reason.message : "request failed"}`
        );
        continue;
      }
      // paths[0] = owned_*, paths[1] = client_* (shared with this Business Manager).
      for (const row of result.value.data) {
        const asset = { ...toAsset(row), relationship: index === 0 ? ("owned" as const) : ("client" as const) };
        if (!items.has(asset.id) || asset.relationship === "owned") items.set(asset.id, asset);
      }
    }
    return [...items.values()];
  };

  const named = (row: Record<string, string>) => ({ id: row.id, name: row.name ?? row.id });

  const [adAccounts, pages, instagramAccounts] = await Promise.all([
    fetchList("adAccounts", [`/${businessId}/owned_ad_accounts`, `/${businessId}/client_ad_accounts`], "id,name", named),
    fetchList("pages", [`/${businessId}/owned_pages`, `/${businessId}/client_pages`], "id,name", named),
    // InstagramBusinessAsset nodes: ig_user_id is the account ID used by ads/content APIs.
    fetchList(
      "instagramAccounts",
      [`/${businessId}/owned_instagram_assets`, `/${businessId}/client_instagram_assets`],
      "id,ig_user_id,ig_username",
      (row) => ({ id: row.ig_user_id ?? row.id, name: row.ig_username ?? row.ig_user_id ?? row.id })
    ),
  ]);

  return { adAccounts, pages, instagramAccounts, failed, errors };
}

export interface MetaConnectionState {
  connected: boolean;
}

export async function getMetaConnectionState(): Promise<MetaConnectionState> {
  const meta = await getIntegration("meta");
  const connected = meta.status === "connected" && getMetaOAuthConfig() !== null;
  return { connected };
}

export interface MetaPoolSyncResult {
  businesses: number;
  adAccounts: number;
  pages: number;
  instagramAccounts: number;
  errors: string[];
}

const POOL_TABLES: Record<MetaAssetKind, { table: string; idColumn: string; nameColumn: string }> = {
  adAccounts: { table: "meta_ad_accounts", idColumn: "ad_account_id", nameColumn: "name" },
  pages: { table: "meta_pages", idColumn: "page_id", nameColumn: "name" },
  instagramAccounts: { table: "meta_instagram_accounts", idColumn: "instagram_account_id", nameColumn: "username" },
};

// Refreshes the central Meta asset pool from the connected Meta account (source of truth).
// Super-admin only (caller checks). Pool rows are never deleted: assets no longer visible are
// marked inactive, so existing client assignments and history stay intact. An asset type
// that failed to load (e.g. missing permission) is left untouched rather than deactivated.
export async function syncMetaAssetPool(): Promise<MetaPoolSyncResult> {
  const businesses = (await listMetaBusinesses()).filter((b) => /^\d+$/.test(b.id));
  const db = createAdminClient();
  const now = new Date().toISOString();
  const result: MetaPoolSyncResult = { businesses: businesses.length, adAccounts: 0, pages: 0, instagramAccounts: 0, errors: [] };
  const inList = (ids: string[]) => `(${ids.map((id) => `"${id}"`).join(",")})`;

  if (businesses.length) {
    const { error } = await db
      .from("meta_business_managers")
      .upsert(businesses.map((b) => ({ business_id: b.id, name: (b.name || b.id).slice(0, 300), is_active: true, synced_at: now })));
    if (error) throw new IntegrationError("Could not save the Meta Business Managers.");
  }
  let stale = db.from("meta_business_managers").update({ is_active: false, synced_at: now });
  stale = businesses.length ? stale.not("business_id", "in", inList(businesses.map((b) => b.id))) : stale.neq("business_id", "");
  await stale;

  // Sequential per Business Manager to stay well inside Meta rate limits.
  for (const business of businesses) {
    let assets: MetaAssetSummary;
    try {
      assets = await getMetaAssets(business.id);
    } catch (error) {
      result.errors.push(`${business.name}: ${error instanceof Error ? error.message : "could not load assets"}`);
      continue;
    }
    result.errors.push(...assets.errors.map((e) => `${business.name} — ${e}`));

    for (const kind of Object.keys(POOL_TABLES) as MetaAssetKind[]) {
      if (assets.failed[kind]) continue;
      const { table, idColumn, nameColumn } = POOL_TABLES[kind];
      const valid = assets[kind].filter((a) => (kind === "adAccounts" ? /^act_\d+$/ : /^\d+$/).test(a.id));
      if (valid.length) {
        const { error } = await db.from(table).upsert(
          valid.map((a) => ({
            business_id: business.id,
            [idColumn]: a.id,
            [nameColumn]: (a.name || a.id).slice(0, 300),
            relationship: a.relationship ?? "owned",
            is_active: true,
            synced_at: now,
          })),
          { onConflict: `business_id,${idColumn}` }
        );
        if (error) {
          result.errors.push(`${business.name}: could not save ${META_ASSET_LABEL[kind]}s.`);
          continue;
        }
      }
      let inactive = db.from(table).update({ is_active: false, synced_at: now }).eq("business_id", business.id);
      if (valid.length) inactive = inactive.not(idColumn, "in", inList(valid.map((a) => a.id)));
      await inactive;
      result[kind] += valid.length;
    }
  }

  logEvent(result.errors.length ? "warn" : "info", {
    provider: "meta",
    operation: "sync_asset_pool",
    status: result.errors.length ? "partial" : "succeeded",
    error: result.errors.slice(0, 3).join(" | ") || undefined,
  });
  return result;
}

export async function disconnectMeta(actorId: string): Promise<void> {
  const raw = await getIntegrationSecret("meta");
  if (raw && getMetaOAuthConfig()) {
    const { access_token } = JSON.parse(raw) as MetaTokenSet;
    await graph("/me/permissions", access_token, {}, "DELETE").catch(() => undefined);
  }
  await clearIntegration("meta", actorId);
}
