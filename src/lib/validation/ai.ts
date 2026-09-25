import {
  AI_KNOWLEDGE_FIELDS,
  NEGATIVE_PROMPT_CATEGORIES,
  type AiKnowledgeKey,
  type NegativePromptCategory,
} from "@/types/ai";

const KNOWLEDGE_MAX = 10000;

export function parseKnowledgeForm(
  formData: FormData
): { values: Record<AiKnowledgeKey, string | null>; errors: Partial<Record<AiKnowledgeKey, string>> } {
  const values = {} as Record<AiKnowledgeKey, string | null>;
  const errors: Partial<Record<AiKnowledgeKey, string>> = {};

  for (const { key, label } of AI_KNOWLEDGE_FIELDS) {
    const value = String(formData.get(key) ?? "").trim();
    if (value.length > KNOWLEDGE_MAX) errors[key] = `${label} must be under ${KNOWLEDGE_MAX} characters.`;
    values[key] = value || null;
  }

  return { values, errors };
}

export interface HatogStageValues {
  name: string;
  objective: string | null;
  description: string | null;
  audience: string | null;
  content_direction: string | null;
  ad_direction: string | null;
  ai_instructions: string | null;
  example_ideas: string[];
  enabled: boolean;
}

const HATOG_LIMITS: Record<Exclude<keyof HatogStageValues, "example_ideas" | "enabled" | "name">, number> = {
  objective: 2000,
  description: 5000,
  audience: 2000,
  content_direction: 5000,
  ad_direction: 5000,
  ai_instructions: 5000,
};

export function parseHatogStageForm(formData: FormData): { values: HatogStageValues; error: string | null } {
  const get = (name: string) => String(formData.get(name) ?? "").trim();
  const name = get("name");
  const example_ideas = get("example_ideas")
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);

  const values: HatogStageValues = {
    name,
    objective: get("objective") || null,
    description: get("description") || null,
    audience: get("audience") || null,
    content_direction: get("content_direction") || null,
    ad_direction: get("ad_direction") || null,
    ai_instructions: get("ai_instructions") || null,
    example_ideas,
    enabled: formData.get("enabled") === "on",
  };

  if (!name || name.length > 100) return { values, error: "Stage name is required (max 100 characters)." };
  for (const [field, max] of Object.entries(HATOG_LIMITS)) {
    const value = values[field as keyof typeof HATOG_LIMITS];
    if (value && value.length > max) return { values, error: `${field.replace("_", " ")} is too long (max ${max}).` };
  }
  if (example_ideas.length > 20 || example_ideas.some((i) => i.length > 500)) {
    return { values, error: "Up to 20 example ideas, each under 500 characters." };
  }
  return { values, error: null };
}

export function parseNegativePromptForm(
  formData: FormData
): { prompt: string; category: NegativePromptCategory; enabled: boolean } | { error: string } {
  const prompt = String(formData.get("prompt") ?? "").trim();
  const category = String(formData.get("category") ?? "general");
  if (!prompt || prompt.length > 500) return { error: "Enter a rule (max 500 characters)." };
  if (!(NEGATIVE_PROMPT_CATEGORIES as readonly string[]).includes(category)) return { error: "Select a category." };
  return { prompt, category: category as NegativePromptCategory, enabled: formData.get("enabled") === "on" };
}
