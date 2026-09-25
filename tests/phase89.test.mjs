import test from "node:test";
import assert from "node:assert/strict";
import { buildCreativeBriefPrompt, validateCreativeBrief, CREATIVE_BRIEF_SCHEMA } from "@/lib/ai/creative-brief";
import { buildCampaignStrategyPrompt, validateCampaignStrategy, CAMPAIGN_STRATEGY_SCHEMA } from "@/lib/ai/campaign-strategy";
import { planFalJob, checkFalCapabilities, extractFalOutput, falModelFor, falBillingUnits } from "@/lib/creative/fal-models";
import { canTransitionCreative, canTransitionCampaign } from "@/lib/creative/status";
import {
  publishBlockers,
  buildCampaignPayload,
  buildAdSetPayload,
  buildImageAdCreativePayload,
  buildAdPayload,
  toMinorUnits,
} from "@/lib/meta/ads-payloads";

const context = {
  version: 1,
  generatedAt: "2026-09-24T00:00:00Z",
  client: { id: "c1", businessName: "Demo Co", website: "https://demo.example", facebookPageUrl: null, status: "active" },
  knowledge: {
    businessContext: "Handmade leather goods.",
    customerProfile: "Urban professionals 25-40.",
    productKnowledge: null,
    brandVoice: "Warm, confident.",
    sellingPoints: "Genuine leather.",
    objections: "Price.",
    competitorNotes: "SECRET-COMPETITOR-NOTE",
    offerRules: "No more than 20% off.",
    additionalInstructions: null,
  },
  product: {
    id: "p1",
    name: "Classic Wallet",
    sku: "W-1",
    url: "https://demo.example/wallet",
    category: "Wallets",
    status: "active",
    shortDescription: "Slim bifold wallet.",
    fullDescription: "x".repeat(5000),
    pricing: { price: 1500, discountPrice: 1200, currency: "BDT" },
    features: ["6 card slots"],
    benefits: ["Fits front pocket"],
    targetCustomer: "Office workers",
    brand: { name: "Demo", colors: ["#000000"] },
    cta: "Order now",
    notes: "INTERNAL-NOTE",
    assets: [],
  },
  hatog: [
    { key: "hook", letter: "H", name: "Hook", objective: "Stop the scroll", description: null, audience: "Cold", contentDirection: "Bold", adDirection: null, aiInstructions: null, exampleIdeas: ["a"] },
    { key: "offer", letter: "O", name: "Offer", objective: "Convert", description: null, audience: "Warm", contentDirection: null, adDirection: null, aiInstructions: null, exampleIdeas: [] },
  ],
  negativePrompts: { general: ["no fake claims"], image: ["no watermark"], video: ["no flicker"], copy: ["no guarantees"] },
};

const briefReq = { media: "video", creativeType: "problem_solution", hatogStage: "hook", format: "9:16", durationSeconds: 10, hasReferenceImage: true };

test("creative brief prompt: context → Claude request", () => {
  const { system, user } = buildCreativeBriefPrompt(context, briefReq);
  assert.match(system, /Never invent features/);
  const payload = JSON.parse(user.slice(user.indexOf("{")));
  assert.equal(payload.task.media, "video");
  assert.equal(payload.task.creative_type, "Problem → Solution");
  assert.equal(payload.task.duration_seconds, 10);
  assert.equal(payload.hatog_stage.name, "Hook");
  assert.deepEqual(Object.keys(payload.negative_rules).sort(), ["copy", "general", "video"]); // not image rules
  assert.equal(payload.product.name, "Classic Wallet");
  assert.ok(payload.product.full_description.length <= 2001);
  assert.ok(!user.includes("INTERNAL-NOTE"), "internal product notes are not sent");
  assert.ok(!user.includes("Convert"), "only the selected HATOG stage is sent");
  assert.ok(!user.includes("SECRET-COMPETITOR-NOTE"), "brief omits competitor notes");
});

test("creative brief prompt: rejects disabled stage / missing product", () => {
  assert.throws(() => buildCreativeBriefPrompt(context, { ...briefReq, hatogStage: "trust" }), /not enabled/);
  assert.throws(() => buildCreativeBriefPrompt({ ...context, product: null }, briefReq), /product is required/);
});

const goodBrief = {
  concept: "c", hook: "h", scene_plan: [{ order: 1, duration_seconds: 5, description: "d" }, { order: 2, duration_seconds: 5, description: "e" }],
  visual_direction: "v", product_presentation: "p", text_overlay: "t", cta: "Order", generation_prompt: " prompt ", negative_prompt: "blurry",
};

