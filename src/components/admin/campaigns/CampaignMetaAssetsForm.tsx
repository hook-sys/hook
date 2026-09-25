"use client";

import { useActionState } from "react";
import type { CampaignActionState } from "@/lib/actions/campaigns";
import type { ClientMetaAssignments } from "@/lib/meta/asset-assignment";
import { Button } from "@/components/ui/button";
import { CampaignMetaAssetFields } from "@/components/admin/campaigns/CampaignMetaAssetFields";

type Action = (prev: CampaignActionState, formData: FormData) => Promise<CampaignActionState>;

export function CampaignMetaAssetsForm({
  action,
  assignments,
  initial,
}: {
  action: Action;
  assignments: ClientMetaAssignments;
  initial: { adAccountId: string | null; pageId: string | null; instagramAccountId: string | null };
}) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" });
  return (
    <form action={formAction} className="space-y-3">
      <CampaignMetaAssetFields assignments={assignments} initial={initial} />
      {assignments.businesses.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" variant="secondary" disabled={pending}>
            {pending ? "Saving..." : "Save Meta Assets"}
          </Button>
          {state.message && (
            <p className={state.status === "error" ? "text-xs text-red-600" : "text-xs text-emerald-600"}>{state.message}</p>
          )}
        </div>
      )}
    </form>
  );
}
