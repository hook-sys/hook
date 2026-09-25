"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/session";
import { isMetaId, validateAssignment, type MetaPoolKind } from "@/lib/meta/asset-assignment";
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

// Assigns a Business Manager and sets exactly which of its ad accounts / Pages / Instagram
// accounts this client may use (other Business Managers' assignments are untouched).
export async function assignClientMetaAssets(
  clientId: string,
  _prev: MetaAssetActionState,
  formData: FormData
): Promise<MetaAssetActionState> {
  const admin = await requireSuperAdmin();
  const client = await getClientById(clientId);
  if (!client) return { status: "error", message: "Client not found." };

  const [pool, current] = await Promise.all([listMetaAssetPool(), getClientMetaAssignments(client.id)]);
  const checked = validateAssignment(
    {
      businessId: String(formData.get("business_id") ?? ""),
      adAccountIds: readList(formData, "ad_account_ids"),
      pageIds: readList(formData, "page_ids"),
      instagramAccountIds: readList(formData, "instagram_account_ids"),
    },
    pool,
    current
  );
  if (!checked.ok) return { status: "error", message: checked.error };

  const supabase = await createClient();
  const { error: bmError } = await supabase
    .from("client_meta_business_managers")
    .upsert({ client_id: client.id, business_id: checked.businessId, assigned_by: admin.id }, { onConflict: "client_id,business_id", ignoreDuplicates: true });
  if (bmError) return { status: "error", message: "Could not assign the Business Manager." };

  const selected: Record<MetaPoolKind, string[]> = {
    adAccounts: checked.adAccountIds,
    pages: checked.pageIds,
    instagramAccounts: checked.instagramAccountIds,
  };
  for (const kind of Object.keys(ASSIGNMENT_TABLES) as MetaPoolKind[]) {
    const { table, idColumn } = ASSIGNMENT_TABLES[kind];
    const ids = selected[kind];
    // Unselected assets of this BM are unassigned (assignment rows only).
    let remove = supabase.from(table).delete().eq("client_id", client.id).eq("business_id", checked.businessId);
    if (ids.length) remove = remove.not(idColumn, "in", `(${ids.map((id) => `"${id}"`).join(",")})`);
    const { error: removeError } = await remove;
    if (removeError) return { status: "error", message: "Could not update the assignment." };

    if (ids.length) {
      // An asset already assigned to this client (e.g. via another Business Manager) is kept as-is.
      const { error: addError } = await supabase.from(table).upsert(
        ids.map((id) => ({ client_id: client.id, business_id: checked.businessId, [idColumn]: id, assigned_by: admin.id })),
        { onConflict: `client_id,${idColumn}`, ignoreDuplicates: true }
      );
      if (addError) return { status: "error", message: "Could not save the assignment." };
    }
  }

  logEvent("info", { provider: "meta", operation: "assign_client_assets", clientId: client.id, userId: admin.id, status: "succeeded" });
  revalidatePath(clientPath(client.id));
  return { status: "success", message: "Meta assets assigned." };
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
