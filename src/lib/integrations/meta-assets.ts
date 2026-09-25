// Pure, dependency-free types for assets read from the Meta Graph API. Client assignment
// validation lives in lib/meta/asset-assignment.ts (central pool model, migration 0016).

export interface MetaNamedAsset {
  id: string;
  name: string;
  // owned by the Business Manager, or shared with it as a client asset
  relationship?: "owned" | "client";
}

export type MetaAssetKind = "adAccounts" | "pages" | "instagramAccounts";

// Assets visible to one Business Manager. `failed` marks asset types that could not be
// loaded (e.g. missing permission) — those are not synced, so they're never deactivated.
export interface MetaAssetSummary {
  adAccounts: MetaNamedAsset[];
  pages: MetaNamedAsset[];
  instagramAccounts: MetaNamedAsset[];
  failed: Record<MetaAssetKind, boolean>;
  errors: string[];
}

export const META_ASSET_LABEL: Record<MetaAssetKind, string> = {
  adAccounts: "Ad Account",
  pages: "Facebook Page",
  instagramAccounts: "Instagram Account",
};
