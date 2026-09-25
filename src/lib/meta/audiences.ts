import type { HatogStageKey } from "@/types/ai";

// Pure: Custom Audience vocabulary, Meta rule payloads (per Meta's website/engagement custom
// audience docs), HATOG recommendations and health. Only rule shapes verified against Meta's
// documentation are automated; everything else is a definition marked "Not automated yet".

export const AUDIENCE_TYPES = [
  "website_visitors",
  "video_viewers",
  "page_engagers",
  "instagram_engagers",
  "customer_list",
  "add_to_cart",
  "initiate_checkout",
  "purchase",
  "lead",
  "retargeting",
] as const;
export type AudienceType = (typeof AUDIENCE_TYPES)[number];

export const AUDIENCE_TYPE_LABELS: Record<AudienceType, string> = {
  website_visitors: "Website Visitors",
  video_viewers: "Video Viewers",
  page_engagers: "Facebook Page Engagers",
  instagram_engagers: "Instagram Engagers",
  customer_list: "Customer List",
  add_to_cart: "Add to Cart",
  initiate_checkout: "Initiate Checkout",
  purchase: "Purchase",
  lead: "Lead",
  retargeting: "Retargeting Definition",
};

export const RETENTION_DAYS = [7, 14, 30, 60, 90, 180] as const;
export type RetentionDays = (typeof RETENTION_DAYS)[number];

export const AUDIENCE_STATUSES = ["draft", "active", "error", "archived"] as const;
export type AudienceStatus = (typeof AUDIENCE_STATUSES)[number];
export const AUDIENCE_STATUS_LABELS: Record<AudienceStatus, string> = {
  draft: "Draft (not in Meta)",
  active: "In Meta",
  error: "Error",
  archived: "Archived",
};

// Pixel standard events for website-based audiences.
const PIXEL_EVENTS: Partial<Record<AudienceType, string>> = {
  website_visitors: "PageView",
  add_to_cart: "AddToCart",
  initiate_checkout: "InitiateCheckout",
  purchase: "Purchase",
  lead: "Lead",
};

export type AudienceSourceKind = "pixel" | "page" | "instagram" | "none";

export function audienceSourceKind(type: AudienceType): AudienceSourceKind {
  if (PIXEL_EVENTS[type]) return "pixel";
  if (type === "page_engagers") return "page";
  if (type === "instagram_engagers") return "instagram";
  return "none";
}

export const NOT_AUTOMATED_MESSAGE = "Not automated yet";
export const NOT_AVAILABLE_MESSAGE = "Not available with current Meta permissions/configuration.";

export function isAutomatedAudienceType(type: AudienceType): boolean {
  return audienceSourceKind(type) !== "none";
}

export const isPixelId = (value: string) => /^[0-9]{5,30}$/.test(value);

export interface AudienceForMeta {
  name: string;
  description: string | null;
  audience_type: AudienceType;
  retention_days: number;
  source: string | null; // pixel ID (website types)
}

export interface ClientMetaRefs {
  adAccountId: string | null;
  pageId: string | null;
  instagramId: string | null;
}

export type AudiencePlan = { ok: true; adAccountId: string; params: Record<string, unknown> } | { ok: false; error: string };

// Builds POST /act_{id}/customaudiences params for automated types.
export function planMetaAudience(audience: AudienceForMeta, refs: ClientMetaRefs): AudiencePlan {
  if (!isAutomatedAudienceType(audience.audience_type)) {
    return { ok: false, error: `${AUDIENCE_TYPE_LABELS[audience.audience_type]}: ${NOT_AUTOMATED_MESSAGE}.` };
  }
  if (!refs.adAccountId) return { ok: false, error: "Assign Meta assets first (ad account)." };
  if (!(RETENTION_DAYS as readonly number[]).includes(audience.retention_days)) return { ok: false, error: "Invalid retention window." };
  const retention_seconds = audience.retention_days * 86_400;

  let rule: Record<string, unknown>;
  const kind = audienceSourceKind(audience.audience_type);
  if (kind === "pixel") {
    if (!audience.source || !isPixelId(audience.source)) return { ok: false, error: "Enter the client's Meta Pixel ID." };
    rule = {
      inclusions: {
        operator: "or",
        rules: [
          {
            event_sources: [{ id: audience.source, type: "pixel" }],
            retention_seconds,
            filter: {
              operator: "and",
              filters: [{ field: "event", operator: "i_contains", value: PIXEL_EVENTS[audience.audience_type] }],
            },
          },
        ],
      },
    };
  } else if (kind === "page") {
    if (!refs.pageId) return { ok: false, error: "Assign the client's Facebook Page first." };
    rule = {
      inclusions: {
        operator: "or",
        rules: [
          {
            event_sources: [{ id: refs.pageId, type: "page" }],
            retention_seconds,
            filter: { operator: "and", filters: [{ field: "event", operator: "eq", value: "page_engaged" }] },
          },
        ],
      },
    };
  } else {
    if (!refs.instagramId) return { ok: false, error: "Assign the client's Instagram account first." };
    rule = {
      inclusions: {
        operator: "or",
        rules: [
          {
            event_sources: [{ id: refs.instagramId, type: "ig_business" }],
            retention_seconds,
            filter: { operator: "and", filters: [{ field: "event", operator: "eq", value: "ig_business_profile_all" }] },
          },
        ],
      },
    };
  }

  return {
    ok: true,
    adAccountId: refs.adAccountId,
    params: {
      name: audience.name,
      ...(audience.description ? { description: audience.description } : {}),
      rule,
      prefill: true,
    },
  };
}

