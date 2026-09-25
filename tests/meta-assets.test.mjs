import test from "node:test";
import assert from "node:assert/strict";
import { validateAssignment, pickAssigned, hasUsableMetaAssets, EMPTY_ASSIGNMENTS } from "@/lib/meta/asset-assignment";

const BM_A = "111";
const BM_B = "222";
const pool = {
  businesses: [
    { business_id: BM_A, name: "Alliant Energy Corporation SSS", is_active: true },
    { business_id: BM_B, name: "Other BM", is_active: true },
    { business_id: "333", name: "Gone BM", is_active: false },
  ],
  adAccounts: [
    { business_id: BM_A, id: "act_1", name: "Vertex Bangladesh", is_active: true },
    { business_id: BM_A, id: "act_2", name: "Formal Men Backup", is_active: true },
    { business_id: BM_A, id: "act_3", name: "Formal Men USA", is_active: true },
    { business_id: BM_A, id: "act_4", name: "Old account", is_active: false },
    { business_id: BM_B, id: "act_9", name: "Other BM account", is_active: true },
  ],
  pages: [
    { business_id: BM_A, id: "501", name: "Formal Men BD", is_active: true },
    { business_id: BM_A, id: "502", name: "Tap Zio", is_active: true },
    { business_id: BM_B, id: "509", name: "Other page", is_active: true },
  ],
  instagramAccounts: [],
};
const sel = (o) => ({ businessId: BM_A, adAccountIds: [], pageIds: [], instagramAccountIds: [], ...o });

test("assignment: only pool assets of the selected Business Manager are accepted", () => {
  const ok = validateAssignment(sel({ adAccountIds: ["act_2", "act_3", "act_2"], pageIds: ["501"] }), pool);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.adAccountIds, ["act_2", "act_3"], "deduplicated");
  assert.deepEqual(ok.pageIds, ["501"]);

  assert.match(validateAssignment(sel({ adAccountIds: ["act_9"] }), pool).error, /does not belong/, "ad account from another BM");
  assert.match(validateAssignment(sel({ pageIds: ["509"] }), pool).error, /does not belong/, "page from another BM");
  assert.match(validateAssignment(sel({ adAccountIds: ["act_12345"] }), pool).error, /does not belong/, "arbitrary ID not in pool");
  assert.match(validateAssignment(sel({ adAccountIds: ["12345"] }), pool).error, /Invalid/, "malformed ID");
  assert.match(validateAssignment(sel({ businessId: "999" }), pool).error, /not in the Meta asset pool/);
  assert.match(validateAssignment(sel({ businessId: "abc" }), pool).error, /Select a Business Manager/);
  assert.match(validateAssignment(sel({ businessId: "333" }), pool).error, /no longer available/);
  assert.match(validateAssignment(sel({ adAccountIds: ["act_4"] }), pool).error, /no longer available/, "new inactive asset");
  const keep = validateAssignment(sel({ adAccountIds: ["act_4"] }), pool, {
    ...EMPTY_ASSIGNMENTS,
    businesses: [{ business_id: BM_A, name: "x" }],
    adAccounts: [{ business_id: BM_A, id: "act_4", name: "Old account" }],
  });
  assert.equal(keep.ok, true, "an already-assigned asset that went inactive can be kept");
});

test("assignment: campaign/audience selection uses only assigned assets", () => {
  const assigned = [
    { business_id: BM_A, id: "act_2", name: "Formal Men Backup" },
    { business_id: BM_A, id: "act_3", name: "Formal Men USA" },
  ];
  assert.equal(pickAssigned(assigned, "act_3"), "act_3");
  assert.equal(pickAssigned(assigned, "act_1"), null, "unassigned request rejected");
  assert.equal(pickAssigned(assigned, null), null, "several assigned -> user must choose");
  assert.equal(pickAssigned([assigned[0]], null), "act_2", "single assigned -> preselected");
  assert.equal(pickAssigned([], null), null);
  assert.equal(hasUsableMetaAssets(EMPTY_ASSIGNMENTS), false);
  assert.equal(hasUsableMetaAssets({ ...EMPTY_ASSIGNMENTS, adAccounts: assigned, pages: [{ business_id: BM_A, id: "501", name: "p" }] }), true);
});

test("Meta publishing stays disabled unless explicitly enabled", async () => {
  const saved = process.env.META_PUBLISHING_ENABLED;
  delete process.env.META_PUBLISHING_ENABLED;
  const { publishBlockers } = await import("@/lib/meta/ads-payloads");
  const blockers = publishBlockers({
    campaign: { name: "x", objective: "OUTCOME_TRAFFIC", status: "approved", daily_budget: 10, meta_ad_account_id: "act_2", meta_page_id: "501", meta_instagram_account_id: null, meta_campaign_id: null, strategy: {} },
    productUrl: "https://x.test",
    creatives: [],
    metaConnected: true,
    publishingEnabled: process.env.META_PUBLISHING_ENABLED === "true",
  });
  assert.ok(blockers.some((b) => /META_PUBLISHING_ENABLED/.test(b)));
  if (saved !== undefined) process.env.META_PUBLISHING_ENABLED = saved;
});
