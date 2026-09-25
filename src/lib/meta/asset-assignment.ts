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

export interface AssignmentSelection {
  businessId: string;
  adAccountIds: string[];
  pageIds: string[];
  instagramAccountIds: string[];
}

export type AssignmentResult =
  | { ok: true; businessId: string; adAccountIds: string[]; pageIds: string[]; instagramAccountIds: string[] }
  | { ok: false; error: string };

// Validates a Super Admin's selection against the pool rows of the chosen Business Manager.
// Already-assigned assets that have since become inactive in Meta may be kept, but new
// inactive assets cannot be added.
export function validateAssignment(
  selection: AssignmentSelection,
  pool: MetaAssetPool,
  currentlyAssigned: ClientMetaAssignments = EMPTY_ASSIGNMENTS
): AssignmentResult {
  const businessId = selection.businessId.trim();
  if (!isMetaId("business", businessId)) return { ok: false, error: "Select a Business Manager." };
  const business = pool.businesses.find((b) => b.business_id === businessId);
  if (!business) return { ok: false, error: "That Business Manager is not in the Meta asset pool." };
  const businessAssigned = currentlyAssigned.businesses.some((b) => b.business_id === businessId);
  if (!business.is_active && !businessAssigned) {
    return { ok: false, error: "That Business Manager is no longer available in the Meta connection." };
  }

  const check = (kind: MetaPoolKind, ids: string[]): string[] | { error: string } => {
    const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
    if (unique.length > 50) return { error: `Select at most 50 ${POOL_KIND_LABEL[kind]}s.` };
    for (const id of unique) {
      if (!isMetaId(kind, id)) return { error: `Invalid ${POOL_KIND_LABEL[kind]} ID.` };
      const asset = pool[kind].find((a) => a.id === id && a.business_id === businessId);
      if (!asset) return { error: `A selected ${POOL_KIND_LABEL[kind]} does not belong to this Business Manager.` };
      const wasAssigned = currentlyAssigned[kind].some((a) => a.id === id);
      if (!asset.is_active && !wasAssigned) return { error: `"${asset.name}" is no longer available in the Meta connection.` };
    }
    return unique;
  };

  const adAccountIds = check("adAccounts", selection.adAccountIds);
  if (!Array.isArray(adAccountIds)) return { ok: false, error: adAccountIds.error };
  const pageIds = check("pages", selection.pageIds);
  if (!Array.isArray(pageIds)) return { ok: false, error: pageIds.error };
  const instagramAccountIds = check("instagramAccounts", selection.instagramAccountIds);
  if (!Array.isArray(instagramAccountIds)) return { ok: false, error: instagramAccountIds.error };

  return { ok: true, businessId, adAccountIds, pageIds, instagramAccountIds };
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
