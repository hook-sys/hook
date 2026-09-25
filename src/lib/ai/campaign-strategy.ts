import type { AiContext } from "@/lib/ai/context";
import { HATOG_STAGE_KEYS, type HatogStageKey } from "@/types/ai";

// Pure: Claude request + structured-reply validation for Meta campaign strategy.

export const META_OBJECTIVES = [
  "OUTCOME_AWARENESS",
  "OUTCOME_TRAFFIC",
  "OUTCOME_ENGAGEMENT",
  "OUTCOME_LEADS",
  "OUTCOME_SALES",
  "OUTCOME_APP_PROMOTION",
] as const;
export type MetaObjective = (typeof META_OBJECTIVES)[number];

export const META_OBJECTIVE_LABELS: Record<MetaObjective, string> = {
  OUTCOME_AWARENESS: "Awareness",
  OUTCOME_TRAFFIC: "Traffic",
  OUTCOME_ENGAGEMENT: "Engagement",
  OUTCOME_LEADS: "Leads",
  OUTCOME_SALES: "Sales",
  OUTCOME_APP_PROMOTION: "App Promotion",
};

export const META_CTAS = [
  "SHOP_NOW",
  "ORDER_NOW",
  "BUY_NOW",
  "LEARN_MORE",
  "GET_OFFER",
  "SEND_MESSAGE",
  "CONTACT_US",
  "SIGN_UP",
] as const;
export type MetaCta = (typeof META_CTAS)[number];

export interface CampaignStrategy {
  campaign_name: string;
  objective: MetaObjective;
  funnel_stage: HatogStageKey;
  target_audience: {
    countries: string[];
    age_min: number;
    age_max: number;
    genders: "all" | "male" | "female";
    interests: string[];
  };
  audience_description: string;
  ad_angle: string;
  primary_text: string;
  headline: string;
  description: string;
  cta: MetaCta;
  creative_recommendations: string[];
  retargeting_suggestion: string;
  budget_recommendation: { daily_budget: number; currency: string; duration_days: number; rationale: string };
}

export const CAMPAIGN_STRATEGY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "campaign_name",
    "objective",
    "funnel_stage",
    "target_audience",
    "audience_description",
    "ad_angle",
    "primary_text",
    "headline",
    "description",
    "cta",
    "creative_recommendations",
    "retargeting_suggestion",
    "budget_recommendation",
  ],
  properties: {
    campaign_name: { type: "string" },
    objective: { type: "string", enum: [...META_OBJECTIVES] },
    funnel_stage: { type: "string", enum: [...HATOG_STAGE_KEYS] },
    target_audience: {
      type: "object",
      additionalProperties: false,
      required: ["countries", "age_min", "age_max", "genders", "interests"],
      properties: {
        countries: { type: "array", items: { type: "string" }, description: "ISO 3166-1 alpha-2 codes, e.g. BD" },
        age_min: { type: "integer" },
        age_max: { type: "integer" },
        genders: { type: "string", enum: ["all", "male", "female"] },
        interests: { type: "array", items: { type: "string" } },
      },
    },
    audience_description: { type: "string" },
    ad_angle: { type: "string" },
    primary_text: { type: "string" },
    headline: { type: "string" },
    description: { type: "string" },
    cta: { type: "string", enum: [...META_CTAS] },
    creative_recommendations: { type: "array", items: { type: "string" } },
    retargeting_suggestion: { type: "string" },
    budget_recommendation: {
      type: "object",
      additionalProperties: false,
      required: ["daily_budget", "currency", "duration_days", "rationale"],
      properties: {
        daily_budget: { type: "number" },
        currency: { type: "string" },
        duration_days: { type: "integer" },
        rationale: { type: "string" },
      },
    },
  },
} as const;

type Result = { ok: true; strategy: CampaignStrategy } | { ok: false; error: string };

