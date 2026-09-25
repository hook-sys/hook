"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/session";
import { resolveClientMetaAssets } from "@/lib/integrations/meta";
import { IntegrationError } from "@/lib/integrations/types";
import { getClientById } from "@/lib/services/clients";
import { createClient } from "@/lib/supabase/server";

export interface MetaAssetActionState {
  status: "idle" | "error" | "success";
  message?: string;
}

function readId(formData: FormData, name: string): string | null {
  const value = String(formData.get(name) ?? "").trim();
  return value || null;
}

export async function assignClientMetaAssets(
  clientId: string,
  _prev: MetaAssetActionState,
  formData: FormData
): Promise<MetaAssetActionState> {
  const admin = await requireSuperAdmin();
  const client = await getClientById(clientId);
  if (!client) return { status: "error", message: "Client not found." };

  const selection = {
    adAccountId: readId(formData, "ad_account_id"),
    facebookPageId: readId(formData, "facebook_page_id"),
    instagramAccountId: readId(formData, "instagram_account_id"),
  };

  const supabase = await createClient();

  if (!selection.adAccountId && !selection.facebookPageId && !selection.instagramAccountId) {
    const { error } = await supabase.from("client_meta_assets").delete().eq("client_id", client.id);
    if (error) return { status: "error", message: "Could not remove the Meta assets." };
    revalidatePath(`/admin/clients/${client.id}`);
    return { status: "success", message: "Meta assets removed." };
  }

  try {
    const { businessId, businessName, assets } = await resolveClientMetaAssets(selection);

    const { error } = await supabase.from("client_meta_assets").upsert({
      client_id: client.id,
      business_id: businessId,
      business_name: businessName,
      ad_account_id: assets.adAccount?.id ?? null,
      ad_account_name: assets.adAccount?.name ?? null,
      facebook_page_id: assets.facebookPage?.id ?? null,
      facebook_page_name: assets.facebookPage?.name ?? null,
      instagram_account_id: assets.instagramAccount?.id ?? null,
      instagram_username: assets.instagramAccount?.name ?? null,
      updated_by: admin.id,
    });
    if (error) return { status: "error", message: "Could not save the Meta assets." };
  } catch (error) {
    if (error instanceof IntegrationError) return { status: "error", message: error.message };
    console.error("Meta asset assignment failed:", error instanceof Error ? error.message : "unknown error");
    return { status: "error", message: "Could not assign the Meta assets." };
  }

  revalidatePath(`/admin/clients/${client.id}`);
  return { status: "success", message: "Meta assets saved." };
}

export async function removeClientMetaAssets(clientId: string): Promise<MetaAssetActionState> {
  await requireSuperAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("client_meta_assets").delete().eq("client_id", clientId);
  if (error) return { status: "error", message: "Could not remove the Meta assets." };
  revalidatePath(`/admin/clients/${clientId}`);
  return { status: "success", message: "Meta assets removed." };
}
