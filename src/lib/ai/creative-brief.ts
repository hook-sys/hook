import type { AiContext } from "@/lib/ai/context";
import { CREATIVE_TYPE_LABELS, type CreativeFormat, type CreativeMedia, type CreativeType } from "@/lib/creative/options";
import type { HatogStageKey } from "@/types/ai";

// Pure: builds the Claude request for a creative brief and validates the structured reply.
// No network, no secrets — unit-testable.

export interface CreativeBriefRequest {
  media: CreativeMedia;
  creativeType: CreativeType;
  hatogStage: HatogStageKey;
  format: CreativeFormat;
  durationSeconds: number | null;
  hasReferenceImage: boolean;
}

export interface CreativeScene {
  order: number;
  duration_seconds: number;
  description: string;
}

export interface CreativeBrief {
  concept: string;
  hook: string;
  scene_plan: CreativeScene[];
  visual_direction: string;
  product_presentation: string;
  text_overlay: string;
  cta: string;
  generation_prompt: string;
  negative_prompt: string;
}

const TEXT_FIELDS = [
  "concept",
  "hook",
  "visual_direction",
  "product_presentation",
  "text_overlay",
  "cta",
  "generation_prompt",
  "negative_prompt",
] as const;

// JSON Schema for Claude structured outputs (output_config.format).
export const CREATIVE_BRIEF_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [...TEXT_FIELDS, "scene_plan"],
  properties: {
    concept: { type: "string", description: "One-sentence creative concept." },
    hook: { type: "string", description: "Opening hook (first 1-3 seconds / first glance)." },
    scene_plan: {
      type: "array",
      description: "Ordered scenes. Images: exactly one scene with duration_seconds 0.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["order", "duration_seconds", "description"],
        properties: {
          order: { type: "integer" },
          duration_seconds: { type: "number" },
          description: { type: "string" },
        },
      },
    },
    visual_direction: { type: "string", description: "Lighting, setting, camera, color palette." },
    product_presentation: { type: "string", description: "How the real product is shown, faithfully." },
    text_overlay: { type: "string", description: "Suggested on-screen text (may be Bangla/English)." },
    cta: { type: "string", description: "Call to action." },
    generation_prompt: { type: "string", description: "English prompt for the image/video model." },
    negative_prompt: { type: "string", description: "Comma-separated things the model must avoid." },
  },
} as const;

const LIMITS: Record<(typeof TEXT_FIELDS)[number], number> = {
  concept: 1000,
  hook: 500,
  visual_direction: 2000,
  product_presentation: 2000,
  text_overlay: 500,
  cta: 200,
  generation_prompt: 2500,
  negative_prompt: 1000,
};

export type BriefValidation = { ok: true; brief: CreativeBrief } | { ok: false; error: string };

export function validateCreativeBrief(value: unknown, request: Pick<CreativeBriefRequest, "media">): BriefValidation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "Brief is not an object." };
  const v = value as Record<string, unknown>;

  for (const field of TEXT_FIELDS) {
    const s = v[field];
    if (typeof s !== "string" || !s.trim()) return { ok: false, error: `Brief field "${field}" is missing.` };
    if (s.length > LIMITS[field]) return { ok: false, error: `Brief field "${field}" is too long.` };
  }

  const scenes = v.scene_plan;
  const maxScenes = request.media === "image" ? 1 : 8;
  if (!Array.isArray(scenes) || scenes.length === 0 || scenes.length > maxScenes) {
    return { ok: false, error: `Brief must contain 1-${maxScenes} scene(s).` };
  }
  for (const scene of scenes) {
    const s = scene as Record<string, unknown>;
    if (
      !s ||
      typeof s.order !== "number" ||
      typeof s.duration_seconds !== "number" ||
      s.duration_seconds < 0 ||
      typeof s.description !== "string" ||
      !s.description.trim() ||
      s.description.length > 1000
    ) {
      return { ok: false, error: "Brief contains an invalid scene." };
    }
  }

  return {
    ok: true,
    brief: {
      concept: v.concept as string,
      hook: v.hook as string,
      scene_plan: (scenes as CreativeScene[]).map((s) => ({
        order: s.order,
        duration_seconds: s.duration_seconds,
        description: s.description,
      })),
      visual_direction: v.visual_direction as string,
      product_presentation: v.product_presentation as string,
      text_overlay: v.text_overlay as string,
      cta: v.cta as string,
      generation_prompt: (v.generation_prompt as string).trim(),
      negative_prompt: (v.negative_prompt as string).trim(),
    },
  };
}

