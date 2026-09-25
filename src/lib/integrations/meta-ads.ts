import {
  buildAdPayload,
  buildAdSetPayload,
  buildCampaignPayload,
  buildImageAdCreativePayload,
  publishBlockers,
  type PublishInput,
} from "@/lib/meta/ads-payloads";
import { isMetaPublishingEnabled, metaGraphDelete, metaGraphPost } from "@/lib/integrations/meta";
import { IntegrationError } from "@/lib/integrations/types";

export interface PublishedIds {
  campaignId: string;
  adsetId: string;
  adIds: string[];
}

// Creates the campaign, ad set, creatives and ads in Meta — all PAUSED — for an approved
// draft. Gated by META_PUBLISHING_ENABLED and re-checks every blocker server-side. If any
// step fails after the campaign exists, the campaign is deleted so no half-built campaign
// is left behind.
export async function publishCampaignToMeta(input: PublishInput): Promise<PublishedIds> {
  if (!isMetaPublishingEnabled()) throw new IntegrationError("Publishing to Meta is disabled on this server.");
  const blockers = publishBlockers(input);
  if (blockers.length > 0) throw new IntegrationError(blockers[0]);

  const { campaign } = input;
  const account = campaign.meta_ad_account_id!;
  const created = await metaGraphPost<{ id: string }>(`/${account}/campaigns`, buildCampaignPayload(campaign));

  try {
    const adset = await metaGraphPost<{ id: string }>(`/${account}/adsets`, buildAdSetPayload(campaign, created.id));
    const images = input.creatives.filter((c) => c.media === "image" && c.status === "ready" && c.asset_url);

    const adIds: string[] = [];
    for (const [index, creative] of images.entries()) {
      const adCreative = await metaGraphPost<{ id: string }>(
        `/${account}/adcreatives`,
        buildImageAdCreativePayload(campaign, { id: creative.id, asset_url: creative.asset_url! }, input.productUrl!)
      );
      const ad = await metaGraphPost<{ id: string }>(
        `/${account}/ads`,
        buildAdPayload(campaign.name, adset.id, adCreative.id, index)
      );
      adIds.push(ad.id);
    }

    return { campaignId: created.id, adsetId: adset.id, adIds };
  } catch (error) {
    await metaGraphDelete(`/${created.id}`).catch(() => undefined);
    throw error;
  }
}
