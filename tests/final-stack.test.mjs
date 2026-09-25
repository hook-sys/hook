// Final stack, end to end: Google Drive source image -> selected OpenAI model (brief/prompt)
// -> selected Fal.ai model -> generated image/video -> Google Drive.
// Runs with USE_FAKES=store,admin,server,session,nextcache,claude: no network, no real keys;
// every external API (Drive, OpenAI, Fal.ai) is an in-process HTTP stub.
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_FAL_MODELS,
  FAL_MODELS,
  falModelFor,
  falModelsForMode,
  isValidFalChoice,
  planFalJob,
  resolveFalSelection,
} from "@/lib/creative/fal-models";
import { inspectDriveMedia, probePublicDriveMedia } from "@/lib/integrations/drive-media";
import { startCreativeGeneration } from "@/lib/workflows/creatives";
import { uploadCreativeToDrive } from "@/lib/workflows/drive-creatives";
import { refreshCreativeStatuses } from "@/lib/actions/creatives";
import { saveFalModelsAction } from "@/lib/actions/fal-settings";
import { addProductAsset } from "@/lib/actions/products";

const CLIENT = "11111111-1111-4111-8111-111111111111";
const ACTOR = "22222222-2222-4222-8222-222222222222";
const PRODUCT = "33333333-3333-4333-8333-333333333333";
const ASSET = "44444444-4444-4444-8444-444444444444";
const REF = "1AbCdEfGhIjKlMnOpQrStUv"; // Drive file ID of the product photo
const OPENAI_KEY = "sk-proj-TESTKEY0000000000000000000000";
const FAL_KEY = "fal-TESTKEY-0000000000000000";
const DRIVE_TOKEN = "ya29.TESTTOKEN000000000000";
const PROFILE = { id: ACTOR, role: "admin", permissions: [] };

const BRIEF = {
  concept: "Everyday carry",
  hook: "Still using a bulky wallet?",
  scene_plan: [{ order: 1, duration_seconds: 5, description: "Wallet slides into a pocket" }],
  visual_direction: "Warm, natural light",
  product_presentation: "Hero close-up",
  text_overlay: "Slim. Strong.",
  cta: "Order now",
  generation_prompt: "A slim leather wallet sliding into a jeans pocket, warm light",
  negative_prompt: "blurry, distorted",
};

// ---------------------------------------------------------------------------
// In-process HTTP stubs for Google Drive, OpenAI and Fal.ai
// ---------------------------------------------------------------------------

let calls = [];
let driveFiles = {};
let driveUploads = [];
let options = {};

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