test("creative brief validation", () => {
  const ok = validateCreativeBrief(goodBrief, { media: "video" });
  assert.equal(ok.ok, true);
  assert.equal(ok.brief.generation_prompt, "prompt");
  assert.equal(validateCreativeBrief(goodBrief, { media: "image" }).ok, false, "images allow one scene");
  assert.equal(validateCreativeBrief({ ...goodBrief, hook: "" }, { media: "video" }).ok, false);
  assert.equal(validateCreativeBrief({ ...goodBrief, generation_prompt: "x".repeat(2501) }, { media: "video" }).ok, false);
  assert.equal(validateCreativeBrief({ ...goodBrief, scene_plan: [{ order: 1, duration_seconds: -1, description: "d" }] }, { media: "video" }).ok, false);
  assert.equal(validateCreativeBrief("nope", { media: "video" }).ok, false);
  assert.equal(CREATIVE_BRIEF_SCHEMA.additionalProperties, false);
});

test("Fal request validation and model selection", () => {
  assert.equal(falModelFor("video", true).mode, "image-to-video");
  assert.equal(falModelFor("video", false).mode, "text-to-video");
  assert.equal(falModelFor("image", true).mode, "image-to-image");
  assert.match(checkFalCapabilities("video", "9:16", 15, true), /supports 5 or 10/);
  assert.match(checkFalCapabilities("video", "9:16", 30, false), /supports 5 or 10/);
  assert.equal(checkFalCapabilities("video", "1:1", 10, false), null);
  assert.match(checkFalCapabilities("image", "1:1", 5, false), /duration/);

  const i2v = planFalJob({ media: "video", format: "9:16", durationSeconds: 10, prompt: " go ", negativePrompt: "blur", referenceImageUrl: "https://x.example/a.jpg" });
  assert.equal(i2v.ok, true);
  assert.equal(i2v.modelId, "fal-ai/kling-video/v2.5-turbo/pro/image-to-video");
  assert.deepEqual(i2v.input, { prompt: "go", image_url: "https://x.example/a.jpg", duration: "10", negative_prompt: "blur" });

  const t2i = planFalJob({ media: "image", format: "9:16", durationSeconds: null, prompt: "p", negativePrompt: "n", referenceImageUrl: null });
  assert.equal(t2i.input.image_size, "portrait_16_9");
  assert.equal("negative_prompt" in t2i.input, false, "flux dev has no negative prompt");

  assert.equal(planFalJob({ media: "image", format: "1:1", durationSeconds: null, prompt: "p", negativePrompt: null, referenceImageUrl: "http://insecure" }).ok, false);
  assert.equal(planFalJob({ media: "image", format: "1:1", durationSeconds: null, prompt: "  ", negativePrompt: null, referenceImageUrl: null }).ok, false);
  assert.equal(planFalJob({ media: "video", format: "1:1", durationSeconds: 5, prompt: "x".repeat(2501), negativePrompt: null, referenceImageUrl: null }).ok, false);

  assert.deepEqual(extractFalOutput("fal-ai/flux/dev", { images: [{ url: "https://fal.media/a.jpg" }] }), { assetUrl: "https://fal.media/a.jpg", thumbnailUrl: "https://fal.media/a.jpg" });
  assert.equal(extractFalOutput("fal-ai/flux/dev", { images: [{ url: "javascript:alert(1)" }] }), null);
  assert.equal(extractFalOutput("fal-ai/kling-video/v2.5-turbo/pro/text-to-video", { video: { url: "https://fal.media/v.mp4" } }).assetUrl, "https://fal.media/v.mp4");
  assert.equal(extractFalOutput("unknown/model", {}), null);
  assert.equal(falBillingUnits("seconds", 10), 10);
  assert.equal(falBillingUnits("images", null), 1);
});

const goodStrategy = {
  campaign_name: "Wallet Hook", objective: "OUTCOME_TRAFFIC", funnel_stage: "hook",
  target_audience: { countries: ["BD"], age_min: 22, age_max: 40, genders: "all", interests: ["Fashion"] },
  audience_description: "a", ad_angle: "b", primary_text: "c", headline: "d", description: "e", cta: "SHOP_NOW",
  creative_recommendations: ["r"], retargeting_suggestion: "s",
  budget_recommendation: { daily_budget: 500.456, currency: "BDT", duration_days: 7, rationale: "test" },
};

