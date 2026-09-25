import type { AiContext } from "@/lib/ai/context";
import { HATOG_STAGE_KEYS, type HatogStageKey } from "@/types/ai";

// Pure: Claude request + validation for the AI content calendar. One structured request
// plans the whole calendar; one smaller request regenerates a single item.

export const CONTENT_TYPES = [
  "product_post",
  "product_image_ad",
  "product_video",
  "educational",
  "problem_solution",
  "trust_social_proof",
  "offer",
  "retargeting",
  "engagement",
  "seasonal_promotional",
] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  product_post: "Product Post",
  product_image_ad: "Product Image Ad",
  product_video: "Product Video",
  educational: "Educational",
  problem_solution: "Problem/Solution",
  trust_social_proof: "Trust/Social Proof",
  offer: "Offer",
  retargeting: "Retargeting",
  engagement: "Engagement",
  seasonal_promotional: "Seasonal/Promotional",
};

export const CONTENT_PLATFORMS = ["facebook", "instagram"] as const;
export type ContentPlatform = (typeof CONTENT_PLATFORMS)[number];
export const PLATFORM_LABELS: Record<ContentPlatform, string> = { facebook: "Facebook", instagram: "Instagram" };

export const CONTENT_FORMATS = ["single_image", "carousel", "video", "reel", "story"] as const;
export type ContentFormat = (typeof CONTENT_FORMATS)[number];
export const CONTENT_FORMAT_LABELS: Record<ContentFormat, string> = {
  single_image: "Single Image",
  carousel: "Carousel",
  video: "Video",
  reel: "Reel",
  story: "Story",
};
export const VIDEO_CONTENT_FORMATS: readonly ContentFormat[] = ["video", "reel"];

export const CONTENT_ASPECT_RATIOS = ["9:16", "1:1", "16:9", "4:5"] as const;
export type ContentAspectRatio = (typeof CONTENT_ASPECT_RATIOS)[number];

export const CONTENT_ITEM_STATUSES = ["draft", "approved", "scheduled", "published", "failed", "archived"] as const;
export type ContentItemStatus = (typeof CONTENT_ITEM_STATUSES)[number];
export const CONTENT_ITEM_STATUS_LABELS: Record<ContentItemStatus, string> = {
  draft: "Draft",
  approved: "Approved",
  scheduled: "Scheduled",
  published: "Published",
  failed: "Failed",
  archived: "Archived",
};

// Mirrors the DB trigger in 0008. Scheduling and published/failed are super-admin only.
const ITEM_TRANSITIONS: Record<ContentItemStatus, readonly ContentItemStatus[]> = {
  draft: ["approved", "archived"],
  approved: ["draft", "scheduled", "archived"],
  scheduled: ["approved", "published", "failed", "archived"],
  failed: ["scheduled", "archived"],
  published: ["archived"],
  archived: ["draft"],
};
const SUB_ADMIN_STATUSES: readonly ContentItemStatus[] = ["draft", "approved", "archived"];

export function canTransitionContentItem(
  from: ContentItemStatus,
  to: ContentItemStatus,
  role: "admin" | "sub_admin"
): boolean {
  if (!ITEM_TRANSITIONS[from].includes(to)) return false;
  return role === "admin" || (SUB_ADMIN_STATUSES.includes(from) && SUB_ADMIN_STATUSES.includes(to));
}

export interface CalendarProduct {
  id: string;
  name: string;
  category: string | null;
  shortDescription: string | null;
  price: number | null;
  discountPrice: number | null;
  currency: string;
  features: string[];
  benefits: string[];
  targetCustomer: string | null;
  cta: string | null;
}

export interface CalendarRequest {
  startDate: string; // YYYY-MM-DD
  days: number;
  platforms: ContentPlatform[];
  focusNotes: string | null;
  products: CalendarProduct[];
  campaigns: { name: string; objective: string; hatogStage: string | null; status: string }[];
}

export interface GeneratedItem {
  day: number;
  content_type: ContentType;
  platform: ContentPlatform;
  product_ref: string; // "P1".."Pn" or "none"
  hatog_stage: HatogStageKey;
  hook: string;
  concept: string;
  caption: string;
  cta: string;
  creative_direction: string;
  suggested_format: ContentFormat;
  aspect_ratio: ContentAspectRatio;
  duration_seconds: number; // 0 unless video/reel
  notes: string;
}

// Validated, ready-to-store item (product_ref resolved to a real product ID).
export interface CalendarItemDraft {
  scheduled_date: string;
  product_id: string | null;
  content_type: ContentType;
  platform: ContentPlatform;
  hatog_stage: HatogStageKey;
  hook: string;
  concept: string;
  caption: string;
  cta: string;
  creative_direction: string;
  suggested_format: ContentFormat;
  aspect_ratio: ContentAspectRatio;
  duration_seconds: number | null;
  notes: string | null;
}

export const productRef = (index: number) => `P${index + 1}`;

