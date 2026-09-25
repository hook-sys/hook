// AI brain: ONE globally selected provider (Claude / OpenAI / Gemini) + model for every task;
// discovery, normalization, usage logging and access control.
// Runs with USE_FAKES=claude,store,admin,server,session,nextcache: no network, no real keys, in-memory Supabase.
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AI_PROVIDERS,
  EMPTY_BRAIN_CONFIG,
  estimateCostUsd,
  filterGeminiModels,
  filterOpenAIModels,
  resolveRoute,
  selectableModels,
  taskForGeneration,
  validateModelChoice,
} from "@/lib/ai/providers/common";
import { geminiAgentBody, normalizeGeminiAgentTurn, openAIAgentBody } from "@/lib/ai/providers/wire";
import { brainReadiness, refreshProviderModels } from "@/lib/ai/brain";
import { generateAndLog } from "@/lib/ai/generate";
import { createAgentModelCaller } from "@/lib/agent/model";
import { runAgentLoop } from "@/lib/agent/runner";
import { testOpenAIKey } from "@/lib/ai/providers/openai";
import { testGeminiKey } from "@/lib/ai/providers/gemini";
import { IntegrationError } from "@/lib/integrations/types";
import { redactSecrets } from "@/lib/observability";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CLIENT = "11111111-1111-4111-8111-111111111111";
const ACTOR = "22222222-2222-4222-8222-222222222222";
const OPENAI_KEY = "sk-proj-TESTKEY0000000000000000000000";
const GEMINI_KEY = "AIzaTESTKEY000000000000000000000000000";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MODELS = [
  { provider: "claude", model_id: "claude-opus-5", display_name: "Claude Opus 5", is_available: true, supports_structured: true, supports_adaptive_thinking: true },
  { provider: "openai", model_id: "gpt-5.1", display_name: "gpt-5.1", is_available: true, supports_structured: null, supports_adaptive_thinking: null },
  { provider: "openai", model_id: "gpt-4.1", display_name: "gpt-4.1", is_available: false, supports_structured: null, supports_adaptive_thinking: null },
  { provider: "gemini", model_id: "gemini-3-pro", display_name: "Gemini 3 Pro", is_available: true, supports_structured: null, supports_adaptive_thinking: null },
  { provider: "claude", model_id: "claude-old", display_name: "Old", is_available: true, supports_structured: false, supports_adaptive_thinking: false },
];

function setBrain({ provider = null, model = null } = {}) {
  globalThis.__db = {
    ai_provider_models: structuredClone(MODELS),
    ai_brain_settings: provider ? [{ id: true, default_provider: provider, default_model: model }] : [],
    ai_generation_logs: [],
  };
}
const logs = () => globalThis.__db.ai_generation_logs;

let fetchCalls = [];
function stubFetch(handler) {
  fetchCalls = [];
  globalThis.fetch = async (url, init) => {
    const call = { url: String(url), init, body: init?.body ? JSON.parse(init.body) : undefined };
    fetchCalls.push(call);
    const out = await handler(call);
    if (out instanceof Error) throw out;
    return new Response(JSON.stringify(out.body ?? {}), { status: out.status ?? 200, headers: { "content-type": "application/json" } });
  };
}

let claudeRequests = [];
function claudeReplies(...messages) {
  claudeRequests = [];
  const queue = [...messages];
  globalThis.__fakeClaude = {
    beta: {
      messages: {
        stream: (body, opts) => ({
          finalMessage: async () => {
            claudeRequests.push({ body, opts });
            const next = queue.shift();
            if (next instanceof Error) throw next;
            return next;
          },
        }),
      },
    },
    models: {
      list: () =>
        (async function* () {
          yield { id: "claude-opus-5", display_name: "Claude Opus 5", capabilities: { structured_outputs: { supported: true }, thinking: { types: { adaptive: { supported: true } } } } };
          yield { id: "claude-legacy", display_name: "Legacy", capabilities: { structured_outputs: { supported: false }, thinking: { types: { adaptive: { supported: false } } } } };
        })(),
    },
  };
}
const claudeMsg = (text, stop_reason = "end_turn") => ({
  model: "claude-opus-5",
  stop_reason,
  usage: { input_tokens: 1000, output_tokens: 200 },
  content: [{ type: "text", text }],
});

const openAIReply = (content, extra = {}) => ({
  body: {
    model: "gpt-5.1-2026-01-01",
    choices: [{ finish_reason: "stop", message: { content, refusal: null, ...extra.message }, ...extra.choice }],
    usage: { prompt_tokens: 300, completion_tokens: 40 },
  },
});
const geminiReply = (parts, extra = {}) => ({
  body: {
    modelVersion: "gemini-3-pro",
    candidates: [{ finishReason: "STOP", content: { role: "model", parts }, ...extra }],
    usageMetadata: { promptTokenCount: 500, candidatesTokenCount: 60, thoughtsTokenCount: 25 },
  },
});

const SCHEMA = { type: "object", properties: { headline: { type: "string" } }, required: ["headline"], additionalProperties: false };
const validate = (v) => (v && typeof v.headline === "string" && v.headline ? { ok: true, value: v } : { ok: false, error: "headline missing" });
const generate = (generationType = "campaign_strategy") =>
  generateAndLog({ clientId: CLIENT, actorId: ACTOR, generationType, system: "SYSTEM", user: "USER", schema: SCHEMA, maxTokens: 4000, validate });
