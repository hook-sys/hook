import test from "node:test";
import assert from "node:assert/strict";
import {
  validateCalendar,
  validateGeneratedItem,
  canTransitionContentItem,
  isIsoDate,
  addDays,
  buildCalendarPrompt,
  calendarSchema,
} from "@/lib/ai/content-calendar";
import {
  planMetaAudience,
  audienceHealth,
  AUDIENCE_RECOMMENDATIONS,
  AUDIENCE_TYPES,
  isAutomatedAudienceType,
  isMetaPermissionError,
} from "@/lib/meta/audiences";
import { resolveRange, previousRange, normalizeRow, rollup, mapToInternal, formatMetric, pctChange } from "@/lib/meta/insights";
import { validateMarketingReport, isGrounded, collectNumbers } from "@/lib/ai/marketing-report";
import { ensureCreativeFolders, isAllowedCreativeSource, creativeFileName } from "@/lib/integrations/drive-folders";
import { authorizeTool, toolsFor, AGENT_TOOL_NAMES, redactForLog, AGENT_LIMITS } from "@/lib/agent/policy";
import { runAgentLoop, ToolError } from "@/lib/agent/runner";
import { redactSecrets } from "@/lib/observability";
import { isUuid } from "@/lib/validation/ids";

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const products = [
  { id: P1, name: "Wallet", category: null, shortDescription: null, price: 1500, discountPrice: null, currency: "BDT", features: ["6 slots"], benefits: [], targetCustomer: null, cta: null },
  { id: P2, name: "Belt", category: null, shortDescription: null, price: 900, discountPrice: 800, currency: "BDT", features: [], benefits: [], targetCustomer: null, cta: null },
];
const calReq = { startDate: "2026-10-01", days: 7, platforms: ["facebook", "instagram"], products };
const item = (day, extra = {}) => ({
  day, content_type: "product_post", platform: "facebook", product_ref: "P1", hatog_stage: "hook", hook: "h", concept: "c", caption: "cap",
  cta: "Order", creative_direction: "d", suggested_format: "single_image", aspect_ratio: "1:1", duration_seconds: 0, notes: "", ...extra,
});

// ---------------- Phase 10: calendar ----------------
test("calendar: valid plan maps product refs to real IDs and dates", () => {
  const items = Array.from({ length: 7 }, (_, i) => item(i + 1, i === 3 ? { product_ref: "P2" } : i === 5 ? { product_ref: "none" } : {}));
  const r = validateCalendar({ items }, calReq);
  assert.equal(r.ok, true);
  assert.equal(r.items[0].scheduled_date, "2026-10-01");
  assert.equal(r.items[6].scheduled_date, "2026-10-07");
  assert.equal(r.items[3].product_id, P2);
  assert.equal(r.items[5].product_id, null);
  assert.equal(r.items[0].duration_seconds, null);
});

test("calendar: rejects wrong count, duplicate days, unknown products, bad video duration, bad platform", () => {
  assert.equal(validateCalendar({ items: [item(1)] }, calReq).ok, false);
  const dup = Array.from({ length: 7 }, (_, i) => item(i === 6 ? 1 : i + 1));
  assert.match(validateCalendar({ items: dup }, calReq).error, /more than once/);
  assert.equal(validateGeneratedItem(item(1, { product_ref: "P9" }), calReq).ok, false);
  assert.equal(validateGeneratedItem(item(1, { product_ref: P1 }), calReq).ok, false, "raw IDs from the model are rejected");
  assert.equal(validateGeneratedItem(item(1, { suggested_format: "reel", duration_seconds: 0 }), calReq).ok, false);
  assert.equal(validateGeneratedItem(item(1, { suggested_format: "reel", duration_seconds: 15 }), calReq).item.duration_seconds, 15);
  assert.equal(validateGeneratedItem(item(1, { platform: "tiktok" }), calReq).ok, false);
  assert.equal(validateGeneratedItem(item(8), calReq).ok, false);
  assert.equal(validateGeneratedItem(item(1, { caption: "x".repeat(2201) }), calReq).ok, false);
  assert.deepEqual(calendarSchema(calReq).properties.items.items.properties.product_ref.enum, ["P1", "P2", "none"]);
});

