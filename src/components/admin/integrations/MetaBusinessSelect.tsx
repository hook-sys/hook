"use client";

import { useActionState } from "react";
import { selectMetaBusinessAction, type IntegrationActionState } from "@/lib/actions/integrations";
import type { MetaNamedAsset } from "@/lib/integrations/meta";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

const initialState: IntegrationActionState = { status: "idle" };

export function MetaBusinessSelect({ businesses }: { businesses: MetaNamedAsset[] }) {
  const [state, formAction, pending] = useActionState(selectMetaBusinessAction, initialState);

  if (businesses.length === 0) {
    return (
      <p className="text-sm text-amber-700">
        No Business Manager is accessible with this connection. Make sure the connected Meta user has
        access to the Hook Marketing Business Manager.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      <label htmlFor="business_id" className="block text-sm font-medium text-slate-700">
        Hook Marketing Business Manager
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Select id="business_id" name="business_id" defaultValue="">
          <option value="" disabled>
            Select a Business Manager
          </option>
          {businesses.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Use Business"}
        </Button>
      </div>
      {state.message && (
        <p className={state.status === "error" ? "text-sm text-red-600" : "text-sm text-emerald-600"}>
          {state.message}
        </p>
      )}
    </form>
  );
}