function itemSchema(productRefs: string[], platforms: readonly string[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "day",
      "content_type",
      "platform",
      "product_ref",
      "hatog_stage",
      "hook",
      "concept",
      "caption",
      "cta",
      "creative_direction",
      "suggested_format",
      "aspect_ratio",
      "duration_seconds",
      "notes",
    ],
    properties: {
      day: { type: "integer", description: "1-based day number within the calendar." },
      content_type: { type: "string", enum: [...CONTENT_TYPES] },
      platform: { type: "string", enum: [...platforms] },
      product_ref: { type: "string", enum: [...productRefs, "none"], description: "Product reference from the data, or none." },
      hatog_stage: { type: "string", enum: [...HATOG_STAGE_KEYS] },
      hook: { type: "string" },
      concept: { type: "string" },
      caption: { type: "string" },
      cta: { type: "string" },
      creative_direction: { type: "string" },
      suggested_format: { type: "string", enum: [...CONTENT_FORMATS] },
      aspect_ratio: { type: "string", enum: [...CONTENT_ASPECT_RATIOS] },
      duration_seconds: { type: "integer", description: "5-90 for video/reel, otherwise 0." },
      notes: { type: "string", description: "Short production note; may be empty." },
    },
  };
}

export function calendarSchema(request: Pick<CalendarRequest, "products" | "platforms">) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["items"],
    properties: {
      items: { type: "array", items: itemSchema(request.products.map((_, i) => productRef(i)), request.platforms) },
    },
  };
}

export function singleItemSchema(request: Pick<CalendarRequest, "products" | "platforms">) {
  return itemSchema(
    request.products.map((_, i) => productRef(i)),
    request.platforms
  );
}

const LIMITS = { hook: 500, concept: 1000, caption: 2200, cta: 200, creative_direction: 1500, notes: 1000 } as const;

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

type ItemResult = { ok: true; item: CalendarItemDraft } | { ok: false; error: string };

export function validateGeneratedItem(
  value: unknown,
  request: Pick<CalendarRequest, "products" | "platforms" | "startDate" | "days">
): ItemResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "Item is not an object." };
  const v = value as Record<string, unknown>;

  const day = v.day;
  if (!Number.isInteger(day) || (day as number) < 1 || (day as number) > request.days) {
    return { ok: false, error: "Item day is out of range." };
  }
  if (!(CONTENT_TYPES as readonly unknown[]).includes(v.content_type)) return { ok: false, error: "Invalid content type." };
  if (!(request.platforms as readonly unknown[]).includes(v.platform)) return { ok: false, error: "Invalid platform." };
  if (!(HATOG_STAGE_KEYS as readonly unknown[]).includes(v.hatog_stage)) return { ok: false, error: "Invalid HATOG stage." };
  if (!(CONTENT_FORMATS as readonly unknown[]).includes(v.suggested_format)) return { ok: false, error: "Invalid format." };
  if (!(CONTENT_ASPECT_RATIOS as readonly unknown[]).includes(v.aspect_ratio)) return { ok: false, error: "Invalid aspect ratio." };

  // Product references are resolved server-side; the model never supplies IDs.
  let productId: string | null = null;
  if (v.product_ref !== "none") {
    const match = typeof v.product_ref === "string" && /^P(\d+)$/.exec(v.product_ref);
    const product = match ? request.products[Number(match[1]) - 1] : undefined;
    if (!product) return { ok: false, error: "Unknown product reference." };
    productId = product.id;
  }

  const text: Record<string, string> = {};
  for (const [field, max] of Object.entries(LIMITS)) {
    const s = v[field];
    if (typeof s !== "string") return { ok: false, error: `Item field "${field}" is missing.` };
    const trimmed = s.trim();
    if (field !== "notes" && !trimmed) return { ok: false, error: `Item field "${field}" is empty.` };
    if (trimmed.length > max) return { ok: false, error: `Item field "${field}" is too long.` };
    text[field] = trimmed;
  }

  const isVideo = VIDEO_CONTENT_FORMATS.includes(v.suggested_format as ContentFormat);
  const duration = v.duration_seconds;
  if (isVideo && (!Number.isInteger(duration) || (duration as number) < 5 || (duration as number) > 90)) {
    return { ok: false, error: "Video items need a 5-90 second duration." };
  }

  return {
    ok: true,
    item: {
      scheduled_date: addDays(request.startDate, (day as number) - 1),
      product_id: productId,
      content_type: v.content_type as ContentType,
      platform: v.platform as ContentPlatform,
      hatog_stage: v.hatog_stage as HatogStageKey,
      hook: text.hook,
      concept: text.concept,
      caption: text.caption,
      cta: text.cta,
      creative_direction: text.creative_direction,
      suggested_format: v.suggested_format as ContentFormat,
      aspect_ratio: v.aspect_ratio as ContentAspectRatio,
      duration_seconds: isVideo ? (duration as number) : null,
      notes: text.notes || null,
    },
  };
}