test("calendar: prompt contains products as refs, no empty-product calendars; status rules", () => {
  const ctx = {
    client: { businessName: "Demo", website: null },
    knowledge: { businessContext: "b", customerProfile: null, productKnowledge: null, brandVoice: null, sellingPoints: null, objections: null, offerRules: null, additionalInstructions: null },
    hatog: [{ key: "hook", name: "Hook", objective: "o", contentDirection: "cd" }],
    negativePrompts: { general: ["no fake claims"], image: [], video: [], copy: ["no guarantees"] },
  };
  const { user } = buildCalendarPrompt(ctx, { ...calReq, focusNotes: null, campaigns: [] });
  assert.match(user, /"product_ref": "P1"/);
  assert.ok(!user.includes(P1), "real product IDs are not sent to the model");
  assert.throws(() => buildCalendarPrompt(ctx, { ...calReq, products: [], focusNotes: null, campaigns: [] }), /at least one product/);
  assert.ok(isIsoDate("2026-02-28") && !isIsoDate("2026-02-30") && !isIsoDate("2026/01/01"));
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.ok(canTransitionContentItem("draft", "approved", "sub_admin"));
  assert.ok(!canTransitionContentItem("approved", "scheduled", "sub_admin"));
  assert.ok(canTransitionContentItem("approved", "scheduled", "admin"));
  assert.ok(!canTransitionContentItem("draft", "published", "admin"));
});

// ---------------- Phase 11: audiences ----------------
const refs = { adAccountId: "act_1", pageId: "222", instagramId: "333" };
test("audiences: Meta rule payloads only for verified types", () => {
  const atc = planMetaAudience({ name: "ATC", description: null, audience_type: "add_to_cart", retention_days: 14, source: "123456789" }, refs);
  assert.equal(atc.ok, true);
  const rule = atc.params.rule.inclusions.rules[0];
  assert.deepEqual(rule.event_sources, [{ id: "123456789", type: "pixel" }]);
  assert.equal(rule.retention_seconds, 14 * 86400);
  assert.equal(rule.filter.filters[0].value, "AddToCart");
  const page = planMetaAudience({ name: "P", description: null, audience_type: "page_engagers", retention_days: 30, source: null }, refs);
  assert.equal(page.params.rule.inclusions.rules[0].event_sources[0].id, "222", "page comes from the client assignment");
  assert.equal(planMetaAudience({ name: "V", description: null, audience_type: "video_viewers", retention_days: 30, source: null }, refs).ok, false);
  assert.equal(planMetaAudience({ name: "C", description: null, audience_type: "customer_list", retention_days: 30, source: null }, refs).ok, false);
  assert.match(planMetaAudience({ name: "W", description: null, audience_type: "website_visitors", retention_days: 30, source: null }, refs).error, /Pixel/);
  assert.match(planMetaAudience({ name: "W", description: null, audience_type: "purchase", retention_days: 30, source: "1234567" }, { ...refs, adAccountId: null }).error, /Assign Meta assets/);
  assert.equal(planMetaAudience({ name: "W", description: null, audience_type: "purchase", retention_days: 45, source: "1234567" }, refs).ok, false);
  assert.ok(!isAutomatedAudienceType("retargeting"));
  for (const r of AUDIENCE_RECOMMENDATIONS) assert.ok(r.type === null || AUDIENCE_TYPES.includes(r.type));
});

test("audiences: health + permission error mapping", () => {
  assert.equal(audienceHealth({ status: "draft", meta_audience_id: null, delivery_status_code: null, last_synced_at: null }), "not_in_meta");
  assert.equal(audienceHealth({ status: "active", meta_audience_id: "1", delivery_status_code: 200, last_synced_at: "x" }), "ready");
  assert.equal(audienceHealth({ status: "active", meta_audience_id: "1", delivery_status_code: 300, last_synced_at: "x" }), "too_small");
  assert.equal(audienceHealth({ status: "active", meta_audience_id: "1", delivery_status_code: 471, last_synced_at: "x" }), "issue");
  assert.ok(isMetaPermissionError("Meta API error (200). Permissions error"));
  assert.ok(!isMetaPermissionError("Meta API error (100)."));
});

// ---------------- Phase 12: analytics ----------------
test("insights: ranges", () => {
  const now = new Date("2026-09-25T10:00:00Z");
  assert.deepEqual(resolveRange("today", undefined, undefined, now).range, { key: "today", preset: "today", since: "2026-09-25", until: "2026-09-25" });
  assert.equal(resolveRange("last_7d", undefined, undefined, now).range.since, "2026-09-18");
  assert.equal(resolveRange("bogus", undefined, undefined, now).range.key, "last_7d");
  assert.equal(resolveRange("custom", "2026-09-10", "2026-09-01", now).ok, false);
  assert.equal(resolveRange("custom", "2026-09-01", "2026-09-30", now).ok, false, "future");
  assert.equal(resolveRange("custom", "2026-01-01", "2026-09-01", now).ok, false, ">90 days");
  const custom = resolveRange("custom", "2026-09-01", "2026-09-10", now).range;
  assert.deepEqual([previousRange(custom).since, previousRange(custom).until], ["2026-08-22", "2026-08-31"]);
});