function installNetwork() {
  calls = [];
  driveFiles = {};
  driveUploads = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const method = init.method ?? "GET";
    const headers = init.headers ?? {};
    const call = { url, method, headers, body: typeof init.body === "string" ? safeJson(init.body) : init.body };
    calls.push(call);
    const u = new URL(url);

    // Google Drive public download link (how fal.ai fetches the reference).
    if (u.hostname === "drive.google.com" && u.pathname === "/uc") {
      if (options.refPrivate) return new Response("<html>sign in</html>", { status: 200, headers: { "content-type": "text/html" } });
      return new Response(null, { status: 303, headers: { location: `https://drive.usercontent.google.com/download?id=${u.searchParams.get("id")}&export=download` } });
    }
    if (u.hostname === "drive.usercontent.google.com") {
      const type = options.refMime ?? "image/jpeg";
      return new Response(new Uint8Array(16), { status: 206, headers: { "content-type": type } });
    }

    // Google Drive API (drive.file scope: user files are not visible -> 404).
    if (u.hostname === "www.googleapis.com" && u.pathname.startsWith("/drive/v3/files")) {
      const id = u.pathname.split("/")[4];
      if (method === "GET" && id) return driveFiles[id] ? json(driveFiles[id]) : json({ error: { code: 404 } }, 404);
      if (method === "GET") return json({ files: [] });
      const newId = `folder${Object.keys(driveFiles).length}xxxxxxxxxx`;
      driveFiles[newId] = { id: newId, mimeType: "application/vnd.google-apps.folder", trashed: false, ...call.body };
      return json({ id: newId });
    }
    if (u.hostname === "www.googleapis.com" && u.pathname.startsWith("/upload/drive/v3/files")) {
      if (method === "POST") return new Response(null, { status: 200, headers: { location: "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=abc" } });
      const id = "GeneratedFile0000000001";
      driveUploads.push({ bytes: init.body?.byteLength ?? 0, type: headers["Content-Type"] });
      driveFiles[id] = { id, name: "creative.mp4", mimeType: headers["Content-Type"], webViewLink: `https://drive.google.com/file/d/${id}/view`, trashed: false };
      return json(driveFiles[id]);
    }

    // OpenAI (the selected AI brain).
    if (u.hostname === "api.openai.com") {
      return json({
        model: "gpt-5.1-2026-01-01",
        choices: [{ finish_reason: "stop", message: { content: JSON.stringify(BRIEF), refusal: null } }],
        usage: { prompt_tokens: 900, completion_tokens: 300 },
      });
    }

    // Fal.ai platform API (availability/pricing) and queue.
    if (u.hostname === "api.fal.ai") {
      const endpoint = u.searchParams.get("endpoint_id");
      if (options.falUnavailable?.includes(endpoint)) return json({ prices: [] });
      return json({ prices: [{ endpoint_id: endpoint, unit_price: 0.1, unit: "second", currency: "USD" }] });
    }
    if (u.hostname === "queue.fal.run") {
      if (method === "POST") {
        const model = u.pathname.slice(1);
        return json({ request_id: "req-1", status_url: `https://queue.fal.run/${model}/requests/req-1/status`, response_url: `https://queue.fal.run/${model}/requests/req-1` });
      }
      if (u.pathname.endsWith("/status")) return json({ status: "COMPLETED" });
      return json(options.falOutput ?? { video: { url: "https://v3.fal.media/files/abc/output.mp4" } });
    }
    if (u.hostname.endsWith("fal.media")) {
      const isVideo = u.pathname.endsWith(".mp4");
      return new Response(new Uint8Array(2048), { status: 200, headers: { "content-type": isVideo ? "video/mp4" : "image/jpeg", "content-length": "2048" } });
    }
    throw new Error(`unexpected request ${method} ${url}`);
  };
}

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

function seed({ falModels = [], brain = { default_provider: "openai", default_model: "gpt-5.1" } } = {}) {
  globalThis.__db = {
    clients: [{ id: CLIENT, business_name: "Acme Leather", website: null, facebook_page_url: null, status: "active", drive_folder_id: null, drive_subfolder_ids: {} }],
    products: [{
      id: PRODUCT, client_id: CLIENT, name: "Slim Wallet", sku: null, product_url: null, category: null, status: "active",
      short_description: "Slim leather wallet", full_description: null, price: 1500, discount_price: null, currency: "BDT",
      features: ["6 card slots"], benefits: [], target_customer: null, brand_name: null, brand_colors: [], cta: null, notes: null,
    }],
    product_assets: [{ id: ASSET, product_id: PRODUCT, client_id: CLIENT, asset_type: "image", drive_file_id: REF, url: `https://drive.google.com/file/d/${REF}/view`, mime_type: "image/jpeg", label: "Front", created_at: "2026-09-01T00:00:00Z" }],
    client_ai_knowledge: [],
    hatog_stages: [{ key: "hook", letter: "H", position: 1, name: "Hook", objective: "Stop the scroll", description: null, audience: null, content_direction: null, ad_direction: null, ai_instructions: null, example_ideas: [], enabled: true }],
    negative_prompts: [],
    ai_brain_settings: brain ? [{ id: true, ...brain }] : [],
    ai_provider_models: [{ provider: "openai", model_id: "gpt-5.1", display_name: "gpt-5.1", is_available: true, supports_structured: null, supports_adaptive_thinking: null }],
    fal_model_settings: falModels,
    ai_generation_logs: [],
    creatives: [],
  };
}

const request = (extra = {}) => ({
  product_id: PRODUCT,
  media: "video",
  creative_type: "product_showcase",
  hatog_stage: "hook",
  format: "9:16",
  duration_seconds: "5",
  reference_asset_id: ASSET,
  ...extra,
});