const OK_JSON = JSON.stringify({ headline: "Hi" });

beforeEach(() => {
  globalThis.__fakeSecrets = { claude: "sk-ant-TESTKEY", openai: OPENAI_KEY, gemini: GEMINI_KEY };
  globalThis.__fakeStatuses = {};
  setBrain();
  stubFetch(() => {
    throw new Error("unexpected network call");
  });
  claudeReplies();
});

// ---------------------------------------------------------------------------
// Routing (pure)
// ---------------------------------------------------------------------------

test("route: nothing selected means no AI brain (no implicit Claude default)", async () => {
  const r = resolveRoute(EMPTY_BRAIN_CONFIG);
  assert.equal(r.ok, false);
  assert.match(r.error, /Select an AI Brain provider and model/);
  claudeReplies(claudeMsg(OK_JSON));
  stubFetch(() => openAIReply(OK_JSON));
  await assert.rejects(generate(), /Select an AI Brain provider and model/);
  assert.equal(fetchCalls.length + claudeRequests.length, 0, "nothing is called when nothing is selected");
  assert.match(await brainReadiness(), /Select an AI Brain provider/);
});

test("route: the selected provider + model; a provider without a selected model is an explicit error", () => {
  assert.deepEqual(resolveRoute({ provider: "openai", model: "gpt-5.1" }).primary, { provider: "openai", model: "gpt-5.1" });
  assert.deepEqual(resolveRoute({ provider: "claude", model: "claude-sonnet-5" }).primary, { provider: "claude", model: "claude-sonnet-5" });
  const none = resolveRoute({ provider: "gemini", model: null });
  assert.equal(none.ok, false);
  assert.match(none.error, /Select a Google Gemini model in Settings → AI Brain/);
});

test("tasks: generation types map to the five task labels; Fal.ai media types are not AI-brain tasks", () => {
  assert.equal(taskForGeneration("campaign_strategy"), "strategy");
  assert.equal(taskForGeneration("content_calendar"), "content");
  assert.equal(taskForGeneration("calendar_item"), "content");
  assert.equal(taskForGeneration("agent"), "campaign_intelligence");
  assert.equal(taskForGeneration("marketing_report"), "analytics_report");
  assert.equal(taskForGeneration("creative_brief"), "creative_brief");
  assert.equal(taskForGeneration("image"), null);
  assert.equal(taskForGeneration("video"), null);
  assert.deepEqual([...AI_PROVIDERS], ["claude", "openai", "gemini"]);
});

// ---------------------------------------------------------------------------
// Model selection validation (server-side)
// ---------------------------------------------------------------------------

test("model choice: invalid provider/model rejected; provider/model mismatch rejected", () => {
  assert.match(validateModelChoice("fal", "x", MODELS), /valid AI provider/);
  assert.match(validateModelChoice("openai", "", MODELS), /Select a OpenAI model/);
  assert.match(validateModelChoice("openai", "gpt-invented-9", MODELS), /not discovered/);
  assert.match(validateModelChoice("gemini", "gpt-5.1", MODELS), /not a Google Gemini model/);
  assert.match(validateModelChoice("claude", "gemini-3-pro", MODELS), /not a Claude model/);
  assert.match(validateModelChoice("openai", "gpt-4.1", MODELS), /not currently available/);
  assert.match(validateModelChoice("claude", "claude-old", MODELS), /not currently available/);
  assert.equal(validateModelChoice("openai", "gpt-5.1", MODELS), null);
  assert.equal(validateModelChoice("claude", "claude-opus-5", MODELS), null);
  assert.deepEqual(selectableModels(MODELS, "claude").map((m) => m.model_id), ["claude-opus-5"]);
});

// ---------------------------------------------------------------------------
// Model discovery
// ---------------------------------------------------------------------------

test("OpenAI models the app can't call are not selectable (pro = Responses-only, live, GPT-3.5, base GPT-4)", () => {
  const ids = ["gpt-5.1", "gpt-5.5", "gpt-4o", "gpt-4.1-mini", "o3", "o4-mini", "gpt-5-pro", "gpt-5.2-pro-2025-12-11", "o1-pro", "gpt-live-1", "gpt-3.5-turbo", "gpt-4", "gpt-4-0613", "gpt-4-turbo", "gpt-4-turbo-2024-04-09"];
  assert.deepEqual(filterOpenAIModels(ids.map((id) => ({ id }))).map((m) => m.id), ["gpt-4.1-mini", "gpt-4o", "gpt-5.1", "gpt-5.5", "o3", "o4-mini"]);
  const stale = ids.map((id) => ({ provider: "openai", model_id: id, display_name: id, is_available: true, supports_structured: null }));
  assert.deepEqual(selectableModels(stale, "openai").map((m) => m.model_id).sort(), ["gpt-4.1-mini", "gpt-4o", "gpt-5.1", "gpt-5.5", "o3", "o4-mini"]);
  assert.match(validateModelChoice("openai", "gpt-5-pro", stale), /not currently available/);
});

