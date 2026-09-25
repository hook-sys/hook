import { cache } from "react";
import {
  EMPTY_ASSIGNMENTS,
  type AssignedAsset,
  type ClientMetaAssignments,
  type MetaAssetPool,
} from "@/lib/meta/asset-assignment";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation/ids";

// All reads use the caller's session. RLS: the central pool is visible to super admins;
// sub-admins only see pool rows assigned to clients they're assigned to.

// Embedded pool row (PostgREST may return an object or a one-element array).
const nameOf = (row: unknown, fallback: string): string => {
  const v = (Array.isArray(row) ? row[0] : row) as { name?: unknown; username?: unknown } | null | undefined;
  const name = v?.name ?? v?.username;
  return typeof name === "string" && name ? name : fallback;
};
const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);

// Super admin: the full central pool (including inactive rows, flagged).
export async function listMetaAssetPool(): Promise<MetaAssetPool> {
  const supabase = await createClient();
  const [bm, ad, pg, ig] = await Promise.all([
    supabase.from("meta_business_managers").select("business_id, name, is_active").order("name"),
    supabase.from("meta_ad_accounts").select("business_id, ad_account_id, name, is_active").order("name"),
    supabase.from("meta_pages").select("business_id, page_id, name, is_active").order("name"),
    supabase.from("meta_instagram_accounts").select("business_id, instagram_account_id, username, is_active").order("username"),
  ]);
  return {
    businesses: (bm.data ?? []) as MetaAssetPool["businesses"],
    adAccounts: (ad.data ?? []).map((r) => ({ business_id: r.business_id, id: r.ad_account_id, name: r.name, is_active: r.is_active })),
    pages: (pg.data ?? []).map((r) => ({ business_id: r.business_id, id: r.page_id, name: r.name, is_active: r.is_active })),
    instagramAccounts: (ig.data ?? []).map((r) => ({ business_id: r.business_id, id: r.instagram_account_id, name: r.username, is_active: r.is_active })),
  };
}

// The Meta assets assigned to one client (per-request memoized).
export const getClientMetaAssignments = cache(async (clientId: string): Promise<ClientMetaAssignments> => {
  if (!isUuid(clientId)) return EMPTY_ASSIGNMENTS;
  const supabase = await createClient();
  const [bm, ad, pg, ig] = await Promise.all([
    supabase.from("client_meta_business_managers").select("business_id, meta_business_managers(name)").eq("client_id", clientId),
    supabase.from("client_meta_ad_accounts").select("business_id, ad_account_id, meta_ad_accounts(name)").eq("client_id", clientId),
    supabase.from("client_meta_pages").select("business_id, page_id, meta_pages(name)").eq("client_id", clientId),
    supabase
      .from("client_meta_instagram_accounts")
      .select("business_id, instagram_account_id, meta_instagram_accounts(username)")
      .eq("client_id", clientId),
  ]);
  const assets = (rows: Record<string, unknown>[] | null, idKey: string, relation: string): AssignedAsset[] =>
    (rows ?? [])
      .map((r) => ({
        business_id: String(r.business_id),
        id: String(r[idKey]),
        name: nameOf(r[relation], String(r[idKey])),
      }))
      .sort(byName);

  return {
    businesses: (bm.data ?? [])
      .map((r) => ({ business_id: r.business_id as string, name: nameOf(r.meta_business_managers, r.business_id as string) }))
      .sort(byName),
    adAccounts: assets(ad.data, "ad_account_id", "meta_ad_accounts"),
    pages: assets(pg.data, "page_id", "meta_pages"),
    instagramAccounts: assets(ig.data, "instagram_account_id", "meta_instagram_accounts"),
  };
});
