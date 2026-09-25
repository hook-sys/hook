// Per-client Google Drive sources -> Creative Studio (selected OpenAI brain + selected Fal.ai
// models) -> Ad Run (existing Drive creatives, no generation) -> save to Drive.
// USE_FAKES=claude,store,admin,server,session,nextcache,meta — no network, no real keys.
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import { DEFAULT_FAL_MODELS, checkReferenceCompatibility, falModelFor } from "@/lib/creative/fal-models";
import { driveMediaKind, parseDriveLink, sourceAccepts } from "@/lib/drive/media-types";
import { listClientDriveAssetsAction, recheckDriveSourceAction, removeDriveSourceAction, saveDriveSourceAction } from "@/lib/actions/drive-sources";
import { saveFalModelsAction } from "@/lib/actions/fal-settings";
import { addDriveCreativeToCampaign } from "@/lib/actions/campaigns";
import { getFalModelSelection } from "@/lib/creative/fal-selection";
import { startCreativeGeneration } from "@/lib/workflows/creatives";
import { uploadCreativeToDrive } from "@/lib/workflows/drive-creatives";
import { refreshCreativeStatuses } from "@/lib/actions/creatives";
import { publishCampaignToMeta } from "@/lib/integrations/meta-ads";
import { CreativeGeneratorForm } from "@/components/admin/creative/CreativeGeneratorForm";
import { GET as thumbnailRoute } from "@/app/api/drive/thumbnail/route";
import { log as metaLog } from "@/lib/integrations/meta";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CLIENT = "11111111-1111-4111-8111-111111111111";
const OTHER_CLIENT = "99999999-9999-4999-8999-999999999999";
const ACTOR = "22222222-2222-4222-8222-222222222222";
const PRODUCT = "33333333-3333-4333-8333-333333333333";
const CAMPAIGN = "55555555-5555-4555-8555-555555555555";
const PROFILE = { id: ACTOR, role: "admin", permissions: [] };
const READONLY = "https://www.googleapis.com/auth/drive.readonly";
const OPENAI_KEY = "sk-proj-TESTKEY0000000000000000000000";
const FAL_KEY = "fal-TESTKEY-0000000000000000";
const DRIVE_TOKEN = "ya29.TESTTOKEN000000000000";

// Drive content visible to the connected Google account.
const IMAGES_FOLDER = "FolderImages000000001";
const VIDEOS_FOLDER = "FolderVideos000000001";
const MIXED_FOLDER = "FolderMixed0000000001";
const FOREIGN_FOLDER = "FolderForeign00000001";
const PHOTO = "PhotoPrivate000000001";
const PHOTO_PUBLIC = "PhotoPublic0000000001";
const CLIP = "ClipVideo000000000001";
const PDF = "BrochurePdf0000000001";
const SECRET = "OtherClientPhoto00001";

const BRIEF = {
  concept: "Sharp look", hook: "Dress to win", scene_plan: [{ order: 1, duration_seconds: 5, description: "Model in suit" }],
  visual_direction: "Studio light", product_presentation: "Full body", text_overlay: "Formal Men", cta: "Shop now",
  generation_prompt: "A man in a tailored navy suit, studio light", negative_prompt: "blurry",
};

let calls;
let items;
let driveUploads;

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

function seedDrive() {
  const folder = (id, name) => ({ id, name, mimeType: "application/vnd.google-apps.folder", parents: ["root"] });
  items = {
    [IMAGES_FOLDER]: folder(IMAGES_FOLDER, "Product Images"),
    [VIDEOS_FOLDER]: folder(VIDEOS_FOLDER, "Product Videos"),
    [MIXED_FOLDER]: folder(MIXED_FOLDER, "Creative Assets"),
    [FOREIGN_FOLDER]: folder(FOREIGN_FOLDER, "Someone else"),
    [PHOTO]: { id: PHOTO, name: "suit-front.jpg", mimeType: "image/jpeg", parents: [IMAGES_FOLDER, MIXED_FOLDER], size: "204800" },
    [PHOTO_PUBLIC]: { id: PHOTO_PUBLIC, name: "suit-side.png", mimeType: "image/png", parents: [IMAGES_FOLDER], size: "102400", public: true },
    [CLIP]: { id: CLIP, name: "catwalk.mp4", mimeType: "video/mp4", parents: [VIDEOS_FOLDER, MIXED_FOLDER], size: "5000000" },
    [PDF]: { id: PDF, name: "brochure.pdf", mimeType: "application/pdf", parents: [MIXED_FOLDER, IMAGES_FOLDER] },
    [SECRET]: { id: SECRET, name: "private.jpg", mimeType: "image/jpeg", parents: [FOREIGN_FOLDER] },
  };
}

