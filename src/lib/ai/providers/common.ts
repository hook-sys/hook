// Pure, provider-neutral core of the AI brain: registry, task routing, fallback policy,
// normalized results and cost estimates. No network, no secrets — unit-testable.

export const AI_PROVIDERS = ["claude", "openai", "gemini"] as const;
export type AIProviderId = (typeof AI_PROVIDERS)[number];

export const AI_PROVIDER_LABELS: Record<AIProviderId, string> = {
  claude: "Claude",
  openai: "OpenAI",
  gemini: "Google Gemini",
};

// Value stored in ai_generation_logs.provider (historical "anthropic" kept for Claude).
export const LOG_PROVIDER: Record<AIProviderId, "anthropic" | "openai" | "gemini"> = {
  claude: "anthropic",
  openai: "openai",
  gemini: "gemini",
};

export function isAIProvider(value: unknown): value is AIProviderId {
  return typeof value === "string" && (AI_PROVIDERS as readonly string[]).includes(value);
}

// The model the app used before multi-provider support; still the default when nothing
// is configured, so existing behavior is unchanged.
export const LEGACY_CLAUDE_MODEL = "claude-opus-5";

export const AI_TASKS = ["strategy", "content", "campaign_intelligence", "analytics_report", "creative_brief"] as const;
export type AITask = (typeof AI_TASKS)[number];

export const AI_TASK_LABELS: Record<AITask, { label: string; description: string }> = {
  strategy: { label: "Strategy", description: "Campaign strategy drafts" },
  content: { label: "Content / Copy", description: "Content calendar and item regeneration" },
  campaign_intelligence: { label: "Campaign Intelligence", description: "AI Marketing Agent" },
  analytics_report: { label: "Analytics Report", description: "AI marketing reports" },
  creative_brief: { label: "Creative Brief", description: "Creative briefs for Fal.ai generation" },
};

export function isAITask(value: unknown): value is AITask {
  return typeof value === "string" && (AI_TASKS as readonly string[]).includes(value);
}

// Existing usage-log generation types -> routing task.
const GENERATION_TASK: Record<string, AITask> = {
  campaign_strategy: "strategy",
  content_calendar: "content",
  calendar_item: "content",
  agent: "campaign_intelligence",
  marketing_report: "analytics_report",
  creative_brief: "creative_brief",
};