test("discovery filters: only text-generation models are kept", () => {
  const openai = filterOpenAIModels(
    ["gpt-5.1", "o4-mini", "chatgpt-4o-latest", "text-embedding-3-large", "tts-1", "whisper-1", "dall-e-3", "gpt-4o-realtime-preview", "gpt-image-1", "omni-moderation-latest", "davinci-002", "gpt-4o-audio-preview"].map((id) => ({ id }))
  );
  assert.deepEqual(openai.map((m) => m.id), ["chatgpt-4o-latest", "gpt-5.1", "o4-mini"]);
  const gemini = filterGeminiModels([
    { name: "models/gemini-3-pro", displayName: "Gemini 3 Pro", supportedGenerationMethods: ["generateContent", "countTokens"] },
    { name: "models/gemini-embedding-001", supportedGenerationMethods: ["embedContent"] },
    { name: "models/gemini-2.5-flash-preview-tts", supportedGenerationMethods: ["generateContent"] },
    { name: "models/imagen-4", supportedGenerationMethods: ["predict"] },
  ]);
  assert.deepEqual(gemini.map((m) => [m.id, m.displayName]), [["gemini-3-pro", "Gemini 3 Pro"]]);
});

test("discovery: OpenAI list stored from the API; models no longer returned become unavailable", async () => {
  globalThis.__db.ai_provider_models.push({ provider: "openai", model_id: "gpt-retired", display_name: "r", is_available: true });
  stubFetch(() => ({ body: { data: [{ id: "gpt-5.1" }, { id: "gpt-5.2" }, { id: "text-embedding-3-small" }] } }));
  const { total } = await refreshProviderModels("openai");
  assert.equal(total, 2);
  assert.equal(fetchCalls[0].url, "https://api.openai.com/v1/models");
  assert.equal(fetchCalls[0].init.headers.Authorization, `Bearer ${OPENAI_KEY}`);
  const rows = globalThis.__db.ai_provider_models.filter((m) => m.provider === "openai");
  const byId = Object.fromEntries(rows.map((m) => [m.model_id, m.is_available]));
  assert.deepEqual(byId, { "gpt-5.1": true, "gpt-4.1": false, "gpt-retired": false, "gpt-5.2": true });
  assert.ok(!rows.some((m) => m.model_id.includes("embedding")), "nothing invented or non-chat stored");
});

test("discovery: Gemini paginates; Claude reports capability flags", async () => {
  stubFetch(({ url }) =>
    url.includes("pageToken=p2")
      ? { body: { models: [{ name: "models/gemini-3-flash", displayName: "Gemini 3 Flash", supportedGenerationMethods: ["generateContent"] }] } }
      : { body: { models: [{ name: "models/gemini-3-pro", supportedGenerationMethods: ["generateContent"] }], nextPageToken: "p2" } }
  );
  assert.equal((await refreshProviderModels("gemini")).total, 2);
  assert.equal(fetchCalls.length, 2);
  assert.ok(fetchCalls.every((c) => c.init.headers["x-goog-api-key"] === GEMINI_KEY && !c.url.includes(GEMINI_KEY)), "key only in header");

  claudeReplies();
  assert.equal((await refreshProviderModels("claude")).total, 2);
  const legacy = globalThis.__db.ai_provider_models.find((m) => m.model_id === "claude-legacy");
  assert.equal(legacy.supports_structured, false);
  assert.equal(legacy.supports_adaptive_thinking, false);
});

test("discovery: failure leaves the stored list unchanged; unconnected provider can't refresh", async () => {
  const before = structuredClone(globalThis.__db.ai_provider_models);
  stubFetch(() => ({ status: 401, body: { error: { message: "Incorrect API key provided" } } }));
  await assert.rejects(refreshProviderModels("openai"), (e) => e instanceof IntegrationError && /rejected the API key/.test(e.message));
  assert.deepEqual(globalThis.__db.ai_provider_models, before);

  globalThis.__fakeStatuses = { gemini: "not_connected" };
  await assert.rejects(refreshProviderModels("gemini"), /Connect Google Gemini first/);
  assert.equal(fetchCalls.length, 1);
});

// ---------------------------------------------------------------------------
// Providers end-to-end through the brain (+ usage logging)
// ---------------------------------------------------------------------------

test("Claude provider (when selected): structured workflow; usage + cost logged", async () => {
  setBrain({ provider: "claude", model: "claude-opus-5" });
  claudeReplies(claudeMsg(OK_JSON));
  const r = await generate();
  assert.deepEqual([r.data.headline, r.provider, r.model], ["Hi", "claude", "claude-opus-5"]);
  const body = claudeRequests[0].body;
  assert.equal(body.model, "claude-opus-5");
  assert.equal(body.output_config.format.type, "json_schema");
  assert.match(body.system, /untrusted reference material/);
  const [log] = logs();
  assert.equal(log.provider, "anthropic");
  assert.equal(log.task, "strategy");
  assert.equal(log.status, "succeeded");
  assert.deepEqual([log.input_tokens, log.output_tokens], [1000, 200]);
  assert.equal(log.estimated_cost_usd, 0.01);
  assert.equal(typeof log.duration_ms, "number");
  assert.equal(log.client_id, CLIENT);
});

