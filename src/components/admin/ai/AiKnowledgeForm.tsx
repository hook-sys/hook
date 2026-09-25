"use client";

import { useActionState } from "react";
import type { AiActionState } from "@/lib/actions/ai";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AI_KNOWLEDGE_FIELDS, type ClientAiKnowledge } from "@/types/ai";

const initialState: AiActionState = { status: "idle" };

export function AiKnowledgeForm({
  action,
  knowledge,
}: {
  action: (prev: AiActionState, formData: FormData) => Promise<AiActionState>;
  knowledge: ClientAiKnowledge | null;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-5">
      {AI_KNOWLEDGE_FIELDS.map(({ key, label, hint }) => (
        <div key={key}>
          <Label htmlFor={key}>{label}</Label>
          <Textarea id={key} name={key} rows={4} maxLength={10000} defaultValue={state.values?.[key] ?? knowledge?.[key] ?? ""} placeholder={hint} />
          {state.fieldErrors?.[key] && <p className="mt-1 text-sm text-red-600">{state.fieldErrors[key]}</p>}
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save AI Knowledge"}
        </Button>
        {!pending && state.message && (
          <p className={state.status === "error" ? "text-sm text-red-600" : "text-sm text-emerald-600"}>{state.message}</p>
        )}
      </div>
    </form>
  );
}