test("insights: normalization never invents metrics", () => {
  const row = normalizeRow(
    {
      campaign_id: "9", campaign_name: "C", spend: "100.50", impressions: "10000", clicks: "200", reach: "8000",
      actions: [{ action_type: "offsite_conversion.fb_pixel_purchase", value: "4" }, { action_type: "omni_purchase", value: "5" }, { action_type: "lead", value: "2" }],
      action_values: [{ action_type: "omni_purchase", value: "500" }],
    },
    "campaign"
  );
  assert.equal(row.spend, 100.5);
  assert.equal(row.purchases, 5, "canonical action type preferred, no double counting");
  assert.equal(row.conversions, 7);
  assert.equal(row.ctr, 2);
  assert.ok(Math.abs(row.roas - 500 / 100.5) < 1e-9);
  const empty = normalizeRow({ spend: "0", impressions: "0" }, "account");
  assert.equal(empty.ctr, null);
  assert.equal(empty.cpc, null);
  assert.equal(empty.purchases, null);
  assert.equal(empty.roas, null);
  assert.equal(formatMetric(null, "money"), "N/A");
  assert.equal(pctChange(10, 0), null);
  const r = rollup([row, normalizeRow({ spend: "50", impressions: "5000", clicks: "50" }, "campaign")], "All");
  assert.equal(r.spend, 150.5);
  assert.equal(r.reach, null, "reach is not additive");
  const mapped = mapToInternal([row], [{ meta_campaign_id: "9", product_id: P1, hatog_stage: "offer" }], new Map([[P1, "Wallet"]]));
  assert.deepEqual(mapped.mapping.get("9"), { product: "Wallet", hatogStage: "offer" });
  assert.equal(mapped.productRollups[0].name, "Wallet");
  assert.equal(mapToInternal([row], [], new Map()).productRollups[0].name, "Unmapped (not created here)");
});

test("AI report: facts are grounded or downgraded; kinds enforced per section", () => {
  const facts = { account: { spend: 1234.56, ctr_pct: 1.85, clicks: 420 }, campaigns: [{ name: "A", roas: 3.2 }] };
  const known = collectNumbers(facts);
  assert.ok(isGrounded("Spend was 1,234.56 BDT with CTR 1.85%", known));
  assert.ok(!isGrounded("Spend was 9,999 BDT", known));
  const empty = Object.fromEntries(["notable_changes", "top_campaigns", "weak_campaigns", "possible_reasons", "funnel_observations", "creative_observations", "next_actions", "data_gaps"].map((k) => [k, []]));
  const r = validateMarketingReport(
    {
      ...empty,
      summary: [
        { kind: "fact", text: "Spend was 1,234.56 with 420 clicks.", evidence: "account.spend=1234.56, clicks=420" },
        { kind: "fact", text: "Spend grew 57% vs last week.", evidence: "spend" },
        { kind: "fact", text: "ROAS was 7.5.", evidence: "" },
      ],
      next_actions: [{ kind: "fact", text: "Increase budget on A.", evidence: "" }],
      possible_reasons: [{ kind: "recommendation", text: "Creative fatigue.", evidence: "" }],
    },
    facts
  );
  assert.equal(r.ok, true);
  assert.equal(r.report.summary[0].kind, "fact");
  assert.equal(r.report.summary[1].kind, "interpretation");
  assert.equal(r.report.summary[1].unverified, true);
  assert.equal(r.report.summary[2].kind, "interpretation", "facts without evidence are not facts");
  assert.equal(r.report.next_actions[0].kind, "recommendation");
  assert.equal(r.report.possible_reasons[0].kind, "interpretation");
  assert.equal(validateMarketingReport({ ...empty, summary: [] }, facts).ok, false);
  assert.equal(validateMarketingReport({ ...empty, summary: [{ kind: "opinion", text: "x", evidence: "" }] }, facts).ok, false);
});

// ---------------- Phase 13: Drive ----------------
test("drive: creative folders created once, reused on re-run", async () => {
  const folders = new Map();
  let created = 0;
  const ops = {
    async findFolder(parent, key) { return folders.get(`${parent}/${key}`) ?? null; },
    async createFolder(name, parent, key) { created++; const id = `id_${key}_xxxxxx`; folders.set(`${parent}/${key}`, id); return id; },
    async getFolder() { return null; },
  };
  const a = await ensureCreativeFolders(ops, "clientFolder");
  const b = await ensureCreativeFolders(ops, "clientFolder");
  assert.equal(created, 3);
  assert.deepEqual(a, b);
});