test("OpenAI provider: structured output via json_schema, key only in the Authorization header", async () => {
  setBrain({ provider: "openai", model: "gpt-5.1" });
  stubFetch(() => openAIReply(OK_JSON));
  const r = await generate("content_calendar");
  assert.deepEqual([r.data.headline, r.provider, r.model, r.inputTokens, r.outputTokens], ["Hi", "openai", "gpt-5.1-2026-01-01", 300, 40]);
  const call = fetchCalls[0];
  assert.equal(call.url, "https://api.openai.com/v1/chat/completions");
  assert.equal(call.init.method, "POST");
  assert.equal(call.init.headers.Authorization, `Bearer ${OPENAI_KEY}`);
  assert.ok(!JSON.stringify(call.body).includes(OPENAI_KEY));
  assert.equal(call.body.model, "gpt-5.1");
  assert.deepEqual(call.body.response_format.json_schema.schema, SCHEMA);
  assert.equal(call.body.response_format.json_schema.strict, true);
  assert.equal(call.body.max_completion_tokens, 4000);
  assert.match(call.body.messages[0].content, /untrusted reference material/, "same safety rule for every provider");
  const [log] = logs();
  assert.deepEqual([log.provider, log.task, log.status, log.estimated_cost_usd], ["openai", "content", "succeeded", null]);
});

