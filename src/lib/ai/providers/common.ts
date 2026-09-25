// Pure, provider-neutral core of the AI brain: registry, global provider/model routing,
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

// Default model of the Claude adapter when called directly (never used by AI brain routing,
// which always passes the Super Admin's selected model).
export const LEGACY_CLAUDE_MODEL = "claude-opus-5";

export const AI_TASKS = ["strategy", "content", "campaign_intelligence", "analytics_report", "creative_brief"] as const;
export type AITask = (typeof AI_TASKS)[number];

export function isAITask(value: unknown): value is AITask {
  return typeof value === "string" && (AI_TASKS as readonly string[]).includes(value);
}

// Existing generation types -> task label recorded in the usage log (all tasks use the
// same globally selected provider/model).
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

// ONE globally selected provider + model serves every AI brain task. Other connected
// providers are never called. There is no automatic switching between providers.
export interface BrainConfig {
  provider: AIProviderId | null;
  model: string | null;
}

export const EMPTY_BRAIN_CONFIG: BrainConfig = { provider: null, model: null };

export type RouteResult = { ok: true; primary: ModelRef } | { ok: false; error: string };

// Only an explicit Super Admin selection is used; there is no implicit default provider.
export function resolveRoute(config: BrainConfig): RouteResult {
  if (!config.provider) return { ok: false, error: "Select an AI Brain provider and model in Settings → AI Brain." };
  if (!config.model) return { ok: false, error: `Select a ${AI_PROVIDER_LABELS[config.provider]} model in Settings → AI Brain.` };
  return { ok: true, primary: { provider: config.provider, model: config.model } };
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
// 5xx/overloaded).
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
// text-generation families usable with Chat Completions + JSON-schema structured output:
// "-pro" models are Responses-API only, "live" models are realtime, and GPT-3.5 / base GPT-4
// don't support structured outputs. (Saving a model also runs a real test request.)
const OPENAI_CHAT_FAMILY = /^(gpt-|o\d|chatgpt-)/;
const OPENAI_UNSUPPORTED =
  /(embedding|tts|whisper|dall-e|audio|realtime|transcribe|image|moderation|search|instruct|computer-use|codex|-pro(-|$)|^gpt-live|^gpt-3\.5|^gpt-4(-turbo.*|-\d{4})?$)/;

export function isOpenAIChatModelId(id: string): boolean {
  return MODEL_ID.test(id) && OPENAI_CHAT_FAMILY.test(id) && !OPENAI_UNSUPPORTED.test(id);
}

export function filterOpenAIModels(models: { id: string }[]): DiscoveredModel[] {
  return models
    .filter((m) => isOpenAIChatModelId(m.id))
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
  return models.filter(
    (m) =>
      m.provider === provider &&
      m.is_available &&
      m.supports_structured !== false &&
      // Also applied to rows discovered before the filter was tightened.
      (provider !== "openai" || isOpenAIChatModelId(m.model_id))
  );
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
