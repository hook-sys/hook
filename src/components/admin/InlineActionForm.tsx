"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface ActionState {
  status: "idle" | "error" | "success";
  message?: string;
}

// A small form with one text input (or textarea) and a submit button, for actions that need
// a single extra value (post URL, regeneration instructions, typed confirmation...).
export function InlineActionForm({
  action,
  name,
  label,
  placeholder,
  submitLabel,
  pendingLabel,
  multiline = false,
  required = false,
  maxLength = 500,
  requireExact,
  variant = "outline",
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  name: string;
  label: string;
  placeholder?: string;
  submitLabel: string;
  pendingLabel: string;
  multiline?: boolean;
  required?: boolean;
  maxLength?: number;
  requireExact?: string;
  variant?: "primary" | "secondary" | "outline" | "ghost";
}) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" });
  const [value, setValue] = useState("");
  const blocked = (required && !value.trim()) || (requireExact !== undefined && value !== requireExact);

  return (
    <form action={formAction} className="space-y-2">
      <label htmlFor={`f-${name}`} className="block text-xs font-medium text-slate-500">
        {label}
      </label>
      {multiline ? (
        <Textarea id={`f-${name}`} name={name} rows={2} maxLength={maxLength} placeholder={placeholder} value={value} onChange={(e) => setValue(e.target.value)} />
      ) : (
        <Input id={`f-${name}`} name={name} maxLength={maxLength} placeholder={placeholder} autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} />
      )}
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" variant={variant} disabled={pending || blocked}>
          {pending ? pendingLabel : submitLabel}
        </Button>
        {!pending && state.message && (
          <p className={state.status === "error" ? "text-xs text-red-600" : "text-xs text-emerald-600"}>{state.message}</p>
        )}
      </div>
    </form>
  );
}
