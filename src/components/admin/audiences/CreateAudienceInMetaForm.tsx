"use client";

import { useActionState } from "react";
import type { AudienceActionState } from "@/lib/actions/audiences";
import type { AssignedAsset } from "@/lib/meta/asset-assignment";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

type Action = (prev: AudienceActionState, formData: FormData) => Promise<AudienceActionState>;

// "Create in Meta" for one audience. Selectors appear only when the client has more than one
// assigned option; a single assigned asset is used automatically (server re-validates).
export function CreateAudienceInMetaForm({
  action,
  adAccounts,
  pages,
  instagramAccounts,
  sourceKind,
  confirmMessage,
}: {
  action: Action;
  adAccounts: AssignedAsset[];
  pages: AssignedAsset[];
  instagramAccounts: AssignedAsset[];
  sourceKind: "pixel" | "page" | "instagram" | "none";
  confirmMessage: string;
}) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" });
  const selector = (name: string, label: string, options: AssignedAsset[], prefix = "") =>
    options.length > 1 ? (
      <Select name={name} aria-label={label} defaultValue="" className="h-8 w-auto text-xs">
        <option value="">{label}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {prefix}
            {o.name}
          </option>
        ))}
      </Select>
    ) : null;

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm(confirmMessage)) e.preventDefault();
      }}
      className="flex flex-wrap items-start gap-2"
    >
      {selector("ad_account_id", "Select ad account", adAccounts)}
      {sourceKind === "page" && selector("page_id", "Select Page", pages)}
      {sourceKind === "instagram" && selector("instagram_account_id", "Select Instagram", instagramAccounts, "@")}
      <Button type="submit" size="sm" variant="primary" disabled={pending}>
        {pending ? "Creating..." : "Create in Meta"}
      </Button>
      {!pending && state.message && (
        <p className={state.status === "error" ? "w-full text-xs text-red-600" : "w-full text-xs text-emerald-600"}>{state.message}</p>
      )}
    </form>
  );
}