test("Gemini provider: responseJsonSchema, thought parts excluded, thinking tokens counted", async () => {
  setBrain({ provider: "gemini", model: "gemini-3-pro" });
  stubFetch(() => geminiReply([{ text: "thinking…", thought: true }, { text: OK_JSON }]));
  const r = await generate("marketing_report");
  assert.deepEqual([r.data.headline, r.provider, r.inputTokens, r.outputTokens], ["Hi", "gemini", 500, 85]);
  const call = fetchCalls[0];
  assert.equal(call.url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro:generateContent");
  assert.equal(call.init.headers["x-goog-api-key"], GEMINI_KEY);
  assert.ok(!call.url.includes(GEMINI_KEY));
  assert.equal(call.body.generationConfig.responseMimeType, "application/json");
  assert.deepEqual(call.body.generationConfig.responseJsonSchema, SCHEMA);
  assert.match(call.body.systemInstruction.parts[0].text, /untrusted reference material/);
  assert.deepEqual([logs()[0].provider, logs()[0].task], ["gemini", "analytics_report"]);
});

test("one provider for everything: every task uses the selected model; connected unselected providers are never called", async () => {
  setBrain({ provider: "openai", model: "gpt-5.1" });
  claudeReplies(claudeMsg(OK_JSON));
  stubFetch(() => openAIReply(OK_JSON));
  for (const type of ["campaign_strategy", "content_calendar", "calendar_item", "marketing_report", "creative_brief"]) {
    assert.equal((await generate(type)).provider, "openai", type);
  }
  assert.equal(fetchCalls.length, 5);
  assert.ok(fetchCalls.every((c) => c.url === "https://api.openai.com/v1/chat/completions" && c.body.model === "gpt-5.1"));
  assert.equal(claudeRequests.length, 0, "Claude is connected but not selected, so it is never called");
  assert.deepEqual([...new Set(logs().map((l) => l.task))], ["strategy", "content", "analytics_report", "creative_brief"]);
  assert.ok(logs().every((l) => l.provider === "openai" && l.model === "gpt-5.1-2026-01-01"));

  setBrain({ provider: "claude", model: "claude-opus-5" });
  claudeReplies(claudeMsg(OK_JSON), claudeMsg(OK_JSON));
  stubFetch(() => openAIReply(OK_JSON));
  assert.equal((await generate("marketing_report")).provider, "claude");
  assert.equal((await generate("creative_brief")).provider, "claude");
  assert.equal(fetchCalls.length, 0, "OpenAI is connected but not selected, so it is never called");
});

test("structured output normalized: refusals, truncation, invalid JSON and validation fail the same way", async () => {
  setBrain({ provider: "openai", model: "gpt-5.1" });
  stubFetch(() => openAIReply(null, { message: { refusal: "I can't help with that." } }));
  await assert.rejects(generate(), /OpenAI declined/);
  stubFetch(() => openAIReply('{"headline":', { choice: { finish_reason: "length" } }));
  await assert.rejects(generate(), /cut off/);
  stubFetch(() => openAIReply("not json"));
  await assert.rejects(generate(), /OpenAI returned invalid JSON/);
  stubFetch(() => openAIReply(JSON.stringify({ headline: "" })));
  await assert.rejects(generate(), /failed validation: headline missing/);

  setBrain({ provider: "gemini", model: "gemini-3-pro" });
  stubFetch(() => geminiReply([], { finishReason: "SAFETY" }));
  await assert.rejects(generate(), /Google Gemini declined/);
  stubFetch(() => ({ body: { promptFeedback: { blockReason: "PROHIBITED_CONTENT" } } }));
  await assert.rejects(generate(), /Google Gemini declined/);
  stubFetch(() => geminiReply([{ text: '{"headline"' }], { finishReason: "MAX_TOKENS" }));
  await assert.rejects(generate(), /cut off/);
  assert.ok(logs().every((l) => l.status === "failed"));
});

test("provider connection failure: rejected key and unconnected provider give admin-safe errors", async () => {
  setBrain({ provider: "openai", model: "gpt-5.1" });
  stubFetch(() => ({ status: 401, body: { error: { message: `Incorrect API key provided: ${OPENAI_KEY}` } } }));
  await assert.rejects(generate(), (e) => e instanceof IntegrationError && /OpenAI rejected the API key/.test(e.message) && !e.message.includes(OPENAI_KEY));

  stubFetch(() => new TypeError("fetch failed"));
  await assert.rejects(generate(), /Could not reach OpenAI/);
  assert.equal(fetchCalls.length, 1, "generation POSTs are never retried");

  globalThis.__fakeStatuses = { openai: "not_connected" };
  stubFetch(() => openAIReply(OK_JSON));
  await assert.rejects(generate(), /Connect OpenAI in Settings → Integrations first/);
  assert.equal(fetchCalls.length, 0);
  assert.match(await brainReadiness(), /Connect OpenAI/);

  globalThis.__fakeStatuses = {};
  setBrain({ provider: "gemini" });
  assert.match(await brainReadiness(), /Select a Google Gemini model/);
});

test("Test buttons: key tests list models without spending tokens; failures never echo the key", async () => {
  stubFetch(() => ({ body: { data: [{ id: "gpt-5.1" }] } }));
  assert.deepEqual(await testOpenAIKey(OPENAI_KEY), { ok: true, message: "Connected to OpenAI (1 chat models available)." });
  stubFetch(() => ({ status: 400, body: { error: { message: `API key not valid: ${GEMINI_KEY}` } } }));
  const bad = await testGeminiKey(GEMINI_KEY);
  assert.equal(bad.ok, false);
  assert.ok(!bad.message.includes(GEMINI_KEY), bad.message);
  stubFetch(() => ({ body: { data: [{ id: "text-embedding-3-small" }] } }));
  assert.equal((await testOpenAIKey(OPENAI_KEY)).ok, false, "never Connected without usable chat models");
});

// ---------------------------------------------------------------------------
// Fallback
// ---------------------------------------------------------------------------

test("no automatic switching: a failure of the selected provider is returned; other providers are never tried", async () => {
  setBrain({ provider: "openai", model: "gpt-5.1" });
  claudeReplies(claudeMsg(OK_JSON));
  for (const status of [429, 500, 503]) {
    stubFetch(({ url }) => (url.includes("openai") ? { status, body: {} } : geminiReply([{ text: OK_JSON }])));
    await assert.rejects(generate(), /OpenAI/);
    assert.ok(fetchCalls.every((c) => c.url.includes("api.openai.com")), "Gemini never called");
  }
  stubFetch(() => new TypeError("fetch failed"));
  await assert.rejects(generate(), /Could not reach OpenAI/);
  assert.equal(claudeRequests.length, 0, "Claude never called");
  assert.ok(logs().every((l) => l.provider === "openai" && l.status === "failed"));

  // Selected provider not connected: nothing is called at all (no silent switch).
  globalThis.__fakeStatuses = { openai: "not_connected" };
  stubFetch(() => geminiReply([{ text: OK_JSON }]));
  await assert.rejects(generate(), /Connect OpenAI/);
  assert.equal(fetchCalls.length + claudeRequests.length, 0);
});

// ---------------------------------------------------------------------------
// AI Agent (Campaign Intelligence)
// ---------------------------------------------------------------------------

const agentParams = (callModel, executed) => ({
  request: "What products do we have?",
  role: "sub_admin",
  permissions: ["ai_ads"],
  options: { allowPaidGeneration: false, allowDriveUpload: false },
  callModel,
  executeTool: async (name) => (executed.push(name), [{ id: CLIENT, name: "Wallet" }]),
  sleep: async () => {},
});

test("AI Agent on Claude (when selected): same tools, adaptive thinking and limits", async () => {
  setBrain({ provider: "claude", model: "claude-opus-5" });
  claudeReplies(
    { model: "claude-opus-5", stop_reason: "tool_use", usage: { input_tokens: 10, output_tokens: 5 }, content: [{ type: "tool_use", id: "tu_1", name: "get_products", input: {} }] },
    { model: "claude-opus-5", stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 5 }, content: [{ type: "text", text: "Wallet." }] }
  );
  const model = createAgentModelCaller();
  const executed = [];
  const out = await runAgentLoop(agentParams(model.callModel, executed));
  assert.deepEqual([out.status, out.result, model.provider], ["succeeded", "Wallet.", "claude"]);
  assert.deepEqual(executed, ["get_products"]);
  const body = claudeRequests[0].body;
  assert.equal(body.model, "claude-opus-5");
  assert.deepEqual(body.thinking, { type: "adaptive" });
  assert.ok(body.tools.every((t) => t.strict === true));
});

