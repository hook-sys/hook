import type { CampaignStrategy, MetaObjective } from "@/lib/ai/campaign-strategy";

// Pure Marketing API payload builders + publish eligibility. Everything is created PAUSED.
// Only objectives with a well-defined, pixel-free setup are automated for now.

export const PUBLISHABLE_OBJECTIVES: Partial<Record<MetaObjective, { optimizationGoal: string; destinationType?: string }>> = {
  OUTCOME_AWARENESS: { optimizationGoal: "REACH" },
  OUTCOME_TRAFFIC: { optimizationGoal: "LINK_CLICKS", destinationType: "WEBSITE" },
  OUTCOME_ENGAGEMENT: { optimizationGoal: "POST_ENGAGEMENT" },
};

export interface PublishInput {
  campaign: {
    name: string;
    objective: MetaObjective;
    status: string;
    daily_budget: number | null;
    meta_ad_account_id: string | null;
    meta_page_id: string | null;
    meta_instagram_account_id: string | null;
    meta_campaign_id: string | null;
    strategy: Partial<CampaignStrategy>;
  };
  productUrl: string | null;
  // source "drive" = an existing Google Drive image (uploaded to Meta by the server at publish time).
  creatives: { id: string; media: string; status: string; asset_url: string | null; source?: string; drive_file_id?: string | null }[];
  metaConnected: boolean;
  publishingEnabled: boolean;
}

export function publishBlockers(input: PublishInput): string[] {
  const { campaign } = input;
  const s = campaign.strategy;
  const blockers: string[] = [];
  if (!input.publishingEnabled) blockers.push("Publishing to Meta is disabled on this server (META_PUBLISHING_ENABLED).");
  if (!input.metaConnected) blockers.push("Connect Meta.");
  if (campaign.status !== "approved") blockers.push("The campaign must be approved.");
  if (campaign.meta_campaign_id) blockers.push("This campaign was already published.");
  if (!campaign.meta_ad_account_id || !campaign.meta_page_id) blockers.push("Assign Meta assets first (ad account and Page).");
  if (!PUBLISHABLE_OBJECTIVES[campaign.objective]) {
    blockers.push("This objective isn't automated yet — create it in Ads Manager, or use Awareness, Traffic or Engagement.");
  }
  if (!campaign.daily_budget || campaign.daily_budget <= 0) blockers.push("Set a daily budget.");
  if (!input.productUrl) blockers.push("The product needs a Product URL for the ad link.");
  if (!s.primary_text || !s.headline || !s.cta) blockers.push("Primary text, headline and CTA are required.");
  if (!s.target_audience?.countries?.length) blockers.push("Target countries are required.");
  const images = input.creatives.filter((c) => c.status === "ready" && c.media === "image" && c.asset_url);
  if (images.length === 0) blockers.push("Select at least one ready image creative.");
  if (input.creatives.some((c) => c.media === "video")) {
    blockers.push("Video creatives can't be published automatically yet — remove them or publish in Ads Manager.");
  }
  return blockers;
}

export function buildCampaignPayload(campaign: PublishInput["campaign"]) {
  return {
    name: campaign.name,
    objective: campaign.objective,
    status: "PAUSED",
    special_ad_categories: [],
    buying_type: "AUCTION",
  };
}

// Meta budgets are in the ad account currency's minor units (e.g. poisha/cents).
export function toMinorUnits(amount: number): number {
  return Math.round(amount * 100);
}

export function buildAdSetPayload(campaign: PublishInput["campaign"], metaCampaignId: string) {
  const goal = PUBLISHABLE_OBJECTIVES[campaign.objective];
  if (!goal) throw new Error("Objective is not publishable.");
  const audience = campaign.strategy.target_audience!;
  return {
    name: `${campaign.name} — Ad Set`,
    campaign_id: metaCampaignId,
    daily_budget: toMinorUnits(campaign.daily_budget!),
    billing_event: "IMPRESSIONS",
    optimization_goal: goal.optimizationGoal,
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    ...(goal.destinationType ? { destination_type: goal.destinationType } : {}),
    targeting: {
      geo_locations: { countries: audience.countries },
      age_min: audience.age_min,
      age_max: audience.age_max,
      ...(audience.genders === "male" ? { genders: [1] } : audience.genders === "female" ? { genders: [2] } : {}),
    },
    status: "PAUSED",
  };
}

// Image by public URL (generated creatives) or by Meta image hash (Drive images uploaded to
// the ad account's image library, since Meta can't fetch private Drive files).
export function buildImageAdCreativePayload(
  campaign: PublishInput["campaign"],
  creative: { id: string; asset_url?: string; image_hash?: string },
  productUrl: string
) {
  const s = campaign.strategy;
  return {
    name: `${campaign.name} — Creative ${creative.id.slice(0, 8)}`,
    object_story_spec: {
      page_id: campaign.meta_page_id,
      ...(campaign.meta_instagram_account_id ? { instagram_user_id: campaign.meta_instagram_account_id } : {}),
      link_data: {
        ...(creative.image_hash ? { image_hash: creative.image_hash } : { picture: creative.asset_url }),
        link: productUrl,
        message: s.primary_text,
        name: s.headline,
        ...(s.description ? { description: s.description } : {}),
        call_to_action: { type: s.cta, value: { link: productUrl } },
      },
    },
  };
}

export function buildAdPayload(campaignName: string, adsetId: string, creativeId: string, index: number) {
  return {
    name: `${campaignName} — Ad ${index + 1}`,
    adset_id: adsetId,
    creative: { creative_id: creativeId },
    status: "PAUSED",
  };
}
