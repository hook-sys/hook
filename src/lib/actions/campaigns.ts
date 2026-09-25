"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { META_CTAS, META_OBJECTIVES } from "@/lib/ai/campaign-strategy";
import { getAiProviderReadiness } from "@/lib/ai/usage";
import { requirePermission, requireSuperAdmin } from "@/lib/auth/session";
import { canTransitionCampaign, type CampaignStatus } from "@/lib/creative/status";
import { getMetaConnectionState, isMetaPublishingEnabled } from "@/lib/integrations/meta";
import { publishCampaignToMeta } from "@/lib/integrations/meta-ads";
import { IntegrationError } from "@/lib/integrations/types";
import { publishBlockers } from "@/lib/meta/ads-payloads";
import { logEvent } from "@/lib/observability";
import { getCampaign, getCampaignCreativeIds } from "@/lib/services/campaigns";
import { getCreativesByIds } from "@/lib/services/creatives";
import { getProduct } from "@/lib/services/products";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { createCampaignDraftCore, metaSnapshot } from "@/lib/workflows/campaigns";

export interface CampaignActionState {
  status: "idle" | "error" | "success";
  message?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EDITABLE: CampaignStatus[] = ["draft", "ready_for_review"];

function campaignsPath(clientId: string, campaignId?: string) {
  return `/admin/clients/${clientId}/campaigns${campaignId ? `/${campaignId}` : ""}`;
}

export async function createCampaignDraft(
  clientId: string,
  _prev: CampaignActionState,
  formData: FormData
): Promise<CampaignActionState> {
  const profile = await requirePermission("campaigns");
  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const mode = get("mode") === "ai" ? "ai" : "blank";

  if (mode === "ai" && (await getAiProviderReadiness()).claude !== "ready") {
    return { status: "error", message: "Connect Claude to generate a strategy, or create a blank draft." };
  }
  const result = await createCampaignDraftCore(profile, clientId, {
    mode,
    productId: get("product_id"),
    hatogStage: get("hatog_stage"),
    objective: get("objective") || null,
    notes: get("notes") || null,
    name: get("name") || null,
  });
  if (!result.ok) return { status: "error", message: result.message };
  revalidatePath(campaignsPath(clientId));
  redirect(campaignsPath(clientId, result.value.campaignId));
}

export async function updateCampaignDetails(
  clientId: string,
  campaignId: string,
  _prev: CampaignActionState,
  formData: FormData
): Promise<CampaignActionState> {
  await requirePermission("campaigns");
  const campaign = await getCampaign(clientId, campaignId);
  if (!campaign) return { status: "error", message: "Campaign not found." };
  if (!EDITABLE.includes(campaign.status)) return { status: "error", message: "Move the campaign back to Draft to edit it." };

  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const name = get("name");
  const objective = get("objective");
  const budget = get("daily_budget");
  const currency = get("budget_currency") || "BDT";
  const cta = get("cta");
  const copy = { primary_text: get("primary_text"), headline: get("headline"), description: get("description") };

  if (!name || name.length > 200) return { status: "error", message: "Enter a campaign name (max 200 characters)." };
  if (!(META_OBJECTIVES as readonly string[]).includes(objective)) return { status: "error", message: "Select an objective." };
  if (budget && !/^\d{1,10}(\.\d{1,2})?$/.test(budget)) return { status: "error", message: "Enter a valid daily budget." };
  if (budget && Number(budget) <= 0) return { status: "error", message: "Daily budget must be greater than 0." };
  if (!/^[A-Z]{3}$/.test(currency)) return { status: "error", message: "Enter a 3-letter currency code." };
  if (cta && !(META_CTAS as readonly string[]).includes(cta)) return { status: "error", message: "Select a valid CTA." };
  if (copy.primary_text.length > 2000 || copy.headline.length > 255 || copy.description.length > 255) {
    return { status: "error", message: "Ad copy is too long." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campaigns")
    .update({
      name,
      objective,
      daily_budget: budget ? Number(budget) : null,
      budget_currency: currency,
      strategy: { ...campaign.strategy, ...copy, ...(cta ? { cta } : {}) },
    })
    .eq("client_id", clientId)
    .eq("id", campaignId)
    .select("id");
  if (error || !data?.length) return { status: "error", message: "Could not save the campaign." };

  revalidatePath(campaignsPath(clientId, campaignId));
  return { status: "success", message: "Campaign saved." };
}

export async function setCampaignCreatives(
  clientId: string,
  campaignId: string,
  _prev: CampaignActionState,
  formData: FormData
): Promise<CampaignActionState> {
  await requirePermission("campaigns");
  const campaign = await getCampaign(clientId, campaignId);
  if (!campaign) return { status: "error", message: "Campaign not found." };
  if (!EDITABLE.includes(campaign.status)) return { status: "error", message: "Move the campaign back to Draft to change creatives." };

  const ids = [...new Set(formData.getAll("creative_ids").map(String))];
  if (ids.length > 10 || ids.some((id) => !UUID.test(id))) return { status: "error", message: "Select up to 10 creatives." };

  // Only this client's ready creatives are accepted (RLS + client_id scope + composite FK).
  const creatives = await getCreativesByIds(clientId, ids);
  if (creatives.length !== ids.length || creatives.some((c) => c.status !== "ready")) {
    return { status: "error", message: "Only this client's ready creatives can be selected." };
  }

  const supabase = await createClient();
  const { error: deleteError } = await supabase
    .from("campaign_creatives")
    .delete()
    .eq("client_id", clientId)
    .eq("campaign_id", campaignId);
  if (deleteError) return { status: "error", message: "Could not update creatives." };

  if (ids.length > 0) {
    const { error } = await supabase
      .from("campaign_creatives")
      .insert(ids.map((creative_id, position) => ({ campaign_id: campaignId, creative_id, client_id: clientId, position })));
    if (error) return { status: "error", message: "Could not update creatives." };
  }

  revalidatePath(campaignsPath(clientId, campaignId));
  return { status: "success", message: `${ids.length} creative(s) selected.` };
}

export async function setCampaignStatus(
  clientId: string,
  campaignId: string,
  to: CampaignStatus
): Promise<CampaignActionState> {
  const profile = await requirePermission("campaigns");
  const campaign = await getCampaign(clientId, campaignId);
  if (!campaign) return { status: "error", message: "Campaign not found." };
  if (!canTransitionCampaign(campaign.status, to, profile.role)) {
    return { status: "error", message: "You can't make that status change." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campaigns")
    .update({ status: to })
    .eq("client_id", clientId)
    .eq("id", campaignId)
    .select("id");
  if (error || !data?.length) return { status: "error", message: "Could not change the status." };

  revalidatePath(campaignsPath(clientId, campaignId));
  revalidatePath(campaignsPath(clientId));
  return { status: "success", message: "Status updated." };
}

export async function refreshCampaignMetaAssets(clientId: string, campaignId: string): Promise<CampaignActionState> {
  await requirePermission("campaigns");
  const campaign = await getCampaign(clientId, campaignId);
  if (!campaign) return { status: "error", message: "Campaign not found." };
  if (!EDITABLE.includes(campaign.status)) return { status: "error", message: "Move the campaign back to Draft first." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campaigns")
    .update(await metaSnapshot(clientId))
    .eq("client_id", clientId)
    .eq("id", campaignId)
    .select("id");
  if (error || !data?.length) return { status: "error", message: "Could not refresh Meta assets." };

  revalidatePath(campaignsPath(clientId, campaignId));
  return { status: "success", message: "Meta assets refreshed from the client's assignment." };
}

// Super admin only, behind META_PUBLISHING_ENABLED, approved campaigns only, with an explicit
// typed confirmation. Everything is created PAUSED in Meta.
export async function publishCampaign(
  clientId: string,
  campaignId: string,
  _prev: CampaignActionState,
  formData: FormData
): Promise<CampaignActionState> {
  const profile = await requireSuperAdmin();
  if (String(formData.get("confirm") ?? "") !== "PUBLISH") {
    return { status: "error", message: 'Type PUBLISH to confirm.' };
  }

  const campaign = await getCampaign(clientId, campaignId);
  if (!campaign) return { status: "error", message: "Campaign not found." };
  const product = await getProduct(clientId, campaign.product_id);
  const creatives = await getCreativesByIds(clientId, await getCampaignCreativeIds(clientId, campaignId));
  const meta = await getMetaConnectionState();

  const input = {
    campaign,
    productUrl: product?.product_url ?? null,
    creatives,
    metaConnected: meta.connected,
    publishingEnabled: isMetaPublishingEnabled(),
  };
  const blockers = publishBlockers(input);
  if (blockers.length > 0) return { status: "error", message: blockers[0] };

  // Idempotency guard: claim the publish so a double submit can't create two Meta campaigns
  // (a stale claim older than 10 minutes can be retaken after a crash).
  const admin = createAdminClient();
  const staleBefore = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: claimed } = await admin
    .from("campaigns")
    .update({ publish_started_at: new Date().toISOString() })
    .eq("client_id", clientId)
    .eq("id", campaignId)
    .eq("status", "approved")
    .is("meta_campaign_id", null)
    .or(`publish_started_at.is.null,publish_started_at.lt."${staleBefore}"`)
    .select("id");
  if (!claimed?.length) return { status: "error", message: "A publish for this campaign is already in progress or done." };

  let published;
  const started = Date.now();
  try {
    published = await publishCampaignToMeta(input);
  } catch (error) {
    await admin.from("campaigns").update({ publish_started_at: null }).eq("client_id", clientId).eq("id", campaignId);
    logEvent("warn", { provider: "meta", operation: "publish_campaign", clientId, userId: profile.id, status: "failed", durationMs: Date.now() - started, error: error instanceof Error ? error.message : "unknown" });
    return { status: "error", message: error instanceof IntegrationError ? error.message : "Publishing to Meta failed." };
  }

  // Recorded with the service role only after Meta returned real IDs.
  const { error } = await admin
    .from("campaigns")
    .update({
      status: "published",
      meta_campaign_id: published.campaignId,
      meta_adset_id: published.adsetId,
      meta_ad_ids: published.adIds,
      published_at: new Date().toISOString(),
      publish_started_at: null,
    })
    .eq("client_id", clientId)
    .eq("id", campaignId);
  logEvent("info", { provider: "meta", operation: "publish_campaign", clientId, userId: profile.id, status: "succeeded", durationMs: Date.now() - started, requestId: published.campaignId });
  if (error) {
    return { status: "error", message: `Created in Meta (campaign ${published.campaignId}, paused) but saving the IDs failed.` };
  }

  revalidatePath(campaignsPath(clientId, campaignId));
  return { status: "success", message: "Created in Meta as PAUSED. Review and activate it in Ads Manager." };
}
