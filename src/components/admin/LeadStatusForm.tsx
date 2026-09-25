"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { updateLeadStatus, type LeadActionState } from "@/lib/actions/admin-leads";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { LEAD_STATUSES, LEAD_STATUS_LABELS, type LeadStatus } from "@/types/lead";

const initialLeadActionState: LeadActionState = { status: "idle" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="secondary" disabled={pending}>
      {pending ? "Saving..." : "Update Status"}
    </Button>
  );
}

export function LeadStatusForm({ leadId, status }: { leadId: string; status: LeadStatus }) {
  const [state, formAction] = useActionState(updateLeadStatus, initialLeadActionState);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="lead_id" value={leadId} />
      <div className="w-48">
        <label className="mb-1.5 block text-sm font-medium text-slate-700">Status</label>
        <Select name="status" defaultValue={status}>
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {LEAD_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
      </div>
      <SubmitButton />
      {state.status !== "idle" && state.message && (
        <p className={state.status === "error" ? "text-sm text-red-600" : "text-sm text-emerald-600"}>
          {state.message}
        </p>
      )}
    </form>
  );
}
