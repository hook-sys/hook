"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/session";
import { POOL_KIND_LABEL, isMetaId, validateAddition, type MetaPoolKind } from "@/lib/meta/asset-assignment";
import { logEvent } from "@/lib/observability";
import { getClientById } from "@/lib/services/clients";
import { getClientMetaAssignments, listMetaAssetPool } from "@/lib/services/meta-assets";
import { createClient } from "@/lib/supabase/server";

// Super-admin-only management of which central Meta assets a client may use. Every ID is
// re-validated against the central pool server-side; RLS additionally restricts all writes
// to super admins. Removing an assignment never touches the pool or the Meta account.

export interface MetaAssetActionState {
  status: "idle" | "error" | "success";
  message?: string;
}

const ASSIGNMENT_TABLES: Record<MetaPoolKind, { table: string; idColumn: string }> = {
  adAccounts: { table: "client_meta_ad_accounts", idColumn: "ad_account_id" },
  pages: { table: "client_meta_pages", idColumn: "page_id" },
  instagramAccounts: { table: "client_meta_instagram_accounts", idColumn: "instagram_account_id" },
};

const clientPath = (clientId: string) => `/admin/clients/${clientId}`;
const readList = (formData: FormData, name: string) => formData.getAll(name).map(String);

// Adds (never replaces) assets of one type from the selected Business Manager to the client.
// The BM itself is assigned too if it isn't yet. Existing assignments are left unchanged;
// assets the client already has are skipped, and the primary keys prevent duplicates.
export async function addClientMetaAssets(
  clientId: string,
  kind: MetaPoolKind,
  _prev: MetaAssetActionState,
  formData: FormData
): Promise<MetaAssetActionState> {
  const admin = await requireSuperAdmin();
  if (!(kind in ASSIGNMENT_TABLES)) return { status: "error", message: "Invalid asset type." };
  const client = await getClientById(clientId);
  if (!client) return { status: "error", message: "Client not found." };

  // Re-validated against the central pool + current assignments (server-side, never trusted from the browser).
  const [pool, current] = await Promise.all([listMetaAssetPool(), getClientMetaAssignments(client.id)]);
  const checked = validateAddition(
    { kind, businessId: String(formData.get("business_id") ?? ""), assetIds: readList(formData, "asset_ids") },
    pool,
    current
  );
  if (!checked.ok) return { status: "error", message: checked.error };

  const supabase = await createClient();
  const { error: bmError } = await supabase
    .from("client_meta_business_managers")
    .upsert({ client_id: client.id, business_id: checked.businessId, assigned_by: admin.id }, { onConflict: "client_id,business_id", ignoreDuplicates: true });
  if (bmError) return { status: "error", message: "Could not assign the Business Manager." };

  const { table, idColumn } = ASSIGNMENT_TABLES[kind];
  const { error } = await supabase.from(table).upsert(
    checked.toAdd.map((id) => ({ client_id: client.id, business_id: checked.businessId, [idColumn]: id, assigned_by: admin.id })),
    { onConflict: `client_id,${idColumn}`, ignoreDuplicates: true }
  );
  if (error) return { status: "error", message: "Could not add the selected assets." };

  logEvent("info", { provider: "meta", operation: "add_client_assets", clientId: client.id, userId: admin.id, status: "succeeded" });
  revalidatePath(clientPath(client.id));
  const skipped = checked.alreadyAssigned.length ? ` (${checked.alreadyAssigned.length} already assigned, skipped)` : "";
  return { status: "success", message: `Added ${checked.toAdd.length} ${POOL_KIND_LABEL[kind]}${checked.toAdd.length === 1 ? "" : "s"}${skipped}.` };
}

// Assigns only the Business Manager (no assets yet).
export async function addClientBusinessManager(clientId: string, businessId: string): Promise<MetaAssetActionState> {
  const admin = await requireSuperAdmin();
  const client = await getClientById(clientId);
  if (!client) return { status: "error", message: "Client not found." };
  const pool = await listMetaAssetPool();
  const bm = pool.businesses.find((b) => b.business_id === businessId);
  if (!isMetaId("business", businessId) || !bm?.is_active) return { status: "error", message: "That Business Manager is not available in the Meta asset pool." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("client_meta_business_managers")
    .upsert({ client_id: client.id, business_id: businessId, assigned_by: admin.id }, { onConflict: "client_id,business_id", ignoreDuplicates: true });
  if (error) return { status: "error", message: "Could not assign the Business Manager." };
  revalidatePath(clientPath(client.id));
  return { status: "success", message: "Business Manager assigned." };
}

// Removes a Business Manager from the client, together with the client's assets under it.
export async function removeClientBusinessManager(clientId: string, businessId: string): Promise<MetaAssetActionState> {
  await requireSuperAdmin();
  if (!isMetaId("business", businessId)) return { status: "error", message: "Invalid Business Manager." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("client_meta_business_managers")
    .delete()
    .eq("client_id", clientId)
    .eq("business_id", businessId)
    .select("business_id");
  if (error || !data?.length) return { status: "error", message: "Could not remove the Business Manager." };
  revalidatePath(clientPath(clientId));
  return { status: "success", message: "Business Manager removed from this client." };
}

// Removes one asset from the client (assignment only).
export async function removeClientMetaAsset(clientId: string, kind: MetaPoolKind, assetId: string): Promise<MetaAssetActionState> {
  await requireSuperAdmin();
  if (!(kind in ASSIGNMENT_TABLES) || !isMetaId(kind, assetId)) return { status: "error", message: "Invalid asset." };
  const { table, idColumn } = ASSIGNMENT_TABLES[kind];
  const supabase = await createClient();
  const { data, error } = await supabase.from(table).delete().eq("client_id", clientId).eq(idColumn, assetId).select(idColumn);
  if (error || !data?.length) return { status: "error", message: "Could not remove the asset." };
  revalidatePath(clientPath(clientId));
  return { status: "success", message: "Removed from this client." };
}