// The full plan must cover every day exactly once.
export function validateCalendar(
  value: unknown,
  request: Pick<CalendarRequest, "products" | "platforms" | "startDate" | "days">
): { ok: true; items: CalendarItemDraft[] } | { ok: false; error: string } {
  const items = (value as { items?: unknown })?.items;
  if (!Array.isArray(items)) return { ok: false, error: "Calendar has no items." };
  if (items.length !== request.days) return { ok: false, error: `Expected ${request.days} items, got ${items.length}.` };

  const seen = new Set<number>();
  const out: CalendarItemDraft[] = [];
  for (const raw of items) {
    const result = validateGeneratedItem(raw, request);
    if (!result.ok) return result;
    const day = (raw as { day: number }).day;
    if (seen.has(day)) return { ok: false, error: `Day ${day} appears more than once.` };
    seen.add(day);
    out.push(result.item);
  }
  return { ok: true, items: out.sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date)) };
}

const cut = (s: string | null | undefined, n: number) => (s ? (s.length > n ? `${s.slice(0, n)}…` : s) : undefined);

const SYSTEM_PROMPT = `You are Hook Marketing's senior social media strategist for Bangladesh e-commerce brands, using the HOOK/HATOG framework (Hook, Feature, Trust, Offer, Gift).

Plan practical, specific Facebook/Instagram content for this client — never generic filler.

Rules:
- Use only facts present in the provided product and client data. Never invent features, specifications, prices, discounts, reviews, testimonials, certifications, awards, or results. Trust/Social Proof items must not fabricate reviews: describe what to collect or show (e.g. "feature a real customer review") instead.
- Follow every negative rule and the client's offer rules. Only mention a discount if the product data contains one.
- Balance the funnel across HATOG stages and vary content types, platforms and formats across the period.
- Reference products only by their given product_ref (P1, P2, ...). Use "none" for brand-level content.
- Captions may use Bangla, English, or a natural mix following the brand voice; keep them post-ready.
- suggested_format/aspect_ratio must fit the platform (e.g. reels/stories 9:16). duration_seconds is 5-90 for video/reel, otherwise 0.
- Keep each field concise.`;

function buildPayload(context: AiContext, request: CalendarRequest) {
  const k = context.knowledge;
  return {
    client: { business_name: context.client.businessName, website: context.client.website ?? undefined },
    client_knowledge: {
      business_context: cut(k.businessContext, 1200),
      customer_profile: cut(k.customerProfile, 1200),
      product_knowledge: cut(k.productKnowledge, 1000),
      brand_voice: cut(k.brandVoice, 800),
      selling_points: cut(k.sellingPoints, 1200),
      objections: cut(k.objections, 800),
      offer_rules: cut(k.offerRules, 800),
      additional_instructions: cut(k.additionalInstructions, 800),
    },
    products: request.products.map((p, i) => ({
      product_ref: productRef(i),
      name: p.name,
      category: p.category ?? undefined,
      short_description: cut(p.shortDescription, 400),
      price: p.price ?? undefined,
      discount_price: p.discountPrice ?? undefined,
      currency: p.currency,
      features: p.features.slice(0, 10),
      benefits: p.benefits.slice(0, 10),
      target_customer: cut(p.targetCustomer, 500),
      cta: p.cta ?? undefined,
    })),
    hatog_stages: context.hatog.map((s) => ({
      key: s.key,
      name: s.name,
      objective: s.objective ?? undefined,
      content_direction: cut(s.contentDirection, 600),
    })),
    campaign_context: request.campaigns.slice(0, 10),
    negative_rules: [...context.negativePrompts.general, ...context.negativePrompts.copy],
  };
}

export function buildCalendarPrompt(context: AiContext, request: CalendarRequest): { system: string; user: string } {
  if (request.products.length === 0) throw new Error("Add at least one product before generating a calendar.");
  if (context.hatog.length === 0) throw new Error("Enable at least one HATOG stage first.");
  const payload = {
    task: {
      days: request.days,
      start_date: request.startDate,
      platforms: request.platforms,
      focus_notes: cut(request.focusNotes, 1000),
      requirement: `Return exactly one item per day for days 1-${request.days}.`,
    },
    ...buildPayload(context, request),
  };
  return { system: SYSTEM_PROMPT, user: `Plan the content calendar. Data:\n${JSON.stringify(payload, null, 2)}` };
}

export function buildItemRegenerationPrompt(
  context: AiContext,
  request: CalendarRequest,
  current: { day: number; content_type: string; hatog_stage: string; product_ref: string; platform: string },
  instructions: string | null
): { system: string; user: string } {
  if (request.products.length === 0) throw new Error("Add at least one product first.");
  const payload = {
    task: {
      regenerate_day: current.day,
      calendar_days: request.days,
      keep_if_sensible: { content_type: current.content_type, hatog_stage: current.hatog_stage, product_ref: current.product_ref, platform: current.platform },
      instructions: cut(instructions, 500),
      platforms: request.platforms,
    },
    ...buildPayload(context, request),
  };
  return {
    system: SYSTEM_PROMPT,
    user: `Write a fresh, better version of this single calendar item (same day number). Data:\n${JSON.stringify(payload, null, 2)}`,
  };
}
