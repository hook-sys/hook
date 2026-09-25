import test from "node:test";
import assert from "node:assert/strict";
import { publishCampaignToMeta } from "@/lib/integrations/meta-ads";
import { log } from "@/lib/integrations/meta";

const input = {
  campaign: {
    name: "Wallet", objective: "OUTCOME_TRAFFIC", status: "approved", daily_budget: 500,
    meta_ad_account_id: "act_123", meta_page_id: "456", meta_instagram_account_id: null, meta_campaign_id: null,
    strategy: { primary_text: "p", headline: "h", cta: "SHOP_NOW", target_audience: { countries: ["BD"], age_min: 18, age_max: 40, genders: "all", interests: [] } },
  },
  productUrl: "https://demo.example/w",
  creatives: [
    { id: "aaaaaaaa-1", media: "image", status: "ready", asset_url: "https://fal.media/1.jpg" },
    { id: "bbbbbbbb-2", media: "image", status: "ready", asset_url: "https://fal.media/2.jpg" },
  ],
  metaConnected: true,
  publishingEnabled: true,
};

test("flag off → nothing sent to Meta", async () => {
  globalThis.__metaFlag = false;
  log.length = 0;
  await assert.rejects(() => publishCampaignToMeta(input), /disabled/);
  assert.equal(log.length, 0);
});

test("blockers re-checked server-side → nothing sent", async () => {
  globalThis.__metaFlag = true;
  log.length = 0;
  await assert.rejects(() => publishCampaignToMeta({ ...input, campaign: { ...input.campaign, status: "draft" } }), /approved/);
  assert.equal(log.length, 0);
});

test("creates campaign → adset → creative/ad per image, all PAUSED", async () => {
  globalThis.__metaFlag = true;
  globalThis.__metaFailOn = null;
  log.length = 0;
  const ids = await publishCampaignToMeta(input);
  assert.deepEqual(log.map(([m, p]) => `${m} ${p}`), [
    "POST /act_123/campaigns",
    "POST /act_123/adsets",
    "POST /act_123/adcreatives",
    "POST /act_123/ads",
    "POST /act_123/adcreatives",
    "POST /act_123/ads",
  ]);
  for (const [, path, params] of log) if (!path.endsWith("adcreatives")) assert.equal(params.status, "PAUSED");
  assert.equal(ids.adIds.length, 2);
});

test("failure after campaign creation deletes the campaign", async () => {
  globalThis.__metaFlag = true;
  globalThis.__metaFailOn = "/adsets";
  log.length = 0;
  await assert.rejects(() => publishCampaignToMeta(input), /graph failure/);
  assert.equal(log.at(-1)[0], "DELETE");
  assert.equal(log.at(-1)[1], `/${log[0][0] === "POST" ? "campaigns-1" : ""}`);
});
