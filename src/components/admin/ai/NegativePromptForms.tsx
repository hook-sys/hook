"use client";

import { useActionState, useRef } from "react";
import {
  createNegativePrompt,
  deleteNegativePrompt,
  updateNegativePrompt,
  type AiActionState,
} from "@/lib/actions/ai";
import { ActionButton } from "@/components/admin/ActionButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { NEGATIVE_PROMPT_CATEGORIES, NEGATIVE_PROMPT_CATEGORY_LABELS, type NegativePrompt } from "@/types/ai";

const initialState: AiActionState = { status: "idle" };

function CategorySelect({ defaultValue }: { defaultValue: string }) {
  return (
    <Select name="category" defaultValue={defaultValue} aria-label="Category" className="sm:w-36">
      {NEGATIVE_PROMPT_CATEGORIES.map((c) => (
        <option key={c} value={c}>
          {NEGATIVE_PROMPT_CATEGORY_LABELS[c]}
        </option>
      ))}
    </Select>
  );
}

function Message({ state }: { state: AiActionState }) {
  if (!state.message) return null;
  return <p className={state.status === "error" ? "text-xs text-red-600" : "text-xs text-emerald-600"}>{state.message}</p>;
}

export function NegativePromptRow({ rule }: { rule: NegativePrompt }) {
  const [state, formAction, pending] = useActionState(updateNegativePrompt.bind(null, rule.id), initialState);

  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start">
      <form action={formAction} className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
        <Input name="prompt" defaultValue={rule.prompt} maxLength={500} aria-label="Rule" className="flex-1" />
        <CategorySelect defaultValue={rule.category} />
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="enabled" defaultChecked={rule.enabled} className="h-4 w-4" />
          Enabled
        </label>
        <Button type="submit" size="sm" variant="secondary" disabled={pending}>
          {pending ? "Saving..." : "Save"}
        </Button>
        {!pending && <Message state={state} />}
      </form>
      <ActionButton
        action={deleteNegativePrompt.bind(null, rule.id)}
        label="Delete"
        pendingLabel="Deleting..."
        variant="ghost"
        confirmMessage="Delete this rule?"
      />
    </li>
  );
}

export function NewNegativePromptForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(async (prev: AiActionState, formData: FormData) => {
    const result = await createNegativePrompt(prev, formData);
    if (result.status === "success") formRef.current?.reset();
    return result;
  }, initialState);

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input name="prompt" required maxLength={500} placeholder="e.g. Do not show competitor logos." className="flex-1" />
        <CategorySelect defaultValue="general" />
        <input type="hidden" name="enabled" value="on" />
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Adding..." : "Add Rule"}
        </Button>
      </div>
      {!pending && <Message state={state} />}
    </form>
  );
}
