"use client";

import { useActionState, useState } from "react";
import type { AgentActionState } from "@/lib/actions/agent";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Action = (prev: AgentActionState, formData: FormData) => Promise<AgentActionState>;

export function AgentRequestForm({ action, isSuperAdmin, disabled }: { action: Action; isSuperAdmin: boolean; disabled: boolean }) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" });
  // Controlled so the request survives React's post-action form reset.
  const [request, setRequest] = useState("");
  const [paid, setPaid] = useState(false);
  const [drive, setDrive] = useState(false);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <Label htmlFor="request">What should the agent do?</Label>
        <Textarea
          id="request"
          name="request"
          rows={4}
          maxLength={2000}
          placeholder="e.g. Create a campaign draft for the Classic Wallet focused on the Offer stage, and recommend creatives."
          value={request}
          onChange={(e) => setRequest(e.target.value)}
        />
      </div>
      <fieldset className="space-y-2 text-sm text-slate-700">
        <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Permissions for this run</legend>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="allow_paid_generation" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
          Allow Fal.ai image/video generation (costs money)
        </label>
        {isSuperAdmin && (
          <label className="flex items-center gap-2">
            <input type="checkbox" name="allow_drive_upload" checked={drive} onChange={(e) => setDrive(e.target.checked)} />
            Allow uploading ready creatives to Google Drive
          </label>
        )}
        <p className="text-xs text-slate-400">
          The agent can never publish to Meta, spend ad budget, or delete anything. Drafts it creates need human approval.
        </p>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || disabled || !request.trim()}>
          {pending ? "Agent working… (up to 4 minutes)" : "Run Agent"}
        </Button>
        {state.message && (
          <p className={state.status === "error" ? "text-sm text-red-600" : "text-sm text-emerald-600"}>{state.message}</p>
        )}
      </div>
    </form>
  );
}