test("campaign strategy prompt + validation", () => {
  const { user } = buildCampaignStrategyPrompt(context, { hatogStage: "offer", objectivePreference: null, notes: "n", creatives: [] });
  assert.match(user, /"funnel_stage": "offer"/);
  assert.ok(!user.includes("INTERNAL-NOTE"));
  const ok = validateCampaignStrategy(goodStrategy);
  assert.equal(ok.ok, true);
  assert.equal(ok.strategy.budget_recommendation.daily_budget, 500.46);
  assert.equal(validateCampaignStrategy({ ...goodStrategy, objective: "BOGUS" }).ok, false);
  assert.equal(validateCampaignStrategy({ ...goodStrategy, target_audience: { ...goodStrategy.target_audience, countries: ["Bangladesh"] } }).ok, false);
  assert.equal(validateCampaignStrategy({ ...goodStrategy, target_audience: { ...goodStrategy.target_audience, age_min: 13 } }).ok, false);
  assert.equal(validateCampaignStrategy({ ...goodStrategy, budget_recommendation: { ...goodStrategy.budget_recommendation, daily_budget: -1 } }).ok, false);
  assert.equal(CAMPAIGN_STRATEGY_SCHEMA.additionalProperties, false);
});

test("status transitions mirror DB rules", () => {
  assert.ok(canTransitionCreative("generating", "ready"));
  assert.ok(!canTransitionCreative("ready", "generating"));
  assert.ok(!canTransitionCreative("archived", "ready"));
  assert.ok(canTransitionCampaign("draft", "ready_for_review", "sub_admin"));
  assert.ok(!canTransitionCampaign("ready_for_review", "approved", "sub_admin"));
  assert.ok(canTransitionCampaign("ready_for_review", "approved", "admin"));
  assert.ok(!canTransitionCampaign("approved", "published", "admin"), "published only via Meta publisher");
  assert.ok(!canTransitionCampaign("draft", "approved", "admin"));
});

const campaign = {
  name: "Wallet", objective: "OUTCOME_TRAFFIC", status: "approved", daily_budget: 500,
  meta_ad_account_id: "act_123", meta_page_id: "456", meta_instagram_account_id: "789", meta_campaign_id: null,
  strategy: goodStrategy,
};
const readyImage = { id: "11111111-aaaa", media: "image", status: "ready", asset_url: "https://fal.media/a.jpg" };

test("publish blockers + PAUSED payloads", () => {
  const input = { campaign, productUrl: "https://demo.example/wallet", creatives: [readyImage], metaConnected: true, publishingEnabled: true };
  assert.deepEqual(publishBlockers(input), []);
  assert.ok(publishBlockers({ ...input, publishingEnabled: false }).some((b) => /META_PUBLISHING_ENABLED/.test(b)));
  assert.ok(publishBlockers({ ...input, metaConnected: false }).includes("Connect Meta."));
  assert.ok(publishBlockers({ ...input, campaign: { ...campaign, status: "draft" } }).some((b) => /approved/.test(b)));
  assert.ok(publishBlockers({ ...input, campaign: { ...campaign, meta_ad_account_id: null } }).some((b) => /Assign Meta assets first/.test(b)));
  assert.ok(publishBlockers({ ...input, campaign: { ...campaign, meta_campaign_id: "1" } }).some((b) => /already/.test(b)));
  assert.ok(publishBlockers({ ...input, campaign: { ...campaign, objective: "OUTCOME_SALES" } }).some((b) => /objective/.test(b)));
  assert.ok(publishBlockers({ ...input, creatives: [] }).some((b) => /ready image/.test(b)));
  assert.ok(publishBlockers({ ...input, creatives: [readyImage, { ...readyImage, id: "v", media: "video" }] }).some((b) => /Video/.test(b)));
  assert.ok(publishBlockers({ ...input, productUrl: null }).some((b) => /Product URL/.test(b)));

  assert.equal(buildCampaignPayload(campaign).status, "PAUSED");
  const adset = buildAdSetPayload(campaign, "c1");
  assert.equal(adset.status, "PAUSED");
  assert.equal(adset.daily_budget, 50000);
  assert.equal(adset.optimization_goal, "LINK_CLICKS");
  assert.deepEqual(adset.targeting.geo_locations.countries, ["BD"]);
  assert.equal("genders" in adset.targeting, false);
  const creative = buildImageAdCreativePayload(campaign, readyImage, "https://demo.example/wallet");
  assert.equal(creative.object_story_spec.page_id, "456");
  assert.equal(creative.object_story_spec.instagram_user_id, "789");
  assert.equal(creative.object_story_spec.link_data.call_to_action.type, "SHOP_NOW");
  assert.equal(buildAdPayload("Wallet", "as1", "cr1", 0).status, "PAUSED");
  assert.equal(toMinorUnits(12.345), 1235);
});
