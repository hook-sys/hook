"use client";

import { useState } from "react";
import type { ClientMetaAssignments } from "@/lib/meta/asset-assignment";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

// Selectors limited to the Meta assets ASSIGNED to this client. Choosing a Business Manager
// filters the ad accounts / Pages / Instagram accounts; single options are preselected.
export function CampaignMetaAssetFields({
  assignments,
  initial,
  disabled = false,
}: {
  assignments: ClientMetaAssignments;
  initial?: { adAccountId: string | null; pageId: string | null; instagramAccountId: string | null };
  disabled?: boolean;
}) {
  const businessOf = (id: string | null | undefined) =>
    [...assignments.adAccounts, ...assignments.pages].find((a) => a.id === id)?.business_id;
  const [businessId, setBusinessId] = useState(
    businessOf(initial?.adAccountId) ?? businessOf(initial?.pageId) ?? assignments.businesses[0]?.business_id ?? ""
  );
  const only = <T extends { business_id: string }>(list: T[]) => list.filter((a) => a.business_id === businessId);
  const single = (list: { id: string }[]) => (list.length === 1 ? list[0].id : "");

  const ads = only(assignments.adAccounts);
  const pages = only(assignments.pages);
  const igs = only(assignments.instagramAccounts);
  const [adId, setAdId] = useState(initial?.adAccountId ?? single(ads));
  const [pageId, setPageId] = useState(initial?.pageId ?? single(pages));
  const [igId, setIgId] = useState(initial?.instagramAccountId ?? "");

  const changeBusiness = (id: string) => {
    setBusinessId(id);
    const f = <T extends { business_id: string; id: string }>(list: T[]) => list.filter((a) => a.business_id === id);
    setAdId(single(f(assignments.adAccounts)));
    setPageId(single(f(assignments.pages)));
    setIgId("");
  };

  if (assignments.businesses.length === 0) {
    return <p className="text-xs text-slate-500">No Meta assets are assigned to this client yet (a super admin assigns them).</p>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <Label htmlFor="meta_business_id">Business Manager</Label>
        <Select id="meta_business_id" value={businessId} onChange={(e) => changeBusiness(e.target.value)} disabled={disabled}>
          {assignments.businesses.map((b) => (
            <option key={b.business_id} value={b.business_id}>
              {b.name}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="meta_ad_account_id">Ad Account</Label>
        <Select id="meta_ad_account_id" name="meta_ad_account_id" value={adId} onChange={(e) => setAdId(e.target.value)} disabled={disabled}>
          <option value="">{ads.length ? "Select an ad account" : "None assigned in this Business Manager"}</option>
          {ads.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="meta_page_id">Facebook Page</Label>
        <Select id="meta_page_id" name="meta_page_id" value={pageId} onChange={(e) => setPageId(e.target.value)} disabled={disabled}>
          <option value="">{pages.length ? "Select a Page" : "None assigned in this Business Manager"}</option>
          {pages.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </div>
      {igs.length > 0 && (
        <div>
          <Label htmlFor="meta_instagram_account_id">Instagram (optional)</Label>
          <Select id="meta_instagram_account_id" name="meta_instagram_account_id" value={igId} onChange={(e) => setIgId(e.target.value)} disabled={disabled}>
            <option value="">None</option>
            {igs.map((a) => (
              <option key={a.id} value={a.id}>
                @{a.name}
              </option>
            ))}
          </Select>
        </div>
      )}
    </div>
  );
}
