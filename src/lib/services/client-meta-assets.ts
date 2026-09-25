import { createClient } from "@/lib/supabase/server";
import type { ClientMetaAssets } from "@/types/client";

// Uses the caller's session: RLS returns the row only to super admins or to sub-admins
// assigned to this client.
export async function getClientMetaAssets(clientId: string): Promise<ClientMetaAssets | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("client_meta_assets")
    .select(
      "client_id, business_id, business_name, ad_account_id, ad_account_name, facebook_page_id, facebook_page_name, instagram_account_id, instagram_username, updated_at"
    )
    .eq("client_id", clientId)
    .maybeSingle();
  return data as ClientMetaAssets | null;
}
