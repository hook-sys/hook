"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { updateLeadNote, type LeadActionState } from "@/lib/actions/admin-leads";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

const initialLeadActionState: LeadActionState = { status: "idle" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving..." : "Save Note"}
    </Button>
  );
}

export function LeadNoteForm({ leadId, note }: { leadId: string; note: string | null }) {
  const [state, formAction] = useActionState(updateLeadNote, initialLeadActionState);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="lead_id" value={leadId} />
      <Textarea
        name="admin_note"
        rows={4}
        maxLength={4000}
        defaultValue={note ?? ""}
        placeholder="Internal notes about this lead..."
      />
      <div className="flex items-center gap-3">
        <SubmitButton />
        {state.status !== "idle" && state.message && (
          <p className={state.status === "error" ? "text-sm text-red-600" : "text-sm text-emerald-600"}>
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