test("drive: SSRF allowlist + safe filenames", () => {
  assert.ok(isAllowedCreativeSource("https://v3.fal.media/files/abc/x.jpg"));
  assert.ok(isAllowedCreativeSource("https://fal.media/files/x.mp4"));
  for (const bad of ["http://fal.media/x", "https://fal.media.evil.com/x", "https://evil.com/fal.media", "https://user:pw@fal.media/x", "https://fal.media:8443/x", "https://169.254.169.254/latest", "file:///etc/passwd", "not a url"]) {
    assert.ok(!isAllowedCreativeSource(bad), bad);
  }
  const name = creativeFileName({ clientName: 'A/B:C*"?', productName: "Wallet<>|", creativeType: "lifestyle", format: "9:16", creativeId: "abcdef12-3456", mimeType: "video/mp4" });
  assert.ok(!/[\\/:*?"<>|]/.test(name.replace(".mp4", "")), name);
  assert.ok(name.endsWith(".mp4"));
});

// ---------------- Phase 14: agent ----------------
const noOpts = { allowPaidGeneration: false, allowDriveUpload: false };
test("agent policy: allowlist has no unsafe tools; permissions enforced", () => {
  for (const forbidden of ["execute_sql", "http_request", "run_shell", "publish_campaign", "delete_client"]) assert.ok(!AGENT_TOOL_NAMES.includes(forbidden));
  assert.ok(!AGENT_TOOL_NAMES.some((n) => /publish|delete|sql|http|shell/.test(n)));
  assert.match(authorizeTool("execute_sql", "admin", [], noOpts), /Unknown tool/);
  assert.match(authorizeTool("upload_creative_to_drive", "sub_admin", ["content", "ai_ads"], { ...noOpts, allowDriveUpload: true }), /super-admin only/);
  assert.match(authorizeTool("upload_creative_to_drive", "admin", [], noOpts), /disabled/);
  assert.equal(authorizeTool("upload_creative_to_drive", "admin", [], { ...noOpts, allowDriveUpload: true }), null);
  assert.match(authorizeTool("get_campaigns", "sub_admin", ["ai_ads"], noOpts), /campaigns/);
  assert.match(authorizeTool("generate_creative", "admin", [], noOpts), /disabled/);
  const subTools = toolsFor("sub_admin", ["ai_ads", "content"], noOpts).map((t) => t.name);
  assert.ok(subTools.includes("get_creatives") && !subTools.includes("get_campaigns") && !subTools.includes("get_analytics") && !subTools.includes("generate_creative"));
  assert.ok(!redactForLog({ key: "sk-ant-api03-SECRETSECRET" }).includes("SECRETSECRET"));
});

function fakeModel(script) {
  let i = 0;
  const calls = [];
  const fn = async (req) => {
    calls.push(req);
    const step = typeof script === "function" ? script(i) : script[Math.min(i, script.length - 1)];
    i++;
    return { model: "claude-opus-5", usage: { input_tokens: 10, output_tokens: 5 }, ...step };
  };
  fn.calls = calls;
  return fn;
}
const toolUse = (name, input = {}, id = "t1") => ({ stop_reason: "tool_use", content: [{ type: "tool_use", id, name, input }] });
const endTurn = (text) => ({ stop_reason: "end_turn", content: [{ type: "text", text }] });

test("agent loop: runs allowed tools, returns final answer, logs calls", async () => {
  const executed = [];
  const out = await runAgentLoop({
    request: "Plan something",
    role: "sub_admin",
    permissions: ["ai_ads"],
    options: noOpts,
    callModel: fakeModel([toolUse("get_products"), endTurn("Done: draft ready for approval.")]),
    executeTool: async (name) => (executed.push(name), [{ id: P1, name: "Wallet" }]),
  });
  assert.equal(out.status, "succeeded");
  assert.equal(out.result, "Done: draft ready for approval.");
  assert.deepEqual(executed, ["get_products"]);
  assert.equal(out.toolCalls[0].status, "ok");
  assert.equal(out.inputTokens, 20);
});

test("agent loop: denied/unknown tools never execute", async () => {
  const executed = [];
  const out = await runAgentLoop({
    request: "x",
    role: "sub_admin",
    permissions: ["ai_ads"],
    options: { allowPaidGeneration: true, allowDriveUpload: true },
    callModel: fakeModel([toolUse("upload_creative_to_drive", { creative_id: P1 }), toolUse("execute_sql", { q: "drop table" }), toolUse("get_campaigns"), endTurn("ok")]),
    executeTool: async (name) => (executed.push(name), {}),
  });
  assert.deepEqual(executed, []);
  assert.deepEqual(out.toolCalls.map((c) => c.status), ["denied", "denied", "denied"]);
});

test("agent loop: infinite tool loop is capped", async () => {
  let n = 0;
  const out = await runAgentLoop({
    request: "loop",
    role: "admin",
    permissions: [],
    options: noOpts,
    callModel: fakeModel(() => toolUse("get_client", {}, `t${n++}`)),
    executeTool: async () => ({}),
  });
  assert.equal(out.status, "stopped");
  assert.ok(out.turns <= AGENT_LIMITS.maxTurns);
  assert.ok(out.toolCalls.filter((c) => c.status === "ok").length <= AGENT_LIMITS.maxToolCalls);
});

test("agent loop: read tools retried once, paid/write never; paid budget enforced", async () => {
  const attempts = {};
  const out = await runAgentLoop({
    request: "x",
    role: "admin",
    permissions: [],
    options: noOpts,
    callModel: fakeModel([
      { stop_reason: "tool_use", content: [{ type: "tool_use", id: "a", name: "get_products", input: {} }, { type: "tool_use", id: "b", name: "generate_creative_brief", input: {} }] },
      endTurn("end"),
    ]),
    executeTool: async (name) => {
      attempts[name] = (attempts[name] ?? 0) + 1;
      throw new Error("transient");
    },
    sleep: async () => {},
  });
  assert.equal(attempts.get_products, 2);
  assert.equal(attempts.generate_creative_brief, 1);
  assert.equal(out.toolCalls.every((c) => c.status === "error"), true);

  let paid = 0;
  const many = { stop_reason: "tool_use", content: Array.from({ length: 6 }, (_, i) => ({ type: "tool_use", id: `p${i}`, name: "generate_creative_brief", input: {} })) };
  const out2 = await runAgentLoop({ request: "x", role: "admin", permissions: [], options: noOpts, callModel: fakeModel([many, endTurn("e")]), executeTool: async () => (paid++, {}) });
  assert.equal(paid, AGENT_LIMITS.maxPaidToolCalls);
  assert.equal(out2.toolCalls.filter((c) => c.status === "skipped").length, 6 - AGENT_LIMITS.maxPaidToolCalls);
});

test("agent loop: validation errors (ToolError) not retried; time limit; refusal; rate limit stop", async () => {
  let calls = 0;
  await runAgentLoop({ request: "x", role: "admin", permissions: [], options: noOpts, callModel: fakeModel([toolUse("get_products"), endTurn("e")]), executeTool: async () => { calls++; throw new ToolError("bad input"); } });
  assert.equal(calls, 1);

  let t = 0;
  const slow = await runAgentLoop({ request: "x", role: "admin", permissions: [], options: noOpts, now: () => (t += 100_000), callModel: fakeModel(() => toolUse("get_client")), executeTool: async () => ({}) });
  assert.equal(slow.status, "stopped");
  assert.match(slow.error, /Time limit/);

  const refused = await runAgentLoop({ request: "x", role: "admin", permissions: [], options: noOpts, callModel: fakeModel([{ stop_reason: "refusal", content: [] }]), executeTool: async () => ({}) });
  assert.equal(refused.status, "failed");

  const limited = await runAgentLoop({ request: "x", role: "admin", permissions: [], options: noOpts, beforeTurn: async () => { throw new Error("AI usage limit reached"); }, callModel: fakeModel([endTurn("never")]), executeTool: async () => ({}) });
  assert.equal(limited.status, "stopped");
  assert.equal(limited.turns, 0);
});

// ---------------- Phase 15 ----------------
test("observability redaction + id validation", () => {
  const text = redactSecrets("key sk-ant-api03-abc_DEF-123 token EAABsbCS1iHgBAKZCZ1234567890abcdef Bearer abcdefghijklmnop access_token=xyz123 ya29.a0AfH6SM");
  for (const s of ["sk-ant-api03", "EAABsbCS1iHg", "abcdefghijklmnop", "xyz123", "ya29.a0"]) assert.ok(!text.includes(s), s);
  assert.ok(isUuid(P1));
  for (const bad of ["", "1", "../etc", `${P1}' or '1'='1`, null, 5]) assert.ok(!isUuid(bad));
});