export function taskForGeneration(generationType: string): AITask | null {
  return GENERATION_TASK[generationType] ?? null;
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

export interface ModelRef {
  provider: AIProviderId;
  model: string;
}

export interface BrainConfig {
  defaultProvider: AIProviderId;
  providerDefaults: Partial<Record<AIProviderId, string | null>>;
  tasks: Partial<Record<AITask, ModelRef & { enabled: boolean }>>;
  fallback: { enabled: boolean; provider: AIProviderId | null; model: string | null };
}

export const EMPTY_BRAIN_CONFIG: BrainConfig = {
  defaultProvider: "claude",
  providerDefaults: {},
  tasks: {},
  fallback: { enabled: false, provider: null, model: null },
};

export type RouteResult = { ok: true; primary: ModelRef; fallback: ModelRef | null } | { ok: false; error: string };

// Task-specific model if configured and enabled; otherwise the default provider + its
// default model. Fallback is used only when explicitly enabled and it differs from primary.
export function resolveRoute(config: BrainConfig, task: AITask): RouteResult {
  const taskRoute = config.tasks[task];
  let primary: ModelRef | null = null;
  if (taskRoute?.enabled) {
    primary = { provider: taskRoute.provider, model: taskRoute.model };
  } else {
    const provider = config.defaultProvider;
    const model = config.providerDefaults[provider] ?? (provider === "claude" ? LEGACY_CLAUDE_MODEL : null);
    if (!model) {
      return { ok: false, error: `Select a default ${AI_PROVIDER_LABELS[provider]} model in Settings → AI Brain.` };
    }
    primary = { provider, model };
  }

  const fb = config.fallback;
  const fallback =
    fb.enabled && fb.provider && fb.model && !(fb.provider === primary.provider && fb.model === primary.model)
      ? { provider: fb.provider, model: fb.model }
      : null;
  return { ok: true, primary, fallback };
}

// ---------------------------------------------------------------------------
// Normalized results + errors
// ---------------------------------------------------------------------------

export type StopKind = "complete" | "max_tokens" | "refusal";

// What every provider adapter returns for a structured request.
export interface ProviderResult {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  stop: StopKind;
}

export interface StructuredResult<T> {
  data: T;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface UsageInfo {
  model: string;
  inputTokens: number;
  outputTokens: number;
}

// Admin-safe error. `retryable` marks temporary provider failures (rate limit, timeout,
// 5xx/overloaded) — the only failures that may trigger the optional fallback.
export class AIGenerationError extends Error {
  constructor(
    message: string,
    readonly usage: UsageInfo | null = null,
    readonly retryable = false
  ) {
    super(message);
  }
}

export function httpErrorIsRetryable(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

// Same checks for every provider: refusal, truncation, JSON, then the caller's validator.
export function finishStructured<T>(
  result: ProviderResult,
  validate: (value: unknown) => { ok: true; value: T } | { ok: false; error: string },
  providerLabel: string
): StructuredResult<T> {
  const usage = { model: result.model, inputTokens: result.inputTokens, outputTokens: result.outputTokens };
  if (result.stop === "refusal") {
    throw new AIGenerationError(`${providerLabel} declined this request. Adjust the product data or instructions and retry.`, usage);
  }
  if (result.stop === "max_tokens") throw new AIGenerationError(`${providerLabel}'s response was cut off. Try again.`, usage);

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.text);
  } catch {
    throw new AIGenerationError(`${providerLabel} returned invalid JSON.`, usage);
  }
  const checked = validate(parsed);
  if (!checked.ok) throw new AIGenerationError(`${providerLabel}'s response failed validation: ${checked.error}`, usage);
  return { data: checked.value, ...usage };
}

// ---------------------------------------------------------------------------
// Cost estimates (USD per million tokens). Only prices we actually know are listed;
// anything else is null ("N/A"), never guessed.
// ---------------------------------------------------------------------------

const PRICING: Partial<Record<AIProviderId, Record<string, [number, number]>>> = {
  claude: {
    "claude-opus-5": [5, 25],
    "claude-opus-4-8": [5, 25],
    "claude-sonnet-5": [2, 10],
  },
};

export function estimateCostUsd(provider: AIProviderId, model: string, inputTokens: number, outputTokens: number): number | null {
  const price = PRICING[provider]?.[model];
  if (!price) return null;
  return Math.round(((inputTokens * price[0] + outputTokens * price[1]) / 1_000_000) * 10_000) / 10_000;
}

// ---------------------------------------------------------------------------
// Model discovery filters (applied to what the provider's API actually returns)
// ---------------------------------------------------------------------------

export interface DiscoveredModel {
  id: string;
  displayName: string;
  supportsStructured: boolean | null;
  supportsAdaptiveThinking: boolean | null;
}

const MODEL_ID = /^[A-Za-z0-9._:/-]{1,200}$/;

// OpenAI's /v1/models lists every model type (embeddings, audio, images...). Keep the
// text-generation families usable with Chat Completions.
export function filterOpenAIModels(models: { id: string }[]): DiscoveredModel[] {
  const chatFamily = /^(gpt-|o\d|chatgpt-)/;
  const nonChat = /(embedding|tts|whisper|dall-e|audio|realtime|transcribe|image|moderation|search|instruct|computer-use|codex)/;
  return models
    .filter((m) => MODEL_ID.test(m.id) && chatFamily.test(m.id) && !nonChat.test(m.id))
    .map((m) => ({ id: m.id, displayName: m.id, supportsStructured: null, supportsAdaptiveThinking: null }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

// Gemini returns supportedGenerationMethods; keep text models that support generateContent.
export function filterGeminiModels(
  models: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[]
): DiscoveredModel[] {
  const nonText = /(embedding|tts|image-generation|imagen|veo|native-audio|live|aqa)/;
  return models
    .filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
    .map((m) => ({ id: m.name.replace(/^models\//, ""), name: m.displayName }))
    .filter((m) => MODEL_ID.test(m.id) && !nonText.test(m.id))
    .map((m) => ({ id: m.id, displayName: m.name || m.id, supportsStructured: null, supportsAdaptiveThinking: null }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

// ---------------------------------------------------------------------------
// Admin model selection
// ---------------------------------------------------------------------------

export interface StoredModel {
  provider: AIProviderId;
  model_id: string;
  display_name: string;
  is_available: boolean;
  supports_structured: boolean | null;
}

// Models an admin may select: discovered for that provider, still available, and not
// reported as lacking structured output (the app requires JSON outputs).
export function selectableModels(models: StoredModel[], provider: AIProviderId): StoredModel[] {
  return models.filter((m) => m.provider === provider && m.is_available && m.supports_structured !== false);
}

// Server-side check for every saved selection (the browser is never trusted).
export function validateModelChoice(provider: unknown, model: unknown, models: StoredModel[]): string | null {
  if (!isAIProvider(provider)) return "Select a valid AI provider.";
  if (typeof model !== "string" || !model) return `Select a ${AI_PROVIDER_LABELS[provider]} model.`;
  const own = models.find((m) => m.provider === provider && m.model_id === model);
  if (!own) {
    return models.some((m) => m.model_id === model)
      ? `"${model}" is not a ${AI_PROVIDER_LABELS[provider]} model.`
      : "That model was not discovered for this provider. Refresh the model list.";
  }
  if (!selectableModels(models, provider).some((m) => m.model_id === model)) {
    return `"${model}" is not currently available for structured output. Choose another model or refresh the list.`;
  }
  return null;
}
