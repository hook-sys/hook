// Pure, dependency-free Meta asset types and validation (unit-testable without Meta).

export interface MetaNamedAsset {
  id: string;
  name: string;
}

export type MetaAssetKind = "adAccounts" | "pages" | "instagramAccounts";

// Assets visible to the connected Business Manager. `failed` marks asset types that
// could not be loaded (e.g. missing permission) — those can't be validated, so they
// can't be assigned either.
export interface MetaAssetSummary {
  adAccounts: MetaNamedAsset[];
  pages: MetaNamedAsset[];
  instagramAccounts: MetaNamedAsset[];
  failed: Record<MetaAssetKind, boolean>;
  errors: string[];
}

export interface MetaAssetSelection {
  adAccountId: string | null;
  facebookPageId: string | null;
  instagramAccountId: string | null;
}

export interface ResolvedMetaAssets {
  adAccount: MetaNamedAsset | null;
  facebookPage: MetaNamedAsset | null;
  instagramAccount: MetaNamedAsset | null;
}

const ID_FORMAT: Record<MetaAssetKind, RegExp> = {
  adAccounts: /^act_\d+$/,
  pages: /^\d+$/,
  instagramAccounts: /^\d+$/,
};

export const META_ASSET_LABEL: Record<MetaAssetKind, string> = {
  adAccounts: "Ad Account",
  pages: "Facebook Page",
  instagramAccounts: "Instagram Account",
};

type Pick = { ok: true; asset: MetaNamedAsset | null } | { ok: false; error: string };

function pickAsset(kind: MetaAssetKind, id: string | null, available: MetaAssetSummary): Pick {
  if (!id) return { ok: true, asset: null };
  const label = META_ASSET_LABEL[kind];
  if (!ID_FORMAT[kind].test(id)) return { ok: false, error: `Invalid ${label} ID.` };
  if (available.failed[kind]) {
    return { ok: false, error: `Could not verify the ${label} with Meta right now. Try again later.` };
  }
  const asset = available[kind].find((a) => a.id === id);
  if (!asset) {
    return { ok: false, error: `The selected ${label} is not available in the connected Business Manager.` };
  }
  return { ok: true, asset };
}

// Accepts only IDs present in the live asset lists of the connected Business Manager.
// Names come from Meta, never from the submitted form.
export function resolveMetaAssetSelection(
  selection: MetaAssetSelection,
  available: MetaAssetSummary
): { ok: true; assets: ResolvedMetaAssets } | { ok: false; error: string } {
  const adAccount = pickAsset("adAccounts", selection.adAccountId, available);
  if (!adAccount.ok) return adAccount;
  const facebookPage = pickAsset("pages", selection.facebookPageId, available);
  if (!facebookPage.ok) return facebookPage;
  const instagramAccount = pickAsset("instagramAccounts", selection.instagramAccountId, available);
  if (!instagramAccount.ok) return instagramAccount;

  return {
    ok: true,
    assets: {
      adAccount: adAccount.asset,
      facebookPage: facebookPage.asset,
      instagramAccount: instagramAccount.asset,
    },
  };
}