test("AI Agent uses the configured provider (OpenAI): tools as functions, results as tool messages", async () => {
  setBrain({ provider: "openai", model: "gpt-5.1" });
  let turn = 0;
  stubFetch(() =>
    turn++ === 0
      ? openAIReply(null, { choice: { finish_reason: "tool_calls" }, message: { tool_calls: [{ id: "call_1", type: "function", function: { name: "get_products", arguments: "{}" } }] } })
      : openAIReply("You sell a Wallet.")
  );
  const model = createAgentModelCaller();
  const executed = [];
  const out = await runAgentLoop(agentParams(model.callModel, executed));
  assert.deepEqual([out.status, out.result, model.provider], ["succeeded", "You sell a Wallet.", "openai"]);
  assert.deepEqual(executed, ["get_products"]);
  const [first, second] = fetchCalls.map((c) => c.body);
  assert.ok(first.tools.length > 0 && first.tools.every((t) => t.type === "function" && t.function.strict === true));
  assert.ok(!first.tools.some((t) => t.function.name === "upload_creative_to_drive"), "no additional tools/permissions");
  assert.deepEqual(second.messages.at(-2).tool_calls[0].id, "call_1");
  assert.equal(second.messages.at(-1).role, "tool");
  assert.equal(second.messages.at(-1).tool_call_id, "call_1");
});

test("AI Agent uses the configured provider (Gemini): function calls round-trip with raw parts replayed", async () => {
  setBrain({ provider: "gemini", model: "gemini-3-pro" });
  let turn = 0;
  const callPart = { functionCall: { name: "get_products", args: {} }, thoughtSignature: "sig-abc" };
  stubFetch(() => (turn++ === 0 ? geminiReply([callPart]) : geminiReply([{ text: "Wallet only." }])));
  const model = createAgentModelCaller();
  const executed = [];
  const out = await runAgentLoop(agentParams(model.callModel, executed));
  assert.deepEqual([out.status, out.result, model.provider], ["succeeded", "Wallet only.", "gemini"]);
  const second = fetchCalls[1].body;
  assert.deepEqual(second.contents[1], { role: "model", parts: [callPart] }, "thought signature preserved");
  const response = second.contents[2].parts[0].functionResponse;
  assert.equal(response.name, "get_products");
  assert.equal(response.id, undefined, "locally generated IDs are not sent");
  assert.ok("result" in response.response);
});

test("agent wire: OpenAI/Gemini conversions from the normalized format", () => {
  const req = {
    system: "S",
    tools: [{ name: "t", description: "d", input_schema: { type: "object" } }],
    maxTokens: 100,
    messages: [
      { role: "user", content: "hi" },
      { role: "assistant", content: [{ type: "text", text: "checking" }, { type: "tool_use", id: "a1", name: "t", input: { x: 1 } }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "a1", content: "boom", is_error: true }] },
    ],
  };
  const o = openAIAgentBody("gpt-5.1", req);
  assert.deepEqual(o.messages[2], { role: "assistant", content: "checking", tool_calls: [{ id: "a1", type: "function", function: { name: "t", arguments: '{"x":1}' } }] });
  assert.deepEqual(o.messages[3], { role: "tool", tool_call_id: "a1", content: "boom" });
  const g = geminiAgentBody(req);
  assert.deepEqual(g.contents[1].parts[1], { functionCall: { id: "a1", name: "t", args: { x: 1 } } });
  assert.deepEqual(g.contents[2].parts[0].functionResponse, { id: "a1", name: "t", response: { error: "boom" } });
  const turn = normalizeGeminiAgentTurn({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "a", thought: true }, { text: "done" }] } }] }, "m");
  assert.deepEqual([turn.stop_reason, turn.content[0].text], ["end_turn", "done"]);
});

// ---------------------------------------------------------------------------
// Cost, secrets and access control
// ---------------------------------------------------------------------------

test("cost: known Claude prices only; OpenAI/Gemini costs are N/A (never guessed)", () => {
  assert.equal(estimateCostUsd("claude", "claude-opus-5", 1_000_000, 0), 5);
  assert.equal(estimateCostUsd("openai", "gpt-5.1", 1000, 1000), null);
  assert.equal(estimateCostUsd("gemini", "gemini-3-pro", 1000, 1000), null);
});

test("secrets: provider keys are redacted from any logged/admin-visible text", () => {
  const text = `bad key ${OPENAI_KEY} and ${GEMINI_KEY} and sk-ant-api03-abcdef`;
  const out = redactSecrets(text);
  assert.ok(!out.includes(OPENAI_KEY) && !out.includes(GEMINI_KEY) && !out.includes("sk-ant-api03"), out);
});

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? sourceFiles(p) : /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

test("secrets: no provider key in NEXT_PUBLIC_*; browser components never touch keys or provider modules", () => {
  for (const file of sourceFiles(path.join(ROOT, "src"))) {
    const src = readFileSync(file, "utf8");
    assert.ok(!/NEXT_PUBLIC_[A-Z_]*(OPENAI|GEMINI|ANTHROPIC|CLAUDE|FAL|SERVICE_ROLE)/.test(src), file);
    if (/^["']use client["']/.test(src)) {
      assert.ok(!/integrations\/store|lib\/ai\/brain|providers\/(openai|gemini|http)|supabase\/admin/.test(src), `client file imports server-only module: ${file}`);
    }
  }
});

test("access: every AI settings action and the AI Brain page require Super Admin first", () => {
  const actions = read("src/lib/actions/ai-settings.ts");
  const bodies = actions.split(/export async function /).slice(1);
  assert.equal(bodies.length, 2);
  for (const body of bodies) {
    const firstStatement = body.slice(body.indexOf("{") + 1).trim().split("\n")[0];
    assert.match(firstStatement, /await requireSuperAdmin\(\)/, body.split("(")[0]);
  }
  assert.match(read("src/app/admin/(protected)/settings/ai/page.tsx"), /await requireSuperAdmin\(\);/);
  const integrations = read("src/lib/actions/integrations.ts");
  for (const fn of ["saveApiKey", "testApiKey", "removeApiKey"]) {
    const body = integrations.split(`export async function ${fn}`)[1];
    assert.match(body.slice(0, body.indexOf("\n}")), /requireSuperAdmin\(\)/, fn);
  }
});

test("Fal.ai remains separate: not an AI-brain provider and not routed", async () => {
  assert.ok(!AI_PROVIDERS.includes("fal"));
  await assert.rejects(generate("image"), /not routed to an AI provider/);
  assert.equal(fetchCalls.length + claudeRequests.length, 0);
});

// ---------------------------------------------------------------------------
// Integrations "Connect" (OpenAI / Gemini) and AI Brain settings actions
// ---------------------------------------------------------------------------

const form = (values) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
};
const idle = { status: "idle" };

