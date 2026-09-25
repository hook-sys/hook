"use client";

import { useActionState } from "react";
import { assignClientMetaAssets, type MetaAssetActionState } from "@/lib/actions/client-meta-assets";
import type { MetaAssetSummary, MetaNamedAsset } from "@/lib/integrations/meta-assets";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

const initialState: MetaAssetActionState = { status: "idle" };

function AssetSelect({
  id,
  label,
  options,
  current,
  failed,
  format,
}: {
  id: string;
  label: string;
  options: MetaNamedAsset[];
  current: MetaNamedAsset | null;
  failed: boolean;
  format: (asset: MetaNamedAsset) => string;
}) {
  // Keep a no-longer-available assignment visible so the admin sees it and must change it.
  const currentMissing = current && !options.some((o) => o.id === current.id);

  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Select id={id} name={id} defaultValue={current?.id ?? ""} disabled={failed && !current}>
        <option value="">— None —</option>
        {currentMissing && <option value={current.id}>{format(current)} (unavailable)</option>}
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {format(o)}
          </option>
        ))}
      </Select>
      {failed ? (
        <p className="mt-1 text-xs text-amber-700">Could not load {label.toLowerCase()}s from Meta.</p>
      ) : (
        options.length === 0 && <p className="mt-1 text-xs text-slate-400">None available in the Business Manager.</p>
      )}
    </div>
  );
}

export function MetaAssetAssignmentForm({
  clientId,
  available,
  current,
}: {
  clientId: string;
  available: MetaAssetSummary;
  current: { adAccount: MetaNamedAsset | null; facebookPage: MetaNamedAsset | null; instagramAccount: MetaNamedAsset | null };
}) {
  const [state, formAction, pending] = useActionState(assignClientMetaAssets.bind(null, clientId), initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <AssetSelect
          id="ad_account_id"
          label="Ad Account"
          options={available.adAccounts}
          current={current.adAccount}
          failed={available.failed.adAccounts}
          format={(a) => `${a.name} (${a.id.replace(/^act_/, "")})`}
        />
        <AssetSelect
          id="facebook_page_id"
          label="Facebook Page"
          options={available.pages}
          current={current.facebookPage}
          failed={available.failed.pages}
          format={(a) => a.name}
        />
        <AssetSelect
          id="instagram_account_id"
          label="Instagram Account"
          options={available.instagramAccounts}
          current={current.instagramAccount}
          failed={available.failed.instagramAccounts}
          format={(a) => `@${a.name}`}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving..." : "Save Meta Assets"}
        </Button>
        {!pending && state.message && (
          <p className={state.status === "error" ? "text-sm text-red-600" : "text-sm text-emerald-600"}>
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
