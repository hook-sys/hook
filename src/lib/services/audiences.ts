import type { AudienceStatus, AudienceType } from "@/lib/meta/audiences";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation/ids";
import type { HatogStageKey } from "@/types/ai";

export interface Audience {
  id: string;
  client_id: string;
  name: string;
  audience_type: AudienceType;
  source: string | null;
  description: string | null;
  hatog_stage: HatogStageKey | null;
  retention_days: number;
  status: AudienceStatus;
  meta_audience_id: string | null;
  meta_ad_account_id: string | null;
  approximate_count_lower: number | null;
  approximate_count_upper: number | null;
  delivery_status_code: number | null;
  delivery_status_description: string | null;
  operation_status_code: number | null;
  last_synced_at: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

// Caller's session: RLS limits rows to super admins or sub-admins with `ai_ads` on an
// assigned client; every query is also scoped by client_id.
export async function listAudiences(clientId: string, opts: { includeArchived?: boolean } = {}): Promise<Audience[]> {
  const supabase = await createClient();
  let query = supabase.from("audiences").select("*").eq("client_id", clientId).order("created_at", { ascending: false }).limit(200);
  if (!opts.includeArchived) query = query.neq("status", "archived");
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as Audience[];
}

export async function getAudience(clientId: string, audienceId: string): Promise<Audience | null> {
  if (!isUuid(clientId) || !isUuid(audienceId)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("audiences").select("*").eq("client_id", clientId).eq("id", audienceId).maybeSingle();
  return (data as Audience | null) ?? null;
}
