"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createSubAdmin, type SubAdminFormState } from "@/lib/actions/sub-admins";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Client } from "@/types/client";
import type { Permission } from "@/types/permission";

const initialState: SubAdminFormState = { status: "idle" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Creating..." : "Create Sub-Admin"}
    </Button>
  );
}

export function SubAdminForm({
  clients,
  permissions,
}: {
  clients: Client[];
  permissions: Permission[];
}) {
  const [state, formAction] = useActionState(createSubAdmin, initialState);

  return (
    <form action={formAction} className="space-y-6" noValidate>
      <div>
        <Label htmlFor="full_name">Full Name *</Label>
        <Input id="full_name" name="full_name" required maxLength={200} />
        {state.fieldErrors?.full_name && (
          <p className="mt-1 text-sm text-red-600">{state.fieldErrors.full_name}</p>
        )}
      </div>

      <div>
        <Label htmlFor="email">Email *</Label>
        <Input id="email" name="email" type="email" required />
        {state.fieldErrors?.email && (
          <p className="mt-1 text-sm text-red-600">{state.fieldErrors.email}</p>
        )}
      </div>

      <div>
        <Label htmlFor="password">Temporary Password *</Label>
        <Input id="password" name="password" type="password" required minLength={8} />
        {state.fieldErrors?.password && (
          <p className="mt-1 text-sm text-red-600">{state.fieldErrors.password}</p>
        )}
      </div>

      <div>
        <Label>Assigned Clients</Label>
        <div className="grid gap-2 rounded-md border border-slate-200 p-3 sm:grid-cols-2">
          {clients.map((client) => (
            <label key={client.id} className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name="client_ids" value={client.id} className="h-4 w-4" />
              {client.business_name}
            </label>
          ))}
        </div>
      </div>

      <div>
        <Label>Module Permissions</Label>
        <div className="grid gap-2 rounded-md border border-slate-200 p-3 sm:grid-cols-2">
          {permissions.map((permission) => (
            <label key={permission.id} className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                name="permission_ids"
                value={permission.id}
                className="h-4 w-4"
              />
              {permission.description ?? permission.name}
            </label>
          ))}
        </div>
      </div>

      {state.status === "error" && state.message && (
        <p className="text-sm text-red-600">{state.message}</p>
      )}

      <SubmitButton />
    </form>
  );
}
