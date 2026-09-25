"use client";

import { useActionState, useState } from "react";
import type { CampaignActionState } from "@/lib/actions/campaigns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Action = (prev: CampaignActionState, formData: FormData) => Promise<CampaignActionState>;

const initialState: CampaignActionState = { status: "idle" };

// Super admin only. The server re-checks every blocker and the typed confirmation.
export function PublishPanel({ action, blockers }: { action: Action; blockers: string[] }) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [confirm, setConfirm] = useState("");

  return (
    <div className="space-y-3 text-sm">
      {blockers.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5 text-amber-800">
          {blockers.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      ) : (
        <p className="text-slate-600">
          Creates the campaign, ad set and image ads in Meta, all <strong>PAUSED</strong>. Nothing spends until someone
          activates it in Ads Manager.
        </p>
      )}
      <form action={formAction} className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="confirm" className="mb-1 block text-xs text-slate-500">
            Type PUBLISH to confirm
          </label>
          <Input
            id="confirm"
            name="confirm"
            autoComplete="off"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            disabled={blockers.length > 0}
            className="w-40"
          />
        </div>
        <Button type="submit" disabled={pending || blockers.length > 0 || confirm !== "PUBLISH"}>
          {pending ? "Publishing..." : "Publish to Meta (Paused)"}
        </Button>
      </form>
      {state.message && (
        <p className={state.status === "error" ? "text-sm text-red-600" : "text-sm text-emerald-600"}>{state.message}</p>
      )}
    </div>
  );
}
