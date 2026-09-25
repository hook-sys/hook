// Creative Studio vocabulary shared by UI, validation, and DB constraints (0007).

export const CREATIVE_MEDIA = ["image", "video"] as const;
export type CreativeMedia = (typeof CREATIVE_MEDIA)[number];

export const CREATIVE_TYPES_BY_MEDIA = {
  image: ["product_showcase", "product_feature", "lifestyle", "offer_promotion"],
  video: [
    "product_showcase",
    "feature_demo",
    "problem_solution",
    "lifestyle",
    "offer_promotion",
    "ugc_presentation",
    "cinematic",
  ],
} as const;

export type CreativeType =
  | (typeof CREATIVE_TYPES_BY_MEDIA)["image"][number]
  | (typeof CREATIVE_TYPES_BY_MEDIA)["video"][number];

export const CREATIVE_TYPE_LABELS: Record<CreativeType, string> = {
  product_showcase: "Product Showcase",
  product_feature: "Product Feature",
  lifestyle: "Lifestyle",
  offer_promotion: "Offer/Promotion",
  feature_demo: "Feature Demo",
  problem_solution: "Problem → Solution",
  ugc_presentation: "UGC-style Product Presentation",
  cinematic: "Cinematic Product Video",
};

export const CREATIVE_FORMATS = ["9:16", "1:1", "16:9"] as const;
export type CreativeFormat = (typeof CREATIVE_FORMATS)[number];

export const VIDEO_DURATIONS = [5, 10, 15, 30] as const;
export type VideoDuration = (typeof VIDEO_DURATIONS)[number];

export const CREATIVE_STATUSES = ["generating", "ready", "failed", "archived"] as const;
export type CreativeStatus = (typeof CREATIVE_STATUSES)[number];

export const CREATIVE_STATUS_LABELS: Record<CreativeStatus, string> = {
  generating: "Generating",
  ready: "Ready",
  failed: "Failed",
  archived: "Archived",
};

export function isCreativeTypeFor(media: CreativeMedia, type: string): type is CreativeType {
  return (CREATIVE_TYPES_BY_MEDIA[media] as readonly string[]).includes(type);
}
