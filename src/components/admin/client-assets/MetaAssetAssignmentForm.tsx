"use client";

import { useActionState, useState } from "react";
import {
  addClientBusinessManager,
  addClientMetaAssets,
  type MetaAssetActionState,
} from "@/lib/actions/client-meta-assets";
import type { AssignedAsset, ClientMetaAssignments, MetaAssetPool, MetaPoolKind, PoolAsset } from "@/lib/meta/asset-assignment";
import { ActionButton } from "@/components/admin/ActionButton";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

const initialState: MetaAssetActionState = { status: "idle" };

// One asset type for the selected Business Manager: assigned assets are shown checked,
// active unassigned ones can be selected and added. Adding never changes existing assignments.
function AddAssetsForm({
  clientId,
  kind,
  businessId,
  label,
  addLabel,
  pool,
  assigned,
  format = (a) => a.name,
}: {
  clientId: string;
  kind: MetaPoolKind;
  businessId: string;
  label: string;
  addLabel: string;
  pool: PoolAsset[];
  assigned: AssignedAsset[];
  format?: (a: { name: string }) => string;
}) {
  const [state, formAction, pending] = useActionState(addClientMetaAssets.bind(null, clientId, kind), initialState);
  const [selected, setSelected] = useState<string[]>([]);
  const assignedIds = new Set(assigned.map((a) => a.id));
  const assignedHere = pool.filter((a) => a.business_id === businessId && assignedIds.has(a.id));
  const available = pool.filter((a) => a.business_id === businessId && a.is_active && !assignedIds.has(a.id));
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <form action={formAction}>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-slate-700">{label}</legend>
        <input type="hidden" name="business_id" value={businessId} />
        {assignedHere.length === 0 && available.length === 0 ? (
          <p className="text-xs text-slate-400">None in this Business Manager.</p>
        ) : (
          <div className="space-y-1">
            {assignedHere.map((o) => (
              <label key={o.id} className="flex items-center gap-2 text-sm text-slate-500">
                <input type="checkbox" checked disabled />
                <span>
                  {format(o)} <span className="text-xs text-slate-400">(assigned)</span>
                </span>
              </label>
            ))}
            {available.map((o) => (
              <label key={o.id} className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" name="asset_ids" value={o.id} checked={selected.includes(o.id)} onChange={() => toggle(o.id)} />
                <span>{format(o)}</span>
              </label>
            ))}
          </div>
        )}
      </fieldset>
      {available.length > 0 && (
        <Button type="submit" size="sm" className="mt-3" disabled={pending || selected.length === 0}>
          {pending ? "Adding..." : addLabel}
        </Button>
      )}
      {!pending && state.message && (
        <p className={state.status === "error" ? "mt-1 text-xs text-red-600" : "mt-1 text-xs text-emerald-600"}>{state.message}</p>
      )}
    </form>
  );
}

// Super Admin: choose a Business Manager from the central pool, then add its assets to the
// client. Only pool assets are selectable; the server re-validates everything.
export function MetaAssetAssignmentForm({
  clientId,
  pool,
  assignments,
}: {
  clientId: string;
  pool: MetaAssetPool;
  assignments: ClientMetaAssignments;
}) {
  const businesses = pool.businesses.filter((b) => b.is_active);
  const [businessId, setBusinessId] = useState(assignments.businesses[0]?.business_id ?? businesses[0]?.business_id ?? "");
  const bmAssigned = assignments.businesses.some((b) => b.business_id === businessId);
  // Remount the per-type forms when the BM or the assignments change (clears selections after an add).
  const formKey = `${businessId}:${assignments.adAccounts.length}:${assignments.pages.length}:${assignments.instagramAccounts.length}`;

  return (
    <div className="space-y-4 border-t border-slate-100 pt-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="sm:w-80">
          <Label htmlFor="business_id">Business Manager</Label>
          <Select id="business_id" value={businessId} onChange={(e) => setBusinessId(e.target.value)}>
            {businesses.map((b) => (
              <option key={b.business_id} value={b.business_id}>
                {b.name}
                {assignments.businesses.some((a) => a.business_id === b.business_id) ? " (assigned)" : ""}
              </option>
            ))}
          </Select>
        </div>
        {businessId && !bmAssigned && (
          <ActionButton
            action={addClientBusinessManager.bind(null, clientId, businessId)}
            label="Assign Business Manager"
            pendingLabel="Assigning..."
          />
        )}
      </div>
      {businessId && (
        <div key={formKey} className="grid gap-4 md:grid-cols-3">
          <AddAssetsForm
            clientId={clientId}
            kind="adAccounts"
            businessId={businessId}
            label="Ad Accounts"
            addLabel="Add Ad Accounts"
            pool={pool.adAccounts}
            assigned={assignments.adAccounts}
          />
          <AddAssetsForm
            clientId={clientId}
            kind="pages"
            businessId={businessId}
            label="Facebook Pages"
            addLabel="Add Pages"
            pool={pool.pages}
            assigned={assignments.pages}
          />
          <AddAssetsForm
            clientId={clientId}
            kind="instagramAccounts"
            businessId={businessId}
            label="Instagram Accounts"
            addLabel="Add Instagram"
            pool={pool.instagramAccounts}
            assigned={assignments.instagramAccounts}
            format={(a) => `@${a.name}`}
          />
        </div>
      )}
    </div>
  );
}
