import type { CampaignStrategy, MetaObjective } from "@/lib/ai/campaign-strategy";
import type { CampaignStatus } from "@/lib/creative/status";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation/ids";
import type { HatogStageKey } from "@/types/ai";

export interface Campaign {
  id: string;
  client_id: string;
  product_id: string;
  name: string;
  objective: MetaObjective;
  hatog_stage: HatogStageKey | null;
  status: CampaignStatus;
  strategy: Partial<CampaignStrategy>;
  daily_budget: number | null;
  budget_currency: string;
  meta_ad_account_id: string | null;
  meta_page_id: string | null;
  meta_instagram_account_id: string | null;
  meta_campaign_id: string | null;
  meta_adset_id: string | null;
  meta_ad_ids: string[];
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

function normalize(row: Campaign): Campaign {
  return { ...row, daily_budget: row.daily_budget === null ? null : Number(row.daily_budget) };
}

// Caller's session: RLS limits rows to super admins or sub-admins with `campaigns` on an
// assigned client; every query is also scoped by client_id.
export async function listCampaigns(clientId: string): Promise<Campaign[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campaigns")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as Campaign[]).map(normalize);
}

export async function getCampaign(clientId: string, campaignId: string): Promise<Campaign | null> {
  if (!isUuid(clientId) || !isUuid(campaignId)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("campaigns").select("*").eq("client_id", clientId).eq("id", campaignId).maybeSingle();
  return data ? normalize(data as Campaign) : null;
}

export async function getCampaignCreativeIds(clientId: string, campaignId: string): Promise<string[]> {
  if (!isUuid(clientId) || !isUuid(campaignId)) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("campaign_creatives")
    .select("creative_id")
    .eq("client_id", clientId)
    .eq("campaign_id", campaignId)
    .order("position");
  return (data ?? []).map((r) => r.creative_id as string);
}