function clip(value: string | null | undefined, max: number): string | undefined {
  if (!value) return undefined;
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0))
  ) as Partial<T>;
}

const SYSTEM_PROMPT = `You are the senior creative strategist at Hook Marketing, an agency building profitable e-commerce brands in Bangladesh with the HOOK/HATOG framework (Hook, Feature, Trust, Offer, Gift).

Write one production-ready creative brief for a product marketing creative.

Rules:
- Use only facts present in the provided product and client data. Never invent features, specifications, prices, discounts, reviews, certifications, or claims.
- Never promise guaranteed results.
- The product must be shown faithfully: correct shape, proportions, colors, and branding. Do not add elements the product does not have.
- Follow every negative rule provided. Put visual things to avoid into negative_prompt.
- Serve the given HATOG stage objective and audience.
- Match Bangladesh buyer psychology and the brand voice. Text overlays and CTA may use Bangla, English, or a natural mix, following the brand voice.
- generation_prompt is sent directly to an image/video generation model: write it in English, concrete and visual (subject, setting, lighting, camera, composition, motion for video), and respect the requested aspect ratio and duration. Do not put on-screen text in generation_prompt.
- If a reference product image is provided to the model, describe how to present that exact product rather than redesigning it.`;

// Builds only the context this request needs: the chosen HATOG stage, the relevant negative
// rule groups, and trimmed client/product fields — keeping the prompt small.
export function buildCreativeBriefPrompt(context: AiContext, request: CreativeBriefRequest): { system: string; user: string } {
  if (!context.product) throw new Error("A product is required for a creative brief.");
  const stage = context.hatog.find((s) => s.key === request.hatogStage);
  if (!stage) throw new Error(`HATOG stage "${request.hatogStage}" is not enabled.`);

  const product = context.product;
  const payload = {
    task: compact({
      media: request.media,
      creative_type: CREATIVE_TYPE_LABELS[request.creativeType],
      aspect_ratio: request.format,
      duration_seconds: request.durationSeconds ?? undefined,
      reference_product_image: request.hasReferenceImage
        ? "A real photo of this product is supplied to the generation model."
        : "No reference image; describe the product precisely from the data below.",
    }),
    hatog_stage: compact({
      letter: stage.letter,
      name: stage.name,
      objective: stage.objective,
      description: clip(stage.description, 1500),
      audience: clip(stage.audience, 1000),
      content_direction: clip(stage.contentDirection, 1500),
      ad_direction: clip(stage.adDirection, 1500),
      ai_instructions: clip(stage.aiInstructions, 2000),
      example_ideas: stage.exampleIdeas.slice(0, 10),
    }),
    client: compact({ business_name: context.client.businessName }),
    client_knowledge: compact({
      business_context: clip(context.knowledge.businessContext, 1500),
      customer_profile: clip(context.knowledge.customerProfile, 1500),
      brand_voice: clip(context.knowledge.brandVoice, 1000),
      selling_points: clip(context.knowledge.sellingPoints, 1500),
      objections: clip(context.knowledge.objections, 1000),
      offer_rules: clip(context.knowledge.offerRules, 1000),
      additional_instructions: clip(context.knowledge.additionalInstructions, 1000),
    }),
    product: compact({
      name: product.name,
      category: product.category,
      short_description: clip(product.shortDescription, 500),
      full_description: clip(product.fullDescription, 2000),
      price: product.pricing.price,
      discount_price: product.pricing.discountPrice,
      currency: product.pricing.currency,
      features: product.features.slice(0, 15),
      benefits: product.benefits.slice(0, 15),
      target_customer: clip(product.targetCustomer, 1000),
      brand_name: product.brand.name,
      brand_colors: product.brand.colors,
      cta: product.cta,
    }),
    negative_rules: compact({
      general: context.negativePrompts.general,
      [request.media]: context.negativePrompts[request.media],
      copy: context.negativePrompts.copy,
    }),
  };

  return {
    system: SYSTEM_PROMPT,
    user: `Create the creative brief for this request. Data:\n${JSON.stringify(payload, null, 2)}`,
  };
}
