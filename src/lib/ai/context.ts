import { requireAdmin } from "@/lib/auth/session";
import { getClientAiKnowledge } from "@/lib/services/ai";
import { getClientById } from "@/lib/services/clients";
import { getProduct, listProductAssets } from "@/lib/services/products";
import { createAdminClient } from "@/lib/supabase/admin";
import type { HatogStage, NegativePrompt, NegativePromptCategory } from "@/types/ai";
import type { ProductAssetType } from "@/types/product";

// Structured context for future AI services (Claude strategy/content, Fal.ai media).
// This module only reads data — it never calls an AI provider.

export interface AiContextHatogStage {
  key: string;
  letter: string;
  name: string;
  objective: string | null;
  description: string | null;
  audience: string | null;
  contentDirection: string | null;
  adDirection: string | null;
  aiInstructions: string | null;
  exampleIdeas: string[];
}

export interface AiContext {
  version: 1;
  generatedAt: string;
  client: {
    id: string;
    businessName: string;
    website: string | null;
    facebookPageUrl: string | null;
    status: string;
  };
  knowledge: {
    businessContext: string | null;
    customerProfile: string | null;
    productKnowledge: string | null;
    brandVoice: string | null;
    sellingPoints: string | null;
    objections: string | null;
    competitorNotes: string | null;
    offerRules: string | null;
    additionalInstructions: string | null;
  };
  product: {
    id: string;
    name: string;
    sku: string | null;
    url: string | null;
    category: string | null;
    status: string;
    shortDescription: string | null;
    fullDescription: string | null;
    pricing: { price: number | null; discountPrice: number | null; currency: string };
    features: string[];
    benefits: string[];
    targetCustomer: string | null;
    brand: { name: string | null; colors: string[] };
    cta: string | null;
    notes: string | null;
    assets: { type: ProductAssetType; label: string | null; driveFileId: string | null; url: string | null }[];
  } | null;
  hatog: AiContextHatogStage[];
  negativePrompts: Record<NegativePromptCategory, string[]>;
}

export class AiContextError extends Error {}

// Global, agency-wide configuration (not client data, not secret). Read server-side so
// any authorized caller gets the same framework and rules.
async function loadGlobalAiConfig(): Promise<{ hatog: AiContextHatogStage[]; negativePrompts: AiContext["negativePrompts"] }> {
  const db = createAdminClient();
  const [stages, prompts] = await Promise.all([
    db.from("hatog_stages").select("*").eq("enabled", true).order("position"),
    db.from("negative_prompts").select("prompt, category").eq("enabled", true).order("created_at"),
  ]);
  if (stages.error || prompts.error) throw new AiContextError("Could not load the global AI configuration.");

  const negativePrompts: AiContext["negativePrompts"] = { general: [], image: [], video: [], copy: [] };
  for (const row of prompts.data as Pick<NegativePrompt, "prompt" | "category">[]) {
    negativePrompts[row.category].push(row.prompt);
  }

  return {
    negativePrompts,
    hatog: (stages.data as HatogStage[]).map((s) => ({
      key: s.key,
      letter: s.letter,
      name: s.name,
      objective: s.objective,
      description: s.description,
      audience: s.audience,
      contentDirection: s.content_direction,
      adDirection: s.ad_direction,
      aiInstructions: s.ai_instructions,
      exampleIdeas: s.example_ideas,
    })),
  };
}

// Client-scoped data is read with the caller's session, so RLS enforces client isolation:
// a sub-admin can only build context for clients assigned to them.
export async function buildAiContext({
  clientId,
  productId,
}: {
  clientId: string;
  productId?: string | null;
}): Promise<AiContext> {
  await requireAdmin();

  const client = await getClientById(clientId);
  if (!client) throw new AiContextError("Client not found or not accessible.");

  const [knowledge, product, assets, globals] = await Promise.all([
    getClientAiKnowledge(client.id),
    productId ? getProduct(client.id, productId) : Promise.resolve(null),
    productId ? listProductAssets(client.id, productId) : Promise.resolve([]),
    loadGlobalAiConfig(),
  ]);
  if (productId && !product) throw new AiContextError("Product not found for this client.");

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    client: {
      id: client.id,
      businessName: client.business_name,
      website: client.website,
      facebookPageUrl: client.facebook_page_url,
      status: client.status,
    },
    knowledge: {
      businessContext: knowledge?.business_context ?? null,
      customerProfile: knowledge?.customer_profile ?? null,
      productKnowledge: knowledge?.product_knowledge ?? null,
      brandVoice: knowledge?.brand_voice ?? null,
      sellingPoints: knowledge?.selling_points ?? null,
      objections: knowledge?.objections ?? null,
      competitorNotes: knowledge?.competitor_notes ?? null,
      offerRules: knowledge?.offer_rules ?? null,
      additionalInstructions: knowledge?.additional_instructions ?? null,
    },
    product: product && {
      id: product.id,
      name: product.name,
      sku: product.sku,
      url: product.product_url,
      category: product.category,
      status: product.status,
      shortDescription: product.short_description,
      fullDescription: product.full_description,
      pricing: { price: product.price, discountPrice: product.discount_price, currency: product.currency },
      features: product.features,
      benefits: product.benefits,
      targetCustomer: product.target_customer,
      brand: { name: product.brand_name, colors: product.brand_colors },
      cta: product.cta,
      notes: product.notes,
      assets: assets.map((a) => ({ type: a.asset_type, label: a.label, driveFileId: a.drive_file_id, url: a.url })),
    },
    hatog: globals.hatog,
    negativePrompts: globals.negativePrompts,
  };
}