function installNetwork() {
  calls = [];
  driveUploads = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const method = init.method ?? "GET";
    const headers = init.headers ?? {};
    const body = typeof init.body === "string" ? (() => { try { return JSON.parse(init.body); } catch { return init.body; } })() : init.body;
    calls.push({ url, method, headers, body });
    const u = new URL(url);
    const auth = headers.Authorization ?? "";

    if (u.hostname === "www.googleapis.com" && u.pathname.startsWith("/drive/v3/files")) {
      assert.equal(auth, `Bearer ${DRIVE_TOKEN}`);
      const id = u.pathname.split("/")[4];
      if (id && u.searchParams.get("alt") === "media") {
        const item = items[id];
        return item ? new Response(new Uint8Array(64).fill(7), { status: 200, headers: { "content-type": item.mimeType, "content-length": "64" } }) : json({}, 404);
      }
      if (id && method === "GET") {
        const item = items[id];
        return item ? json({ ...item, trashed: false, thumbnailLink: `https://lh3.googleusercontent.com/thumb/${id}`, webViewLink: `https://drive.google.com/file/d/${id}/view` }) : json({}, 404);
      }
      if (method === "GET") {
        const q = u.searchParams.get("q");
        const parent = q.match(/'([^']+)' in parents/)?.[1];
        const mimes = [...q.matchAll(/mimeType='([^']+)'/g)].map((m) => m[1]);
        const files = Object.values(items).filter((i) => i.parents.includes(parent) && (!mimes.length || mimes.includes(i.mimeType)));
        return json({ files: files.map((f) => ({ ...f, trashed: false, thumbnailLink: `https://lh3.googleusercontent.com/thumb/${f.id}` })) });
      }
      const newId = `NewFolder${String(Object.keys(items).length).padStart(12, "0")}`;
      items[newId] = { id: newId, mimeType: "application/vnd.google-apps.folder", parents: body?.parents ?? [], ...body };
      return json({ id: newId });
    }
    if (u.hostname === "www.googleapis.com" && u.pathname.startsWith("/upload/drive/v3/files")) {
      if (method === "POST") return new Response(null, { status: 200, headers: { location: "https://www.googleapis.com/upload/drive/v3/files?upload_id=x" } });
      const id = `Saved${String(driveUploads.length).padStart(16, "0")}`;
      driveUploads.push({ id, type: headers["Content-Type"] });
      return json({ id, name: `formal-men-${id}.${headers["Content-Type"] === "video/mp4" ? "mp4" : "jpg"}`, mimeType: headers["Content-Type"], webViewLink: `https://drive.google.com/file/d/${id}/view` });
    }
    if (u.hostname === "lh3.googleusercontent.com") {
      assert.equal(auth, `Bearer ${DRIVE_TOKEN}`);
      return new Response(new Uint8Array([137, 80, 78, 71]), { status: 200, headers: { "content-type": "image/png" } });
    }
    if (u.hostname === "drive.google.com" && u.pathname === "/uc") {
      const item = items[u.searchParams.get("id")];
      if (!item?.public) return new Response("<html>sign in</html>", { status: 200, headers: { "content-type": "text/html" } });
      return new Response(null, { status: 303, headers: { location: `https://drive.usercontent.google.com/download?id=${item.id}` } });
    }
    if (u.hostname === "drive.usercontent.google.com") {
      return new Response(new Uint8Array(8), { status: 206, headers: { "content-type": items[u.searchParams.get("id")].mimeType } });
    }
    if (u.hostname === "api.openai.com") {
      return json({ model: "gpt-5.1-2026-01-01", choices: [{ finish_reason: "stop", message: { content: JSON.stringify(BRIEF), refusal: null } }], usage: { prompt_tokens: 800, completion_tokens: 200 } });
    }
    if (u.hostname === "api.fal.ai") {
      const endpoint = u.searchParams.get("endpoint_id");
      return json({ prices: [{ endpoint_id: endpoint, unit_price: 0.05, unit: "image", currency: "USD" }] });
    }
    if (u.hostname === "queue.fal.run") {
      if (method === "POST") {
        const model = u.pathname.slice(1);
        return json({ request_id: "r1", status_url: `https://queue.fal.run/${model}/requests/r1/status`, response_url: `https://queue.fal.run/${model}/requests/r1` });
      }
      if (u.pathname.endsWith("/status")) return json({ status: "COMPLETED" });
      return json(u.pathname.includes("kling") ? { video: { url: "https://v3.fal.media/files/o/out.mp4" } } : { images: [{ url: "https://v3.fal.media/files/o/out.jpg" }] });
    }
    if (u.hostname.endsWith("fal.media")) {
      const video = u.pathname.endsWith(".mp4");
      return new Response(new Uint8Array(1024), { status: 200, headers: { "content-type": video ? "video/mp4" : "image/jpeg", "content-length": "1024" } });
    }
    throw new Error(`unexpected ${method} ${url}`);
  };
}