function resetConnectState() {
  globalThis.__storedSecrets = {};
  globalThis.__savedIntegrations = [];
  globalThis.__fakeRole = "admin";
}

test("Connect (OpenAI): a rejected key is never stored or marked connected", async () => {
  resetConnectState();
  const { saveApiKey } = await import("@/lib/actions/integrations");
  stubFetch(() => ({ status: 401, body: { error: { message: "Incorrect API key provided" } } }));
  const r = await saveApiKey("openai", idle, form({ api_key: OPENAI_KEY }));
  assert.equal(r.status, "error");
  assert.match(r.message, /OpenAI rejected the API key.*The key was not saved/);
  assert.ok(!r.message.includes(OPENAI_KEY));
  assert.deepEqual(globalThis.__storedSecrets, {});
  assert.deepEqual(globalThis.__savedIntegrations, []);
});

test("Connect (OpenAI/Gemini): verified key stored in Vault, marked connected with a test time, models discovered", async () => {
  resetConnectState();
  const { saveApiKey } = await import("@/lib/actions/integrations");
  stubFetch(() => ({ body: { data: [{ id: "gpt-5.1" }, { id: "gpt-5.2" }] } }));
  const r = await saveApiKey("openai", idle, form({ api_key: OPENAI_KEY }));
  assert.equal(r.status, "success", r.message);
  assert.match(r.message, /Connected to OpenAI.*2 model\(s\) loaded/);
  assert.equal(globalThis.__storedSecrets.openai, OPENAI_KEY, "key goes to the Vault store only");
  const [[provider, values]] = globalThis.__savedIntegrations;
  assert.equal(provider, "openai");
  assert.equal(values.status, "connected");
  assert.ok(values.config.last_tested_at && values.connected_at);
  assert.ok(!JSON.stringify(values).includes(OPENAI_KEY), "integration row holds only a masked hint");
  assert.ok(globalThis.__db.ai_provider_models.some((m) => m.provider === "openai" && m.model_id === "gpt-5.2" && m.is_available));

  resetConnectState();
  stubFetch(() => ({ body: { models: [{ name: "models/gemini-3-flash", displayName: "Gemini 3 Flash", supportedGenerationMethods: ["generateContent"] }] } }));
  const g = await saveApiKey("gemini", idle, form({ api_key: GEMINI_KEY }));
  assert.equal(g.status, "success", g.message);
  assert.equal(globalThis.__savedIntegrations[0][1].status, "connected");
  assert.ok(globalThis.__db.ai_provider_models.some((m) => m.provider === "gemini" && m.model_id === "gemini-3-flash"));
});

test("Connect: Claude and Fal.ai keep the existing save-then-test flow (no network on save)", async () => {
  resetConnectState();
  const { saveApiKey } = await import("@/lib/actions/integrations");
  for (const provider of ["claude", "fal"]) {
    const r = await saveApiKey(provider, idle, form({ api_key: "k".repeat(40) }));
    assert.deepEqual(r, { status: "success", message: "API key saved. Run Test Connection to verify it." });
  }
  assert.deepEqual(globalThis.__savedIntegrations.map(([p, v]) => [p, v.status]), [["claude", "configured"], ["fal", "configured"]]);
  assert.equal(fetchCalls.length, 0);
});

