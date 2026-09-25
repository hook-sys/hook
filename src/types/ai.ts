export const AI_KNOWLEDGE_FIELDS = [
  { key: "business_context", label: "Business Context", hint: "What the business does, market position, history." },
  { key: "customer_profile", label: "Customer Profile", hint: "Who buys, demographics, motivations, buying behavior." },
  { key: "product_knowledge", label: "Product Knowledge", hint: "Range-level facts that apply across products." },
  { key: "brand_voice", label: "Brand Voice", hint: "Tone, language (Bangla/English mix), words to use or avoid." },
  { key: "selling_points", label: "Selling Points", hint: "Why customers should choose this business." },
  { key: "objections", label: "Objections", hint: "Common doubts and how to answer them honestly." },
  { key: "competitor_notes", label: "Competitor Notes", hint: "Competitors and how this business differs." },
  { key: "offer_rules", label: "Offer Rules", hint: "Allowed discounts, delivery terms, what can't be promised." },
  { key: "additional_instructions", label: "Additional Instructions", hint: "Anything else the AI must follow." },
] as const;

export type AiKnowledgeKey = (typeof AI_KNOWLEDGE_FIELDS)[number]["key"];

export type ClientAiKnowledge = { client_id: string; updated_at: string } & Record<AiKnowledgeKey, string | null>;

export const HATOG_STAGE_KEYS = ["hook", "feature", "trust", "offer", "gift"] as const;
export type HatogStageKey = (typeof HATOG_STAGE_KEYS)[number];

// Default names; the editable ones live in hatog_stages (readable by super admins only).
export const HATOG_STAGE_LABELS: Record<HatogStageKey, string> = {
  hook: "H — Hook",
  feature: "A — Feature",
  trust: "T — Trust",
  offer: "O — Offer",
  gift: "G — Gift",
};

export interface HatogStage {
  key: HatogStageKey;
  letter: string;
  position: number;
  name: string;
  objective: string | null;
  description: string | null;
  audience: string | null;
  content_direction: string | null;
  ad_direction: string | null;
  ai_instructions: string | null;
  example_ideas: string[];
  enabled: boolean;
  updated_at: string;
}

export const NEGATIVE_PROMPT_CATEGORIES = ["general", "image", "video", "copy"] as const;
export type NegativePromptCategory = (typeof NEGATIVE_PROMPT_CATEGORIES)[number];

export const NEGATIVE_PROMPT_CATEGORY_LABELS: Record<NegativePromptCategory, string> = {
  general: "General",
  image: "Image",
  video: "Video",
  copy: "Copy",
};

export interface NegativePrompt {
  id: string;
  prompt: string;
  category: NegativePromptCategory;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}