function seedDb() {
  globalThis.__db = {
    clients: [
      { id: CLIENT, business_name: "Formal Men", website: null, facebook_page_url: null, status: "active", drive_folder_id: null, drive_subfolder_ids: {} },
      { id: OTHER_CLIENT, business_name: "Other", status: "active", drive_folder_id: null, drive_subfolder_ids: {} },
    ],
    products: [{ id: PRODUCT, client_id: CLIENT, name: "Navy Suit", status: "active", features: [], benefits: [], brand_colors: [], price: 9000, currency: "BDT" }],
    product_assets: [],
    client_ai_knowledge: [],
    hatog_stages: [{ key: "hook", letter: "H", position: 1, name: "Hook", objective: "Stop the scroll", example_ideas: [], enabled: true }],
    negative_prompts: [],
    ai_brain_settings: [{ id: true, default_provider: "openai", default_model: "gpt-5.1" }],
    ai_provider_models: [{ provider: "openai", model_id: "gpt-5.1", display_name: "gpt-5.1", is_available: true, supports_structured: null }],
    fal_model_settings: [],
    client_drive_sources: [],
    ai_generation_logs: [],
    creatives: [],
    campaigns: [{ id: CAMPAIGN, client_id: CLIENT, product_id: PRODUCT, name: "Eid Suits", status: "draft", hatog_stage: "hook", objective: "OUTCOME_TRAFFIC", strategy: {}, daily_budget: 1000, budget_currency: "BDT", meta_ad_account_id: "act_1", meta_page_id: "p1", meta_instagram_account_id: null, meta_campaign_id: null }],
    campaign_creatives: [],
  };
}

const form = (values) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
};
const idle = { status: "idle" };
const addSource = (name, url, media_type, sourceId = null) => saveDriveSourceAction(CLIENT, sourceId, idle, form({ name, url, media_type }));
const sources = () => globalThis.__db.client_drive_sources;
const paidCalls = () => calls.filter((c) => /api\.openai\.com|queue\.fal\.run/.test(c.url));