function str(v: unknown, field: string, max: number): string | { error: string } {
  if (typeof v !== "string" || !v.trim()) return { error: `Strategy field "${field}" is missing.` };
  if (v.length > max) return { error: `Strategy field "${field}" is too long.` };
  return v.trim();
}

function strList(v: unknown, field: string, maxItems: number, maxLen: number): string[] | { error: string } {
  if (!Array.isArray(v) || v.length > maxItems || v.some((s) => typeof s !== "string" || !s.trim() || s.length > maxLen)) {
    return { error: `Strategy field "${field}" is invalid.` };
  }
  return v.map((s: string) => s.trim());
}

export function validateCampaignStrategy(value: unknown): Result {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "Strategy is not an object." };
  const v = value as Record<string, unknown>;

  const fields = {
    campaign_name: str(v.campaign_name, "campaign_name", 200),
    audience_description: str(v.audience_description, "audience_description", 2000),
    ad_angle: str(v.ad_angle, "ad_angle", 1000),
    primary_text: str(v.primary_text, "primary_text", 2000),
    headline: str(v.headline, "headline", 255),
    description: str(v.description, "description", 255),
    retargeting_suggestion: str(v.retargeting_suggestion, "retargeting_suggestion", 1500),
  };
  for (const f of Object.values(fields)) if (typeof f !== "string") return { ok: false, error: f.error };

  if (!(META_OBJECTIVES as readonly unknown[]).includes(v.objective)) return { ok: false, error: "Invalid objective." };
  if (!(HATOG_STAGE_KEYS as readonly unknown[]).includes(v.funnel_stage)) return { ok: false, error: "Invalid funnel stage." };
  if (!(META_CTAS as readonly unknown[]).includes(v.cta)) return { ok: false, error: "Invalid CTA." };

  const recs = strList(v.creative_recommendations, "creative_recommendations", 10, 500);
  if (!Array.isArray(recs)) return { ok: false, error: recs.error };

  const ta = v.target_audience as Record<string, unknown> | undefined;
  if (!ta || typeof ta !== "object") return { ok: false, error: "Target audience is missing." };
  const countries = strList(ta.countries, "countries", 25, 2);
  if (!Array.isArray(countries) || countries.length === 0 || countries.some((c) => !/^[A-Z]{2}$/.test(c))) {
    return { ok: false, error: "Target countries must be ISO country codes." };
  }
  const interests = strList(ta.interests, "interests", 25, 100);
  if (!Array.isArray(interests)) return { ok: false, error: interests.error };
  const ageMin = ta.age_min;
  const ageMax = ta.age_max;
  if (
    !Number.isInteger(ageMin) ||
    !Number.isInteger(ageMax) ||
    (ageMin as number) < 18 ||
    (ageMax as number) > 65 ||
    (ageMin as number) > (ageMax as number)
  ) {
    return { ok: false, error: "Target ages must be 18-65 with min ≤ max." };
  }
  if (!["all", "male", "female"].includes(ta.genders as string)) return { ok: false, error: "Invalid genders." };

  const b = v.budget_recommendation as Record<string, unknown> | undefined;
  if (
    !b ||
    typeof b.daily_budget !== "number" ||
    !(b.daily_budget > 0 && b.daily_budget <= 10_000_000) ||
    typeof b.currency !== "string" ||
    !/^[A-Z]{3}$/.test(b.currency) ||
    !Number.isInteger(b.duration_days) ||
    (b.duration_days as number) < 1 ||
    (b.duration_days as number) > 365
  ) {
    return { ok: false, error: "Budget recommendation is invalid." };
  }
  const rationale = str(b.rationale, "budget rationale", 1500);
  if (typeof rationale !== "string") return { ok: false, error: rationale.error };

  return {
    ok: true,
    strategy: {
      campaign_name: fields.campaign_name as string,
      objective: v.objective as MetaObjective,
      funnel_stage: v.funnel_stage as HatogStageKey,
      target_audience: {
        countries,
        age_min: ageMin as number,
        age_max: ageMax as number,
        genders: ta.genders as "all" | "male" | "female",
        interests,
      },
      audience_description: fields.audience_description as string,
      ad_angle: fields.ad_angle as string,
      primary_text: fields.primary_text as string,
      headline: fields.headline as string,
      description: fields.description as string,
      cta: v.cta as MetaCta,
      creative_recommendations: recs,
      retargeting_suggestion: fields.retargeting_suggestion as string,
      budget_recommendation: {
        daily_budget: Math.round((b.daily_budget as number) * 100) / 100,
        currency: b.currency as string,
        duration_days: b.duration_days as number,
        rationale,
      },
    },
  };
}