export type AudienceHealth = "not_in_meta" | "not_synced" | "ready" | "too_small" | "issue" | "archived";

export const AUDIENCE_HEALTH_LABELS: Record<AudienceHealth, string> = {
  not_in_meta: "Definition only",
  not_synced: "Not synced yet",
  ready: "Ready",
  too_small: "Too small / populating",
  issue: "Needs attention",
  archived: "Archived",
};

// Meta delivery_status: 200 usable, 300 undersized, 400+ issues.
export function audienceHealth(a: {
  status: AudienceStatus;
  meta_audience_id: string | null;
  delivery_status_code: number | null;
  last_synced_at: string | null;
}): AudienceHealth {
  if (a.status === "archived") return "archived";
  if (!a.meta_audience_id) return "not_in_meta";
  if (!a.last_synced_at || a.delivery_status_code === null) return "not_synced";
  if (a.delivery_status_code === 200) return "ready";
  if (a.delivery_status_code >= 300 && a.delivery_status_code < 400) return "too_small";
  return "issue";
}

export interface AudienceRecommendation {
  stage: HatogStageKey;
  temperature: string;
  type: AudienceType | null; // null = cold targeting, no custom audience
  retentionDays: RetentionDays | null;
  rationale: string;
}

// HATOG-aware starting points; the admin decides what to create.
export const AUDIENCE_RECOMMENDATIONS: AudienceRecommendation[] = [
  { stage: "hook", temperature: "Cold", type: null, retentionDays: null, rationale: "Hook reaches new people: use broad or interest targeting, and exclude recent purchasers." },
  { stage: "hook", temperature: "Cold (exclusion)", type: "purchase", retentionDays: 30, rationale: "Exclude recent buyers from cold Hook campaigns." },
  { stage: "feature", temperature: "Warm", type: "page_engagers", retentionDays: 30, rationale: "People who engaged with the Page are ready for product features." },
  { stage: "feature", temperature: "Warm", type: "website_visitors", retentionDays: 30, rationale: "Recent site visitors showed product interest." },
  { stage: "trust", temperature: "Warm", type: "video_viewers", retentionDays: 30, rationale: "Video viewers know the product — show proof and reviews." },
  { stage: "trust", temperature: "Warm", type: "instagram_engagers", retentionDays: 60, rationale: "Instagram engagers respond to social proof." },
  { stage: "offer", temperature: "Hot", type: "add_to_cart", retentionDays: 14, rationale: "Cart abandoners are the highest-intent retargeting pool." },
  { stage: "offer", temperature: "Hot", type: "initiate_checkout", retentionDays: 14, rationale: "Checkout starters need a final push (offer/urgency)." },
  { stage: "gift", temperature: "Customers", type: "purchase", retentionDays: 180, rationale: "Past buyers: thank-you, gift, cross-sell and repeat purchase." },
  { stage: "gift", temperature: "Leads", type: "lead", retentionDays: 30, rationale: "Leads who haven't bought yet: convert with a gift or bonus." },
];

// Meta error codes that mean the app/user lacks the permission or configuration.
export function isMetaPermissionError(message: string): boolean {
  return /\((10|200|294|2654|2655|1870053|190)\)/.test(message) || /permission/i.test(message);
}