beforeEach(() => {
  globalThis.__fakeSecrets = {
    openai: OPENAI_KEY,
    fal: FAL_KEY,
    google_drive: JSON.stringify({ access_token: DRIVE_TOKEN, refresh_token: "1//r", expires_at: Date.now() + 3_600_000 }),
  };
  globalThis.__fakeStatuses = { claude: "not_connected", gemini: "not_connected" };
  globalThis.__fakeConfigs = { google_drive: { granted_scopes: `openid email https://www.googleapis.com/auth/drive.file ${READONLY}` } };
  globalThis.__fakeClaude = { beta: { messages: { stream: () => { throw new Error("Claude must never be called"); } } } };
  globalThis.__fakeRole = "admin";
  globalThis.__fakePermissions = [];
  seedDrive();
  seedDb();
  installNetwork();
});

async function seedSources() {
  await addSource("Product Images", `https://drive.google.com/drive/folders/${IMAGES_FOLDER}?usp=sharing`, "image");
  await addSource("Product Videos", `https://drive.google.com/drive/u/0/folders/${VIDEOS_FOLDER}`, "video");
  await addSource("Creative Assets", `https://drive.google.com/drive/folders/${MIXED_FOLDER}`, "mixed");
  return Object.fromEntries(sources().map((s) => [s.name, s.id]));
}

// ---------------------------------------------------------------------------
// 1-5: client Drive sources
// ---------------------------------------------------------------------------

test("1-5: add multiple Drive sources (image, video, mixed), edit and remove; links are checked with Drive", async () => {
  const ids = await seedSources();
  assert.deepEqual(
    sources().map((s) => [s.name, s.media_type, s.item_kind, s.status, s.drive_id]),
    [
      ["Product Images", "image", "folder", "available", IMAGES_FOLDER],
      ["Product Videos", "video", "folder", "available", VIDEOS_FOLDER],
      ["Creative Assets", "mixed", "folder", "available", MIXED_FOLDER],
    ]
  );
  assert.equal(sources()[0].drive_url, `https://drive.google.com/drive/folders/${IMAGES_FOLDER}`);

  // A single image file can also be a source; a PDF or a video in an image source cannot.
  assert.equal((await addSource("Hero shot", `https://drive.google.com/file/d/${PHOTO}/view`, "image")).status, "success");
  assert.equal(sources().at(-1).item_kind, "file");
  assert.match((await addSource("Brochure", `https://drive.google.com/file/d/${PDF}/view`, "mixed")).message, /Only folders or JPG, PNG, WEBP, MP4, MOV and WEBM/);
  assert.match((await addSource("Clip", `https://drive.google.com/file/d/${CLIP}/view`, "image")).message, /not an image/);
  assert.match((await addSource("Web", "https://example.com/folder", "image")).message, /Google Drive folder or file link/);
  assert.match((await addSource("Gone", "https://drive.google.com/drive/folders/Missing000000000001", "image")).message, /Not found/);

  // Edit
  const edited = await addSource("Suit Photos", `https://drive.google.com/drive/folders/${IMAGES_FOLDER}`, "image", ids["Product Images"]);
  assert.equal(edited.status, "success", edited.message);
  assert.equal(sources().find((s) => s.id === ids["Product Images"]).name, "Suit Photos");

  // Re-check marks a source unavailable when Drive no longer has it.
  delete items[VIDEOS_FOLDER];
  const recheck = await recheckDriveSourceAction(CLIENT, ids["Product Videos"]);
  assert.equal(recheck.status, "error");
  assert.equal(sources().find((s) => s.id === ids["Product Videos"]).status, "unavailable");

  // Remove
  assert.equal((await removeDriveSourceAction(CLIENT, ids["Product Videos"])).status, "success");
  assert.equal(sources().length, 3);

  // Super Admin only.
  globalThis.__fakeRole = "sub_admin";
  await assert.rejects(addSource("X", `https://drive.google.com/drive/folders/${IMAGES_FOLDER}`, "image"), /access denied/);
  await assert.rejects(removeDriveSourceAction(CLIENT, ids["Creative Assets"]), /access denied/);
});

