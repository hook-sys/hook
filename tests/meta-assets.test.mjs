import test from "node:test";
import assert from "node:assert/strict";
import { validateAddition, pickAssigned, hasUsableMetaAssets, EMPTY_ASSIGNMENTS } from "@/lib/meta/asset-assignment";

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
const add = (o) => ({ kind: "adAccounts", businessId: BM_A, assetIds: [], ...o });
// Client already has AU338 FM Moto (act_2) under BM A.
const current = {
  ...EMPTY_ASSIGNMENTS,
  businesses: [{ business_id: BM_A, name: "Alliant Energy Corporation SSS" }],
  adAccounts: [{ business_id: BM_A, id: "act_2", name: "Formal Men Backup" }],
};

test("add: one and multiple ad accounts from the selected Business Manager", () => {
  const one = validateAddition(add({ assetIds: ["act_1"] }), pool, current);
  assert.equal(one.ok, true);
  assert.deepEqual(one.toAdd, ["act_1"]);
  const many = validateAddition(add({ assetIds: ["act_1", "act_3", "act_1"] }), pool, current);
  assert.deepEqual(many.toAdd, ["act_1", "act_3"], "deduplicated; existing assignment untouched");
  const pages = validateAddition({ kind: "pages", businessId: BM_A, assetIds: ["501", "502"] }, pool, current);
  assert.deepEqual(pages.toAdd, ["501", "502"]);
});

test("add: duplicates skipped, all-duplicate rejected", () => {
  const mixed = validateAddition(add({ assetIds: ["act_2", "act_3"] }), pool, current);
  assert.deepEqual(mixed.toAdd, ["act_3"]);
  assert.deepEqual(mixed.alreadyAssigned, ["act_2"]);
  assert.match(validateAddition(add({ assetIds: ["act_2"] }), pool, current).error, /already assigned/);
});

test("add: other BM, inactive, unknown, malformed and empty selections rejected", () => {
  assert.match(validateAddition(add({ assetIds: ["act_9"] }), pool, current).error, /does not belong/, "ad account from another BM");
  assert.match(validateAddition({ kind: "pages", businessId: BM_A, assetIds: ["509"] }, pool, current).error, /does not belong/, "page from another BM");
  assert.match(validateAddition(add({ assetIds: ["act_4"] }), pool, current).error, /no longer available/, "inactive account");
  assert.match(validateAddition(add({ assetIds: ["act_12345"] }), pool, current).error, /does not belong/, "arbitrary ID not in pool");
  assert.match(validateAddition(add({ assetIds: ["12345"] }), pool, current).error, /Invalid/, "malformed ID");
  assert.match(validateAddition(add({ assetIds: [] }), pool, current).error, /Select at least one/);
  assert.match(validateAddition(add({ businessId: "999", assetIds: ["act_1"] }), pool, current).error, /not in the Meta asset pool/);
  assert.match(validateAddition(add({ businessId: "333", assetIds: ["act_1"] }), pool, current).error, /no longer available/, "inactive BM");
  assert.match(validateAddition(add({ businessId: "abc", assetIds: ["act_1"] }), pool, current).error, /Select a Business Manager/);
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
