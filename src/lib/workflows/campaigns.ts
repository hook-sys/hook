import { buildAiContext, AiContextError } from "@/lib/ai/context";
import {
  buildCampaignStrategyPrompt,
  validateCampaignStrategy,
  CAMPAIGN_STRATEGY_SCHEMA,
  META_OBJECTIVES,
  type CampaignStrategy,
  type MetaObjective,
} from "@/lib/ai/campaign-strategy";
import { aiErrorMessage, generateAndLog } from "@/lib/ai/generate";
import { getClientMetaAssets } from "@/lib/services/client-meta-assets";
import { getClientById } from "@/lib/services/clients";
import { getCreativesByIds, listCreatives } from "@/lib/services/creatives";
import { getProduct } from "@/lib/services/products";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation/ids";
import type { AdminProfile } from "@/types/admin";
import { HATOG_STAGE_KEYS, type HatogStageKey } from "@/types/ai";
import type { WorkflowResult } from "@/lib/workflows/creatives";

// Server-only campaign-draft workflow shared by the Campaigns UI and the AI agent. Callers
// must have checked the `campaigns` permission. Only INTERNAL drafts are created here —
// publishing to Meta is a separate, super-admin, explicitly confirmed action.

// Meta references always come from the client's own assignment (never from input); the DB
// trigger enforces the same rule.
export async function metaSnapshot(clientId: string) {
  const assets = await getClientMetaAssets(clientId);
  return {
    meta_ad_account_id: assets?.ad_account_id ?? null,
    meta_page_id: assets?.facebook_page_id ?? null,
    meta_instagram_account_id: assets?.instagram_account_id ?? null,
  };
}

export interface CampaignDraftInput {
  mode: "ai" | "blank";
  productId: string;
  hatogStage: string;
  objective: string | null;
  notes: string | null;
  name: string | null;
  creativeIds?: string[];
}

export async function createCampaignDraftCore(
  profile: AdminProfile,
  clientId: string,
  input: CampaignDraftInput
): Promise<WorkflowResult<{ campaignId: string }>> {
  const client = await getClientById(clientId);
  if (!client) return { ok: false, message: "Client not found." };
  if (!isUuid(input.productId)) return { ok: false, message: "Select a product." };
  if (!(HATOG_STAGE_KEYS as readonly string[]).includes(input.hatogStage)) return { ok: false, message: "Select a HATOG stage." };
  if (input.objective && !(META_OBJECTIVES as readonly string[]).includes(input.objective)) return { ok: false, message: "Invalid objective." };
  if (input.notes && input.notes.length > 1000) return { ok: false, message: "Notes are too long." };
  const creativeIds = [...new Set(input.creativeIds ?? [])];
  if (creativeIds.length > 10 || creativeIds.some((id) => !isUuid(id))) return { ok: false, message: "Select up to 10 creatives." };

  const product = await getProduct(client.id, input.productId);
  if (!product) return { ok: false, message: "Product not found for this client." };

  // Only this client's ready creatives can be attached.
  if (creativeIds.length) {
    const creatives = await getCreativesByIds(client.id, creativeIds);
    if (creatives.length !== creativeIds.length || creatives.some((c) => c.status !== "ready")) {
      return { ok: false, message: "Only this client's ready creatives can be attached." };
    }
  }

  const supabase = await createClient();
  const base = {
    client_id: client.id,
    product_id: product.id,
    hatog_stage: input.hatogStage,
    created_by: profile.id,
    ...(await metaSnapshot(client.id)),
  };

  let row: Record<string, unknown>;
  if (input.mode === "blank") {
    const name = input.name?.trim() ?? "";
    if (!name || name.length > 200) return { ok: false, message: "Enter a campaign name." };
    if (!input.objective) return { ok: false, message: "Select an objective." };
    row = { ...base, name, objective: input.objective };
  } else {
    let prompt: { system: string; user: string };
    try {
      const context = await buildAiContext({ clientId: client.id, productId: product.id });
      const creatives = await listCreatives(client.id, { productId: product.id, status: "ready" });
      prompt = buildCampaignStrategyPrompt(context, {
        hatogStage: input.hatogStage as HatogStageKey,
        objectivePreference: (input.objective || null) as MetaObjective | null,
        notes: input.notes || null,
        creatives: creatives.map((c) => ({ type: c.creative_type, media: c.media, concept: c.brief.concept ?? "" })),
      });
    } catch (error) {
      if (error instanceof AiContextError) return { ok: false, message: error.message };
      return { ok: false, message: error instanceof Error ? error.message : "Could not build the request." };
    }

    let strategy: CampaignStrategy;
    try {
      const result = await generateAndLog<CampaignStrategy>({
        clientId: client.id,
        actorId: profile.id,
        productId: product.id,
        generationType: "campaign_strategy",
        ...prompt,
        schema: CAMPAIGN_STRATEGY_SCHEMA,
        maxTokens: 8000,
        validate: (value) => {
          const v = validateCampaignStrategy(value);
          return v.ok ? { ok: true, value: v.strategy } : v;
        },
      });
      strategy = result.data;
    } catch (error) {
      return { ok: false, message: aiErrorMessage(error, "Could not generate the strategy.") };
    }
    row = {
      ...base,
      name: strategy.campaign_name,
      objective: strategy.objective,
      hatog_stage: strategy.funnel_stage,
      strategy,
      daily_budget: strategy.budget_recommendation.daily_budget,
      budget_currency: strategy.budget_recommendation.currency,
    };
  }

  const { data, error } = await supabase.from("campaigns").insert(row).select("id").single();
  if (error || !data) return { ok: false, message: input.mode === "ai" ? "Strategy generated, but saving the draft failed." : "Could not create the campaign draft." };

  if (creativeIds.length) {
    await supabase
      .from("campaign_creatives")
      .insert(creativeIds.map((creative_id, position) => ({ campaign_id: data.id, creative_id, client_id: client.id, position })));
  }
  return { ok: true, value: { campaignId: data.id }, message: "Campaign draft created. It needs human review and approval." };
}