test("without the read-only grant, sources are saved as 'Not checked' and nothing is listed", async () => {
  globalThis.__fakeConfigs = { google_drive: { granted_scopes: "openid email https://www.googleapis.com/auth/drive.file" } };
  const r = await addSource("Product Images", `https://drive.google.com/drive/folders/${IMAGES_FOLDER}`, "image");
  assert.equal(r.status, "success");
  assert.match(r.message, /Reconnect Google Drive/);
  assert.equal(sources()[0].status, "unchecked");
  const list = await listClientDriveAssetsAction(CLIENT, null);
  assert.equal(list.ok, false);
  assert.match(list.message, /read-only access/);
  assert.ok(!calls.some((c) => c.url.includes("googleapis.com/drive")), "no Drive reads without the grant");
});

test("6: Creative Studio picker lists only image/video files from this client's sources, with filters", async () => {
  const ids = await seedSources();
  const all = await listClientDriveAssetsAction(CLIENT, null);
  assert.equal(all.ok, true);
  const names = all.assets.map((a) => `${a.sourceName}/${a.name}/${a.kind}`).sort();
  assert.deepEqual(names, [
    "Creative Assets/catwalk.mp4/video",
    "Creative Assets/suit-front.jpg/image",
    "Product Images/suit-front.jpg/image",
    "Product Images/suit-side.png/image",
    "Product Videos/catwalk.mp4/video",
  ]);
  assert.ok(!all.assets.some((a) => a.name.endsWith(".pdf")), "documents ignored");
  const one = all.assets.find((a) => a.name === "suit-front.jpg");
  assert.equal(one.thumbnailUrl, `/api/drive/thumbnail?client=${CLIENT}&source=${one.sourceId}&file=${PHOTO}`);
  assert.ok(!JSON.stringify(all).includes(DRIVE_TOKEN) && !JSON.stringify(all).includes("googleusercontent"), "no token or Drive URLs sent to the browser");

  const videosOnly = await listClientDriveAssetsAction(CLIENT, ids["Product Videos"]);
  assert.deepEqual(videosOnly.assets.map((a) => a.name), ["catwalk.mp4"]);

  // Staff without content/campaigns access can't browse.
  globalThis.__fakeRole = "sub_admin";
  globalThis.__fakePermissions = ["leads"];
  assert.deepEqual(await listClientDriveAssetsAction(CLIENT, null), { ok: false, message: "Access denied." });
});

test("thumbnail proxy: server-side fetch; only files inside the client's sources; auth required", async () => {
  const ids = await seedSources();
  const get = (params) => thumbnailRoute(new NextRequest(`http://localhost/api/drive/thumbnail?${new URLSearchParams(params)}`));
  let res = await get({ client: CLIENT, source: ids["Product Images"], file: PHOTO });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/png");
  res = await get({ client: CLIENT, source: ids["Product Images"], file: SECRET });
  assert.equal(res.status, 404, "a file outside the configured source is refused");
  res = await get({ client: CLIENT, source: ids["Product Images"], file: CLIP });
  assert.equal(res.status, 404, "a file from another folder is refused");
  globalThis.__fakeRole = "sub_admin";
  globalThis.__fakePermissions = [];
  res = await get({ client: CLIENT, source: ids["Product Images"], file: PHOTO });
  assert.equal(res.status, 403);
});

// ---------------------------------------------------------------------------
// 7-11: generation with the saved models
// ---------------------------------------------------------------------------

const generate = (extra) =>
  startCreativeGeneration(PROFILE, CLIENT, {
    product_id: PRODUCT, media: "image", creative_type: "product_showcase", hatog_stage: "hook", format: "1:1", duration_seconds: "", ...extra,
  });