beforeEach(() => {
  globalThis.__fakeSecrets = {
    openai: OPENAI_KEY,
    fal: FAL_KEY,
    google_drive: JSON.stringify({ access_token: DRIVE_TOKEN, refresh_token: "1//refresh", expires_at: Date.now() + 3_600_000 }),
  };
  // OpenAI is the AI brain; Claude and Gemini are not connected at all.
  globalThis.__fakeStatuses = { claude: "not_connected", gemini: "not_connected" };
  globalThis.__fakeClaude = { beta: { messages: { stream: () => { throw new Error("Claude must never be called"); } } } };
  globalThis.__fakeRole = "admin";
  options = {};
  seed();
  installNetwork();
});

// ---------------------------------------------------------------------------
// The complete flow
// ---------------------------------------------------------------------------

test("END TO END: Drive image -> OpenAI (selected model) brief -> selected Fal.ai model -> video -> Google Drive", async () => {
  seed({ falModels: [{ mode: "image-to-video", model_id: "fal-ai/kling-video/v2.1/master/image-to-video" }] });

  // 1-3: Drive reference checked, brief from the selected OpenAI model, job on the selected Fal model.
  const started = await startCreativeGeneration(PROFILE, CLIENT, request());
  assert.equal(started.ok, true, started.message);

  const probe = calls.find((c) => c.url.startsWith("https://drive.google.com/uc"));
  assert.ok(probe, "Drive reference re-checked before any paid call");
  const openai = calls.filter((c) => c.url === "https://api.openai.com/v1/chat/completions");
  assert.equal(openai.length, 1);
  assert.equal(openai[0].body.model, "gpt-5.1", "the selected OpenAI model");
  assert.equal(openai[0].headers.Authorization, `Bearer ${OPENAI_KEY}`);
  assert.match(openai[0].body.messages[1].content, /A real photo of this product is supplied/);
  assert.ok(calls.indexOf(probe) < calls.indexOf(openai[0]));

  const falSubmit = calls.find((c) => c.url.startsWith("https://queue.fal.run/") && c.method === "POST");
  assert.equal(falSubmit.url, "https://queue.fal.run/fal-ai/kling-video/v2.1/master/image-to-video", "the selected Fal.ai model");
  assert.equal(falSubmit.headers.Authorization, `Key ${FAL_KEY}`);
  assert.deepEqual(falSubmit.body, {
    prompt: BRIEF.generation_prompt,
    image_url: `https://drive.google.com/uc?export=download&id=${REF}`,
    duration: "5",
    negative_prompt: BRIEF.negative_prompt,
  });

  const [creative] = globalThis.__db.creatives;
  assert.deepEqual([creative.status, creative.provider, creative.provider_model], ["generating", "fal", "fal-ai/kling-video/v2.1/master/image-to-video"]);
  assert.equal(creative.reference_image_url, `https://drive.google.com/uc?export=download&id=${REF}`);
  assert.equal(creative.prompt, BRIEF.generation_prompt);

  // Usage: one OpenAI brief + one Fal job; nothing from Claude/Gemini.
  const logs = globalThis.__db.ai_generation_logs.map((l) => [l.provider, l.generation_type, l.status, l.model]);
  assert.deepEqual(logs, [
    ["openai", "creative_brief", "succeeded", "gpt-5.1-2026-01-01"],
    ["fal", "video", "submitted", "fal-ai/kling-video/v2.1/master/image-to-video"],
  ]);

  // 4: Fal.ai result recorded.
  const poll = await refreshCreativeStatuses(CLIENT);
  assert.equal(poll.status, "success");
  const ready = globalThis.__db.creatives[0];
  assert.deepEqual([ready.status, ready.asset_url], ["ready", "https://v3.fal.media/files/abc/output.mp4"]);

  // 5: saved to the client's Drive folder (Client / Creatives / Videos).
  const saved = await uploadCreativeToDrive(PROFILE, CLIENT, ready.id);
  assert.equal(saved.status, "uploaded");
  assert.equal(driveUploads.length, 1);
  assert.equal(driveUploads[0].type, "video/mp4");
  const stored = globalThis.__db.creatives[0];
  assert.deepEqual([stored.drive_upload_status, stored.drive_file_id, stored.drive_mime_type], ["uploaded", "GeneratedFile0000000001", "video/mp4"]);
  const folderNames = Object.values(driveFiles).filter((f) => f.mimeType === "application/vnd.google-apps.folder").map((f) => f.name);
  assert.deepEqual(folderNames.slice(-3), ["Creatives", "Images", "Videos"]);
  assert.ok(folderNames.includes("Acme Leather"));

  // Keys/tokens only ever go to their own provider, only in headers.
  for (const c of calls) {
    const text = c.url + JSON.stringify(c.body ?? "");
    for (const secret of [OPENAI_KEY, FAL_KEY, DRIVE_TOKEN]) assert.ok(!text.includes(secret), `secret in URL/body of ${c.url}`);
    const auth = c.headers?.Authorization ?? "";
    if (auth.includes(OPENAI_KEY)) assert.match(c.url, /^https:\/\/api\.openai\.com\//);
    if (auth.includes(FAL_KEY)) assert.match(c.url, /^https:\/\/(queue\.fal\.run|api\.fal\.ai)\//);
    if (auth.includes(DRIVE_TOKEN)) assert.match(c.url, /^https:\/\/www\.googleapis\.com\//);
  }
  assert.ok(!JSON.stringify(globalThis.__db).match(/sk-proj|fal-TESTKEY|ya29\./), "no key/token stored in app tables");
  assert.ok(!calls.some((c) => /anthropic|generativelanguage/.test(c.url)), "Claude/Gemini never called");
});

test("image flow: Drive image -> OpenAI brief -> selected Fal image model (Kontext max) with the Drive reference", async () => {
  seed({ falModels: [{ mode: "image-to-image", model_id: "fal-ai/flux-pro/kontext/max" }] });
  options.falOutput = { images: [{ url: "https://v3.fal.media/files/abc/output.jpg" }] };
  const r = await startCreativeGeneration(PROFILE, CLIENT, request({ media: "image", format: "1:1", duration_seconds: "" }));
  assert.equal(r.ok, true, r.message);
  const submit = calls.find((c) => c.url.startsWith("https://queue.fal.run/") && c.method === "POST");
  assert.equal(submit.url, "https://queue.fal.run/fal-ai/flux-pro/kontext/max");
  assert.equal(submit.body.image_url, `https://drive.google.com/uc?export=download&id=${REF}`);
  assert.equal(submit.body.aspect_ratio, "1:1");
  await refreshCreativeStatuses(CLIENT);
  const saved = await uploadCreativeToDrive(PROFILE, CLIENT, globalThis.__db.creatives[0].id);
  assert.equal(saved.status, "uploaded");
  assert.equal(driveUploads[0].type, "image/jpeg");
});

test("no reference: text-to-video uses the selected text-to-video model", async () => {
  seed({ falModels: [{ mode: "text-to-video", model_id: "fal-ai/kling-video/v2.1/master/text-to-video" }] });
  const r = await startCreativeGeneration(PROFILE, CLIENT, request({ reference_asset_id: "" }));
  assert.equal(r.ok, true, r.message);
  const submit = calls.find((c) => c.url.startsWith("https://queue.fal.run/") && c.method === "POST");
  assert.equal(submit.url, "https://queue.fal.run/fal-ai/kling-video/v2.1/master/text-to-video");
  assert.equal(submit.body.aspect_ratio, "9:16");
  assert.ok(!("image_url" in submit.body));
  assert.ok(!calls.some((c) => c.url.startsWith("https://drive.google.com/uc")), "no Drive check without a reference");
});

test("reference safety: a private or non-Fal-compatible Drive image stops before any paid call", async () => {
  options.refPrivate = true;
  let r = await startCreativeGeneration(PROFILE, CLIENT, request());
  assert.equal(r.ok, false);
  assert.match(r.message, /Share it as “Anyone with the link”/);
  assert.ok(!calls.some((c) => /api\.openai\.com|queue\.fal\.run/.test(c.url)), "nothing paid for");

  options = { refMime: "image/heic" };
  installNetwork();
  r = await startCreativeGeneration(PROFILE, CLIENT, request());
  assert.equal(r.ok, false);
  assert.ok(!calls.some((c) => /api\.openai\.com|queue\.fal\.run/.test(c.url)));

  globalThis.__db.product_assets[0].mime_type = "image/gif";
  installNetwork();
  r = await startCreativeGeneration(PROFILE, CLIENT, request());
  assert.match(r.message, /must be JPEG, PNG or WebP/);
  assert.equal(calls.length, 0);
});

test("no AI brain selected / Claude selected but not connected: nothing runs, no Claude fallback", async () => {
  seed({ brain: null });
  let r = await startCreativeGeneration(PROFILE, CLIENT, request());
  assert.equal(r.ok, false);
  assert.match(r.message, /Select an AI Brain provider and model/);
  seed({ brain: { default_provider: "claude", default_model: "claude-opus-5" } });
  installNetwork();
  r = await startCreativeGeneration(PROFILE, CLIENT, request());
  assert.match(r.message, /Connect Claude/);
  assert.ok(!calls.some((c) => /api\.openai\.com|queue\.fal\.run/.test(c.url)), "OpenAI is connected but not selected, so not used");
});

// ---------------------------------------------------------------------------
// Fal.ai model selector
// ---------------------------------------------------------------------------

test("Fal.ai registry: every mode offers only models built for it; selection resolves safely", () => {
  for (const [mode, models] of Object.entries({
    "text-to-image": ["fal-ai/flux/dev", "fal-ai/flux-pro/v1.1", "fal-ai/flux-pro/v1.1-ultra"],
    "image-to-image": ["fal-ai/flux-pro/kontext", "fal-ai/flux-pro/kontext/max"],
    "text-to-video": ["fal-ai/kling-video/v2.5-turbo/pro/text-to-video", "fal-ai/kling-video/v2.1/master/text-to-video"],
    "image-to-video": ["fal-ai/kling-video/v2.5-turbo/pro/image-to-video", "fal-ai/kling-video/v2.1/master/image-to-video"],
  })) {
    assert.deepEqual(falModelsForMode(mode).map((m) => m.id).sort(), [...models].sort(), mode);
  }
  assert.equal(isValidFalChoice("image-to-video", "fal-ai/flux/dev"), false, "mode/model mismatch rejected");
  assert.equal(isValidFalChoice("text-to-image", "fal-ai/unknown/model"), false);
  const sel = resolveFalSelection([
    { mode: "text-to-image", model_id: "fal-ai/flux-pro/v1.1-ultra" },
    { mode: "image-to-video", model_id: "fal-ai/flux/dev" }, // invalid -> default
  ]);
  assert.equal(sel["text-to-image"], "fal-ai/flux-pro/v1.1-ultra");
  assert.equal(sel["image-to-video"], DEFAULT_FAL_MODELS["image-to-video"]);
  assert.equal(falModelFor("image", false, sel).id, "fal-ai/flux-pro/v1.1-ultra");

  const ultra = planFalJob({ media: "image", format: "9:16", durationSeconds: null, prompt: "p", negativePrompt: "n", referenceImageUrl: null }, sel);
  assert.deepEqual(ultra, { ok: true, modelId: "fal-ai/flux-pro/v1.1-ultra", mode: "text-to-image", input: { prompt: "p", aspect_ratio: "9:16", num_images: 1, output_format: "jpeg" } });
  const pro = planFalJob({ media: "image", format: "16:9", durationSeconds: null, prompt: "p", negativePrompt: null, referenceImageUrl: null }, { ...sel, "text-to-image": "fal-ai/flux-pro/v1.1" });
  assert.equal(pro.input.image_size, "landscape_16_9");
  for (const spec of Object.values(FAL_MODELS)) assert.match(spec.id, /^[a-z0-9-]+(\/[a-z0-9._-]+)+$/);
});

test("Fal.ai model selector: Super Admin only; mismatch rejected; availability checked with fal.ai", async () => {
  const form = (values) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries({ ...DEFAULT_FAL_MODELS, ...values })) fd.set(k, v);
    return fd;
  };
  const idle = { status: "idle" };

  let r = await saveFalModelsAction(idle, form({ "text-to-image": "fal-ai/flux-pro/v1.1-ultra", "image-to-video": "fal-ai/kling-video/v2.1/master/image-to-video" }));
  assert.equal(r.status, "success", r.message);
  assert.deepEqual(
    Object.fromEntries(globalThis.__db.fal_model_settings.map((row) => [row.mode, row.model_id])),
    { ...DEFAULT_FAL_MODELS, "text-to-image": "fal-ai/flux-pro/v1.1-ultra", "image-to-video": "fal-ai/kling-video/v2.1/master/image-to-video" }
  );
  const checked = calls.filter((c) => c.url.startsWith("https://api.fal.ai/v1/models/pricing")).map((c) => new URL(c.url).searchParams.get("endpoint_id"));
  assert.deepEqual(checked.sort(), ["fal-ai/flux-pro/v1.1-ultra", "fal-ai/kling-video/v2.1/master/image-to-video"], "only changed models are checked");

  r = await saveFalModelsAction(idle, form({ "image-to-video": "fal-ai/flux/dev" }));
  assert.match(r.message, /Select a supported model for image-to-video/);

  options.falUnavailable = ["fal-ai/flux-pro/kontext/max"];
  r = await saveFalModelsAction(idle, form({ "image-to-image": "fal-ai/flux-pro/kontext/max" }));
  assert.match(r.message, /not available on Fal.ai/);
  assert.notEqual(globalThis.__db.fal_model_settings.find((x) => x.mode === "image-to-image").model_id, "fal-ai/flux-pro/kontext/max");

  globalThis.__fakeStatuses.fal = "not_connected";
  assert.match((await saveFalModelsAction(idle, form({}))).message, /Connect Fal.ai first/);
  globalThis.__fakeStatuses.fal = "connected";

  globalThis.__fakeRole = "sub_admin";
  await assert.rejects(saveFalModelsAction(idle, form({})), /access denied/);
});

// ---------------------------------------------------------------------------
// Google Drive = only image/video asset source
// ---------------------------------------------------------------------------

test("Drive media check: type comes from Drive; only images/videos; HTML/private and foreign hosts rejected", async () => {
  assert.equal(await probePublicDriveMedia(REF), "image/jpeg");
  options.refMime = "video/mp4";
  assert.equal(await probePublicDriveMedia(REF), "video/mp4");
  options.refMime = "application/pdf";
  assert.equal(await probePublicDriveMedia(REF), null);
  options = { refPrivate: true };
  assert.equal(await probePublicDriveMedia(REF), null);
  assert.equal(await probePublicDriveMedia("../../etc"), null);

  options = {};
  const info = await inspectDriveMedia(REF);
  assert.deepEqual(info, { mimeType: "image/jpeg", kind: "image", publiclyAccessible: true });

  // A file the app saved to Drive (visible via the Drive API) is typed from the API.
  driveFiles.SavedByHook0000000001 = { id: "SavedByHook0000000001", name: "x.mp4", mimeType: "video/mp4", webViewLink: null, trashed: false };
  options.refPrivate = true;
  assert.deepEqual(await inspectDriveMedia("SavedByHook0000000001"), { mimeType: "video/mp4", kind: "video", publiclyAccessible: false });
  await assert.rejects(inspectDriveMedia(REF), /Share the file as “Anyone with the link”/);
});

test("Product assets: Drive links only; image/video detected from the file; documents and other URLs rejected", async () => {
  const add = (location) => {
    const fd = new FormData();
    fd.set("location", location);
    fd.set("label", "Photo");
    return addProductAsset(CLIENT, PRODUCT, { status: "idle" }, fd);
  };
  globalThis.__db.product_assets = [];

  assert.match((await add("https://example.com/photo.jpg")).message, /Google Drive file link or file ID/);
  options.refMime = "application/pdf";
  assert.match((await add(`https://drive.google.com/file/d/${REF}/view`)).message, /image or video/);
  assert.equal(globalThis.__db.product_assets.length, 0);

  options.refMime = "image/png";
  let r = await add(`https://drive.google.com/file/d/${REF}/view?usp=sharing`);
  assert.equal(r.status, "success", r.message);
  options.refMime = "video/mp4";
  r = await add("1ZyXwVuTsRqPoNmLkJiHgFe");
  assert.equal(r.status, "success", r.message);
  assert.deepEqual(
    globalThis.__db.product_assets.map((a) => [a.asset_type, a.mime_type, a.drive_file_id]),
    [["image", "image/png", REF], ["video", "video/mp4", "1ZyXwVuTsRqPoNmLkJiHgFe"]]
  );

  globalThis.__fakeRole = "sub_admin";
  await assert.rejects(add(REF), /access denied/);
});