export interface CampaignStrategyRequest {
  hatogStage: HatogStageKey;
  objectivePreference: MetaObjective | null;
  notes: string | null;
  creatives: { type: string; media: string; concept: string }[];
}

const SYSTEM_PROMPT = `You are Hook Marketing's senior Meta ads strategist for Bangladesh e-commerce brands, using the HOOK/HATOG framework (Hook, Feature, Trust, Offer, Gift).

Produce one Meta (Facebook/Instagram) campaign strategy.

Rules:
- Use only facts present in the provided data. Never invent features, prices, discounts, reviews, or claims; never promise guaranteed results.
- Follow every negative rule and the client's offer rules.
- Align the objective, audience, and copy with the requested HATOG funnel stage.
- Target audience fields must be usable in Meta targeting: ISO country codes, ages 18-65.
- Ad copy (primary text, headline, description) should fit the brand voice; Bangla, English, or a natural mix is fine. Keep headline and description short.
- Budget recommendation must be realistic for a Bangladesh e-commerce test campaign, in BDT unless the data says otherwise, with a short rationale.`;

export function buildCampaignStrategyPrompt(context: AiContext, request: CampaignStrategyRequest): { system: string; user: string } {
  if (!context.product) throw new Error("A product is required for a campaign strategy.");
  const stage = context.hatog.find((s) => s.key === request.hatogStage);
  if (!stage) throw new Error(`HATOG stage "${request.hatogStage}" is not enabled.`);
  const p = context.product;
  const k = context.knowledge;
  const cut = (s: string | null, n: number) => (s ? (s.length > n ? `${s.slice(0, n)}…` : s) : undefined);

  const payload = {
    request: {
      funnel_stage: request.hatogStage,
      objective_preference: request.objectivePreference ?? "choose the best fit",
      notes: cut(request.notes, 1000),
    },
    hatog_stage: {
      name: stage.name,
      objective: stage.objective,
      audience: cut(stage.audience, 1000),
      ad_direction: cut(stage.adDirection, 1500),
      ai_instructions: cut(stage.aiInstructions, 1500),
    },
    client: { business_name: context.client.businessName, website: context.client.website ?? undefined },
    client_knowledge: {
      customer_profile: cut(k.customerProfile, 1500),
      brand_voice: cut(k.brandVoice, 1000),
      selling_points: cut(k.sellingPoints, 1500),
      objections: cut(k.objections, 1000),
      competitor_notes: cut(k.competitorNotes, 1000),
      offer_rules: cut(k.offerRules, 1000),
    },
    product: {
      name: p.name,
      category: p.category ?? undefined,
      short_description: cut(p.shortDescription, 500),
      price: p.pricing.price ?? undefined,
      discount_price: p.pricing.discountPrice ?? undefined,
      currency: p.pricing.currency,
      features: p.features.slice(0, 15),
      benefits: p.benefits.slice(0, 15),
      target_customer: cut(p.targetCustomer, 1000),
      url: p.url ?? undefined,
      cta: p.cta ?? undefined,
    },
    available_creatives: request.creatives.slice(0, 10),
    negative_rules: [...context.negativePrompts.general, ...context.negativePrompts.copy],
  };

  return { system: SYSTEM_PROMPT, user: `Create the campaign strategy. Data:\n${JSON.stringify(payload, null, 2)}` };
}