test("7: Drive image -> OpenAI -> brief -> selected Fal.ai image-reference model -> image (private file sent as data URI)", async () => {
  const ids = await seedSources();
  globalThis.__db.fal_model_settings = [{ mode: "image-to-image", model_id: "fal-ai/flux-pro/kontext/max" }];
  const r = await generate({ reference_drive_source_id: ids["Product Images"], reference_drive_file_id: PHOTO });
  assert.equal(r.ok, true, r.message);
  const openai = calls.find((c) => c.url.includes("api.openai.com"));
  assert.equal(openai.body.model, "gpt-5.1");
  const submit = calls.find((c) => c.url.startsWith("https://queue.fal.run/") && c.method === "POST");
  assert.equal(submit.url, "https://queue.fal.run/fal-ai/flux-pro/kontext/max");
  assert.match(submit.body.image_url, /^data:image\/jpeg;base64,/, "private Drive image delivered by the server");
  assert.equal(submit.headers.Authorization, `Key ${FAL_KEY}`);
  const creative = globalThis.__db.creatives[0];
  assert.equal(creative.reference_image_url, `https://drive.google.com/file/d/${PHOTO}/view`, "no data URI stored in the database");
  assert.equal(creative.provider_model, "fal-ai/flux-pro/kontext/max");
  assert.ok(calls.findIndex((c) => c.url.includes("alt=media")) < calls.indexOf(openai), "reference validated before paying for the brief");

  // A publicly shared Drive image is passed by URL instead.
  installNetwork();
  const r2 = await generate({ reference_drive_source_id: ids["Product Images"], reference_drive_file_id: PHOTO_PUBLIC });
  assert.equal(r2.ok, true, r2.message);
  const submit2 = calls.find((c) => c.url.startsWith("https://queue.fal.run/") && c.method === "POST");
  assert.equal(submit2.body.image_url, `https://drive.google.com/uc?export=download&id=${PHOTO_PUBLIC}`);
});

