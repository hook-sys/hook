// Pure: central Meta asset pool + per-client assignment model (see migration 0016).
// Assignment input from the browser is never trusted: every ID must exist in the pool
// under the selected Business Manager.

export type MetaPoolKind = "adAccounts" | "pages" | "instagramAccounts";

export interface PoolBusiness {
  business_id: string;
  name: string;
  is_active: boolean;
}

export interface PoolAsset {
  business_id: string;
  id: string;
  name: string;
  is_active: boolean;
}

export interface MetaAssetPool {
  businesses: PoolBusiness[];
  adAccounts: PoolAsset[];
  pages: PoolAsset[];
  instagramAccounts: PoolAsset[];
}

export interface AssignedAsset {
  business_id: string;
  id: string;
  name: string;
}

export interface ClientMetaAssignments {
  businesses: { business_id: string; name: string }[];
  adAccounts: AssignedAsset[];
  pages: AssignedAsset[];
  instagramAccounts: AssignedAsset[];
}

export const EMPTY_ASSIGNMENTS: ClientMetaAssignments = { businesses: [], adAccounts: [], pages: [], instagramAccounts: [] };

export const POOL_KIND_LABEL: Record<MetaPoolKind, string> = {
  adAccounts: "Ad Account",
  pages: "Facebook Page",
  instagramAccounts: "Instagram Account",
};

const ID_FORMAT: Record<MetaPoolKind | "business", RegExp> = {
  business: /^\d+$/,
  adAccounts: /^act_\d+$/,
  pages: /^\d+$/,
  instagramAccounts: /^\d+$/,
};

export function isMetaId(kind: MetaPoolKind | "business", value: string): boolean {
  return ID_FORMAT[kind].test(value);
}

export interface AdditionRequest {
  kind: MetaPoolKind;
  businessId: string;
  assetIds: string[];
}

export type AdditionResult =
  | { ok: true; businessId: string; toAdd: string[]; alreadyAssigned: string[] }
  | { ok: false; error: string };

// Validates adding assets of ONE type to a client. Browser input is never trusted: the
// Business Manager must be an active pool BM, and every asset must be an ACTIVE pool asset
// belonging to that BM. Assets the client already has are skipped (no duplicates); existing
// assignments are never changed by an addition.
export function validateAddition(
  request: AdditionRequest,
  pool: MetaAssetPool,
  currentlyAssigned: ClientMetaAssignments = EMPTY_ASSIGNMENTS
): AdditionResult {
  const { kind } = request;
  const label = POOL_KIND_LABEL[kind];
  const businessId = request.businessId.trim();
  if (!isMetaId("business", businessId)) return { ok: false, error: "Select a Business Manager." };
  const business = pool.businesses.find((b) => b.business_id === businessId);
  if (!business) return { ok: false, error: "That Business Manager is not in the Meta asset pool." };
  if (!business.is_active) return { ok: false, error: "That Business Manager is no longer available in the Meta connection." };

  const ids = [...new Set(request.assetIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return { ok: false, error: `Select at least one ${label}.` };
  if (ids.length > 50) return { ok: false, error: `Select at most 50 ${label}s at a time.` };

  for (const id of ids) {
    if (!isMetaId(kind, id)) return { ok: false, error: `Invalid ${label} ID.` };
    const asset = pool[kind].find((a) => a.id === id && a.business_id === businessId);
    if (!asset) return { ok: false, error: `A selected ${label} does not belong to this Business Manager.` };
    if (!asset.is_active) return { ok: false, error: `"${asset.name}" is no longer available in the Meta connection.` };
  }

  const assignedIds = new Set(currentlyAssigned[kind].map((a) => a.id));
  const toAdd = ids.filter((id) => !assignedIds.has(id));
  const alreadyAssigned = ids.filter((id) => assignedIds.has(id));
  if (toAdd.length === 0) return { ok: false, error: `The selected ${label}s are already assigned to this client.` };
  return { ok: true, businessId, toAdd, alreadyAssigned };
}

// Resolves which assigned asset to use: the requested one if it is assigned; otherwise the
// only assigned one (auto-preselect); otherwise none (the user must choose).
export function pickAssigned(assigned: AssignedAsset[], requested: string | null | undefined): string | null {
  if (requested) return assigned.some((a) => a.id === requested) ? requested : null;
  return assigned.length === 1 ? assigned[0].id : null;
}

export function hasUsableMetaAssets(a: ClientMetaAssignments): boolean {
  return a.adAccounts.length > 0 && a.pages.length > 0;
}
