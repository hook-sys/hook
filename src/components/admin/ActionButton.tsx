"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";

interface ActionState {
  status: "idle" | "error" | "success";
  message?: string;
}

export function ActionButton({
  action,
  label,
  pendingLabel,
  variant = "outline",
  confirmMessage,
  disabled = false,
  showResult = true,
  fields,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  label: string;
  pendingLabel: string;
  variant?: "primary" | "secondary" | "outline" | "ghost";
  confirmMessage?: string;
  disabled?: boolean;
  showResult?: boolean;
  // Optional hidden values submitted with the action (e.g. the selected date range).
  fields?: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" });

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (confirmMessage && !window.confirm(confirmMessage)) e.preventDefault();
      }}
      className="flex flex-col items-start gap-1"
    >
      {fields && Object.entries(fields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
      <Button type="submit" size="sm" variant={variant} disabled={pending || disabled}>
        {pending ? pendingLabel : label}
      </Button>
      {showResult && !pending && state.message && (
        <p className={state.status === "error" ? "text-xs text-red-600" : "text-xs text-emerald-600"}>
          {state.message}
        </p>
      )}
    </form>
  );
}