test("8: Drive image -> OpenAI -> selected image-to-video model; a Drive video reference is rejected before any paid call", async () => {
  const ids = await seedSources();
  globalThis.__db.fal_model_settings = [{ mode: "image-to-video", model_id: "fal-ai/kling-video/v2.1/master/image-to-video" }];
  const r = await generate({ media: "video", format: "9:16", duration_seconds: "5", reference_drive_source_id: ids["Creative Assets"], reference_drive_file_id: PHOTO });
  assert.equal(r.ok, true, r.message);
  const submit = calls.find((c) => c.url.startsWith("https://queue.fal.run/") && c.method === "POST");
  assert.equal(submit.url, "https://queue.fal.run/fal-ai/kling-video/v2.1/master/image-to-video");
  assert.equal(submit.body.duration, "5");

  installNetwork();
  const bad = await generate({ media: "video", format: "9:16", duration_seconds: "5", reference_drive_source_id: ids["Product Videos"], reference_drive_file_id: CLIP });
  assert.equal(bad.ok, false);
  assert.match(bad.message, /Kling 2\.1 Master \(image-to-video\) accepts an image reference, not a video/);
  assert.deepEqual(paidCalls(), [], "no OpenAI or Fal.ai call");

  // A file from outside the client's sources is refused (no arbitrary Drive access).
  installNetwork();
  const foreign = await generate({ reference_drive_source_id: ids["Product Images"], reference_drive_file_id: SECRET });
  assert.match(foreign.message, /not in this client's Drive source folder/);
  assert.deepEqual(paidCalls(), []);
});

test("9-11: displayed models come from the saved configuration and follow changes automatically", async () => {
  const render = (falModels) =>
    renderToStaticMarkup(
      createElement(CreativeGeneratorForm, {
        clientId: CLIENT,
        products: [{ id: PRODUCT, name: "Navy Suit" }],
        driveSources: [{ id: "s1", name: "Product Images" }],
        generateAction: async () => ({ status: "idle" }),
        canGenerate: true,
        falModels,
        brain: { providerLabel: "OpenAI", model: "gpt-5.1" },
      })
    );
  let html = render(await getFalModelSelection());
  assert.match(html, /OpenAI → gpt-5\.1/);
  assert.match(html, /Image Generation.*Fal\.ai → FLUX\.1 \[dev\]/s, "default until the Super Admin saves a model");

  // 10: Super Admin changes the image model under Integrations.
  const fd = new FormData();
  for (const [mode, id] of Object.entries({ ...DEFAULT_FAL_MODELS, "text-to-image": "fal-ai/flux-pro/v1.1-ultra" })) fd.set(mode, id);
  assert.equal((await saveFalModelsAction(idle, fd)).status, "success");

  // 11: Creative Studio displays and uses the new model without any other change.
  const selection = await getFalModelSelection();
  html = render(selection);
  assert.match(html, /Fal\.ai → FLUX1\.1 \[pro\] ultra/);
  assert.match(html, /fal-ai\/flux-pro\/v1\.1-ultra/);
  installNetwork();
  const r = await generate({});
  assert.equal(r.ok, true, r.message);
  assert.equal(calls.find((c) => c.url.startsWith("https://queue.fal.run/") && c.method === "POST").url, "https://queue.fal.run/fal-ai/flux-pro/v1.1-ultra");

  // Which model runs for each media/reference combination.
  assert.equal(falModelFor("video", false, selection).id, DEFAULT_FAL_MODELS["text-to-video"]);
  assert.equal(falModelFor("video", true, selection).id, DEFAULT_FAL_MODELS["image-to-video"]);
  assert.equal(checkReferenceCompatibility("image", "video", selection) !== null, true);
  assert.equal(checkReferenceCompatibility("image", "image", selection), null);

  // No hard-coded model names in Creative Studio UI.
  for (const file of ["src/components/admin/creative/CreativeGeneratorForm.tsx", "src/components/admin/creative/ActiveModelsPanel.tsx", "src/app/admin/(protected)/clients/[id]/creative-studio/page.tsx"]) {
    assert.ok(!/FLUX|Kling|gpt-|claude-/i.test(readFileSync(`${ROOT}${file}`, "utf8")), file);
  }
});

// ---------------------------------------------------------------------------
// 12-14: Ad Run with existing Drive creatives (no generation)
// ---------------------------------------------------------------------------

test("12-14: ad run uses an existing Drive image/video — no OpenAI or Fal.ai call; metadata only", async () => {
  const ids = await seedSources();
  const add = (sourceId, fileId, format = "1:1") =>
    addDriveCreativeToCampaign(CLIENT, CAMPAIGN, idle, form({ drive_creative_source_id: sourceId, drive_creative_file_id: fileId, hatog_stage: "hook", format }));

  let r = await add(ids["Product Images"], PHOTO);
  assert.equal(r.status, "success", r.message);
  r = await add(ids["Product Videos"], CLIP, "9:16");
  assert.equal(r.status, "success", r.message);
  assert.deepEqual(paidCalls(), [], "14: no generation for existing Drive creatives");

  const [image, video] = globalThis.__db.creatives;
  assert.deepEqual(
    [image.source, image.provider, image.status, image.media, image.drive_file_id, image.drive_mime_type, image.drive_file_name],
    ["drive", "drive", "ready", "image", PHOTO, "image/jpeg", "suit-front.jpg"]
  );
  assert.deepEqual([video.media, video.drive_mime_type, video.duration_seconds], ["video", "video/mp4", null]);
  assert.equal(image.drive_source_id, ids["Product Images"]);
  assert.ok(!Object.values(image).some((v) => typeof v === "string" && v.startsWith("data:")), "no media bytes stored");
  assert.deepEqual(globalThis.__db.campaign_creatives.map((c) => [c.creative_id, c.position]), [[image.id, 0], [video.id, 1]]);

  // Re-adding the same file reuses the creative.
  r = await add(ids["Creative Assets"], PHOTO);
  assert.match(r.message, /already in this campaign/);
  assert.equal(globalThis.__db.creatives.length, 2);

  // Files outside the client's sources and unsupported types are refused.
  assert.match((await add(ids["Product Images"], SECRET)).message, /not in this client's Drive source folder/);
  assert.match((await add(ids["Creative Assets"], PDF)).message, /Only JPG, PNG, WEBP images and MP4, MOV, WEBM videos/);

  // Publishing (disabled in production) sends the Drive image to Meta via server-side upload.
  globalThis.__metaFlag = true;
  metaLog.length = 0;
  installNetwork();
  const published = await publishCampaignToMeta({
    campaign: { ...globalThis.__db.campaigns[0], status: "approved", strategy: { primary_text: "p", headline: "h", cta: "SHOP_NOW", target_audience: { countries: ["BD"] } } },
    productUrl: "https://formalmen.example/suit",
    creatives: [image],
    metaConnected: true,
    publishingEnabled: true,
  });
  globalThis.__metaFlag = false;
  assert.equal(published.adIds.length, 1);
  const upload = metaLog.find(([, path]) => path.endsWith("/adimages"));
  assert.ok(upload && typeof upload[2].bytes === "string" && upload[2].bytes.length > 0, "image bytes uploaded to Meta");
  const creativePayload = metaLog.find(([, path]) => path.endsWith("/adcreatives"))[2];
  assert.match(creativePayload.object_story_spec.link_data.image_hash, /^hash-/);
  assert.ok(!("picture" in creativePayload.object_story_spec.link_data), "no private Drive URL given to Meta");
  assert.deepEqual(paidCalls(), []);
});

// ---------------------------------------------------------------------------
// 15-19: save to Drive; OpenAI is the only AI brain
// ---------------------------------------------------------------------------

test("15-19: generated image and video saved to Drive with metadata; only OpenAI is used as AI brain", async () => {
  await seedSources();
  assert.equal((await generate({})).ok, true);
  assert.equal((await generate({ media: "video", format: "9:16", duration_seconds: "5" })).ok, true);
  await refreshCreativeStatuses(CLIENT);
  for (const creative of [...globalThis.__db.creatives]) {
    const saved = await uploadCreativeToDrive(PROFILE, CLIENT, creative.id);
    assert.equal(saved.status, "uploaded");
  }
  assert.deepEqual(driveUploads.map((u) => u.type), ["image/jpeg", "video/mp4"]);
  for (const c of globalThis.__db.creatives) {
    assert.equal(c.drive_upload_status, "uploaded");
    assert.match(c.drive_file_id, /^Saved/);
    assert.match(c.drive_file_name, /^formal-men-/);
    assert.ok(c.drive_mime_type && c.provider_model && c.media && c.client_id === CLIENT && c.created_at);
  }

  const brainCalls = calls.filter((c) => /api\.openai\.com|anthropic|generativelanguage/.test(c.url));
  assert.equal(brainCalls.length, 2);
  assert.ok(brainCalls.every((c) => c.url === "https://api.openai.com/v1/chat/completions" && c.body.model === "gpt-5.1"), "17: OpenAI only");
  // 18: Claude is not connected and never required; 19: Gemini never called.
  assert.equal(globalThis.__fakeStatuses.claude, "not_connected");
  assert.ok(!calls.some((c) => /anthropic|generativelanguage\.googleapis/.test(c.url)));
});

test("Drive media rules: supported types and link parsing", () => {
  assert.deepEqual(["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime", "video/webm", "image/gif", "application/pdf", "text/plain"].map(driveMediaKind), ["image", "image", "image", "video", "video", "video", null, null, null]);
  assert.equal(sourceAccepts("image", "video/mp4"), false);
  assert.equal(sourceAccepts("mixed", "video/mp4"), true);
  assert.deepEqual(parseDriveLink(`https://drive.google.com/drive/u/1/folders/${IMAGES_FOLDER}?usp=drive_link`), { id: IMAGES_FOLDER, hint: "folder" });
  assert.deepEqual(parseDriveLink(`https://drive.google.com/file/d/${PHOTO}/view`), { id: PHOTO, hint: "file" });
  assert.deepEqual(parseDriveLink(`https://drive.google.com/open?id=${PHOTO}`), { id: PHOTO, hint: "unknown" });
  assert.equal(parseDriveLink("https://evil.example/drive/folders/abcdefghijklmnop"), null);
  assert.equal(parseDriveLink("http://drive.google.com/drive/folders/abcdefghijklmnop"), null);
});