test("AI Brain settings: one provider + model; OpenAI/Gemini/Claude selectable; mismatches rejected server-side", async () => {
  resetConnectState();
  const { saveAiBrainAction } = await import("@/lib/actions/ai-settings");

  stubFetch(({ url }) => (url.includes("api.openai.com") ? openAIReply('{"ok":true}') : geminiReply([{ text: '{"ok":true}' }])));
  claudeReplies(claudeMsg('{"ok":true}'));
  const ok = await saveAiBrainAction(idle, form({ provider: "openai", model: "gpt-5.1" }));
  assert.equal(ok.status, "success", ok.message);
  assert.equal(fetchCalls.length, 1, "one tiny test request before saving");
  assert.equal(fetchCalls[0].body.model, "gpt-5.1");
  assert.deepEqual(fetchCalls[0].body.response_format.json_schema.schema.required, ["ok"]);
  assert.deepEqual(
    [globalThis.__db.ai_brain_settings[0].default_provider, globalThis.__db.ai_brain_settings[0].default_model],
    ["openai", "gpt-5.1"]
  );
  stubFetch(() => openAIReply(OK_JSON));
  assert.equal((await generate()).provider, "openai", "the saved selection is used for real requests");
  assert.equal(await brainReadiness(), null);

  stubFetch(({ url }) => (url.includes("api.openai.com") ? openAIReply('{"ok":true}') : geminiReply([{ text: '{"ok":true}' }])));
  assert.equal((await saveAiBrainAction(idle, form({ provider: "gemini", model: "gemini-3-pro" }))).status, "success");
  assert.equal((await saveAiBrainAction(idle, form({ provider: "claude", model: "claude-opus-5" }))).status, "success");
  assert.equal(globalThis.__db.ai_brain_settings.length, 1, "single global selection");
  assert.equal(globalThis.__db.ai_brain_settings[0].default_provider, "claude");

  // A model that fails the test request is never saved.
  stubFetch(() => ({ status: 400, body: { error: { message: "This model is only supported in v1/responses" } } }));
  const failed = await saveAiBrainAction(idle, form({ provider: "openai", model: "gpt-5.1" }));
  assert.equal(failed.status, "error");
  assert.match(failed.message, /gpt-5.1 failed the test request, so it was not selected: OpenAI API error \(400\)/);
  assert.equal(globalThis.__db.ai_brain_settings[0].default_provider, "claude");

  assert.match((await saveAiBrainAction(idle, form({ provider: "gemini", model: "gpt-5.1" }))).message, /not a Google Gemini model/);
  assert.match((await saveAiBrainAction(idle, form({ provider: "openai", model: "gpt-99-invented" }))).message, /not discovered/);
  assert.match((await saveAiBrainAction(idle, form({ provider: "openai", model: "gpt-4.1" }))).message, /not currently available/);
  assert.match((await saveAiBrainAction(idle, form({ provider: "fal", model: "x" }))).message, /valid AI provider/);
  globalThis.__fakeStatuses = { openai: "not_connected" };
  assert.match((await saveAiBrainAction(idle, form({ provider: "openai", model: "gpt-5.1" }))).message, /Connect OpenAI first/);
  globalThis.__fakeStatuses = {};
  assert.deepEqual(
    [globalThis.__db.ai_brain_settings[0].default_provider, globalThis.__db.ai_brain_settings[0].default_model],
    ["claude", "claude-opus-5"],
    "rejected choices change nothing"
  );
});

test("AI Brain settings: sub-admins are refused before anything is read or written", async () => {
  resetConnectState();
  globalThis.__fakeRole = "sub_admin";
  const actions = await import("@/lib/actions/ai-settings");
  const { saveApiKey, testApiKey, removeApiKey } = await import("@/lib/actions/integrations");
  const before = structuredClone(globalThis.__db);
  await assert.rejects(actions.saveAiBrainAction(idle, form({ provider: "openai", model: "gpt-5.1" })), /access denied/);
  await assert.rejects(actions.refreshModelsAction("openai"), /access denied/);
  await assert.rejects(saveApiKey("openai", idle, form({ api_key: OPENAI_KEY })), /access denied/);
  await assert.rejects(testApiKey("gemini"), /access denied/);
  await assert.rejects(removeApiKey("openai"), /access denied/);
  assert.deepEqual(globalThis.__db, before);
  assert.deepEqual(globalThis.__storedSecrets, {});
  assert.equal(fetchCalls.length, 0);
  globalThis.__fakeRole = "admin";
});

test("readiness everywhere follows the selected AI Brain provider, not hard-coded Claude", async () => {
  const { getAiProviderReadiness } = await import("@/lib/ai/usage");
  // OpenAI selected + connected, Claude not connected: AI brain features (e.g. Creative Studio) are ready.
  setBrain({ provider: "openai", model: "gpt-5.1" });
  globalThis.__fakeStatuses = { claude: "not_connected", gemini: "not_connected" };
  let r = await getAiProviderReadiness();
  assert.deepEqual([r.brain, r.brainProvider, r.brainLabel, r.claude], ["ready", "openai", "OpenAI", "not_configured"]);
  assert.equal(await brainReadiness(), null);

  // Claude selected but not connected: not ready, even though OpenAI is connected.
  setBrain({ provider: "claude", model: "claude-opus-5" });
  r = await getAiProviderReadiness();
  assert.deepEqual([r.brain, r.brainLabel], ["not_configured", "Claude"]);
  assert.match(await brainReadiness(), /Connect Claude/);

  // Provider selected without a model: explicit "select a model" message.
  setBrain({ provider: "gemini" });
  globalThis.__fakeStatuses = {};
  r = await getAiProviderReadiness();
  assert.equal(r.brain, "not_configured");
  assert.match(r.brainDetail, /Select a Google Gemini model/);

  // No page or workflow checks Claude directly for AI brain readiness.
  for (const file of sourceFiles(path.join(ROOT, "src"))) {
    const src = readFileSync(file, "utf8");
    assert.ok(!/readiness\.claude\b/.test(src), `hard-coded Claude readiness in ${file}`);
  }
  assert.match(read("src/lib/workflows/creatives.ts"), /await brainReadiness\(\)/);
});
