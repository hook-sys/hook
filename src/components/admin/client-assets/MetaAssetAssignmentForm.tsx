"use client";

import { useActionState, useState } from "react";
import { assignClientMetaAssets, type MetaAssetActionState } from "@/lib/actions/client-meta-assets";
import type { ClientMetaAssignments, MetaAssetPool, PoolAsset } from "@/lib/meta/asset-assignment";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

const initialState: MetaAssetActionState = { status: "idle" };

function AssetChecklist({
  name,
  label,
  options,
  checked,
  onToggle,
  format = (a) => a.name,
}: {
  name: string;
  label: string;
  options: PoolAsset[];
  checked: string[];
  onToggle: (id: string) => void;
  format?: (a: PoolAsset) => string;
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-slate-700">{label}</legend>
      {options.length === 0 ? (
        <p className="text-xs text-slate-400">None in this Business Manager.</p>
      ) : (
        <div className="space-y-1">
          {options.map((o) => (
            <label key={o.id} className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name={name} value={o.id} checked={checked.includes(o.id)} onChange={() => onToggle(o.id)} />
              <span>
                {format(o)}
                {!o.is_active && <span className="text-xs text-amber-700"> (no longer in Meta)</span>}
              </span>
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}

// Super Admin: pick a Business Manager from the central pool, then which of ITS assets this
// client may use. Only pool assets are selectable; the server re-validates everything.
export function MetaAssetAssignmentForm({
  clientId,
  pool,
  assignments,
}: {
  clientId: string;
  pool: MetaAssetPool;
  assignments: ClientMetaAssignments;
}) {
  const [state, formAction, pending] = useActionState(assignClientMetaAssets.bind(null, clientId), initialState);
  const businesses = pool.businesses.filter((b) => b.is_active || assignments.businesses.some((a) => a.business_id === b.business_id));
  const [businessId, setBusinessId] = useState(assignments.businesses[0]?.business_id ?? businesses[0]?.business_id ?? "");

  // Assets of the selected BM: active ones, plus any still assigned to this client.
  const forBusiness = (list: PoolAsset[], assigned: { id: string }[]) =>
    list.filter((a) => a.business_id === businessId && (a.is_active || assigned.some((x) => x.id === a.id)));
  const assignedIn = (assigned: { business_id: string; id: string }[]) => assigned.filter((a) => a.business_id === businessId).map((a) => a.id);

  const [selected, setSelected] = useState(() => ({
    ad: assignedIn(assignments.adAccounts),
    page: assignedIn(assignments.pages),
    ig: assignedIn(assignments.instagramAccounts),
  }));
  const changeBusiness = (id: string) => {
    setBusinessId(id);
    const inBm = (assigned: { business_id: string; id: string }[]) => assigned.filter((a) => a.business_id === id).map((a) => a.id);
    setSelected({ ad: inBm(assignments.adAccounts), page: inBm(assignments.pages), ig: inBm(assignments.instagramAccounts) });
  };
  const toggle = (key: "ad" | "page" | "ig") => (id: string) =>
    setSelected((s) => ({ ...s, [key]: s[key].includes(id) ? s[key].filter((x) => x !== id) : [...s[key], id] }));

  return (
    <form action={formAction} className="space-y-4 border-t border-slate-100 pt-4">
      <div className="sm:w-80">
        <Label htmlFor="business_id">Business Manager</Label>
        <Select id="business_id" name="business_id" value={businessId} onChange={(e) => changeBusiness(e.target.value)}>
          {businesses.map((b) => (
            <option key={b.business_id} value={b.business_id}>
              {b.name}
              {assignments.businesses.some((a) => a.business_id === b.business_id) ? " (assigned)" : ""}
            </option>
          ))}
        </Select>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <AssetChecklist
          name="ad_account_ids"
          label="Ad Accounts"
          options={forBusiness(pool.adAccounts, assignments.adAccounts)}
          checked={selected.ad}
          onToggle={toggle("ad")}
        />
        <AssetChecklist
          name="page_ids"
          label="Facebook Pages"
          options={forBusiness(pool.pages, assignments.pages)}
          checked={selected.page}
          onToggle={toggle("page")}
        />
        <AssetChecklist
          name="instagram_account_ids"
          label="Instagram Accounts"
          options={forBusiness(pool.instagramAccounts, assignments.instagramAccounts)}
          checked={selected.ig}
          onToggle={toggle("ig")}
          format={(a) => `@${a.name}`}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={pending || !businessId}>
          {pending ? "Saving..." : "Assign"}
        </Button>
        {!pending && state.message && (
          <p className={state.status === "error" ? "text-sm text-red-600" : "text-sm text-emerald-600"}>{state.message}</p>
        )}
      </div>
    </form>
  );
}
