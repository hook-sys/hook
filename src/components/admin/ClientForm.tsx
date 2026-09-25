"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { ClientFormState } from "@/lib/actions/clients";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { CLIENT_STATUSES, CLIENT_STATUS_LABELS, type Client } from "@/types/client";

type ClientAction = (prevState: ClientFormState, formData: FormData) => Promise<ClientFormState>;

const initialClientFormState: ClientFormState = { status: "idle" };

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function ClientForm({
  action,
  client,
  submitLabel,
  pendingLabel,
}: {
  action: ClientAction;
  client?: Client;
  submitLabel: string;
  pendingLabel: string;
}) {
  const [state, formAction] = useActionState(action, initialClientFormState);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <div>
        <Label htmlFor="business_name">Business Name *</Label>
        <Input
          id="business_name"
          name="business_name"
          required
          maxLength={200}
          defaultValue={client?.business_name}
        />
        {state.fieldErrors?.business_name && (
          <p className="mt-1 text-sm text-red-600">{state.fieldErrors.business_name}</p>
        )}
      </div>

      <div>
        <Label htmlFor="website">Website</Label>
        <Input
          id="website"
          name="website"
          type="url"
          placeholder="https://"
          defaultValue={client?.website ?? ""}
        />
        {state.fieldErrors?.website && (
          <p className="mt-1 text-sm text-red-600">{state.fieldErrors.website}</p>
        )}
      </div>

      <div>
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" name="phone" type="tel" defaultValue={client?.phone ?? ""} />
        {state.fieldErrors?.phone && (
          <p className="mt-1 text-sm text-red-600">{state.fieldErrors.phone}</p>
        )}
      </div>

      <div>
        <Label htmlFor="facebook_page_url">Facebook Page Link</Label>
        <Input
          id="facebook_page_url"
          name="facebook_page_url"
          type="url"
          placeholder="https://facebook.com/yourpage"
          defaultValue={client?.facebook_page_url ?? ""}
        />
        {state.fieldErrors?.facebook_page_url && (
          <p className="mt-1 text-sm text-red-600">{state.fieldErrors.facebook_page_url}</p>
        )}
      </div>

      <div>
        <Label htmlFor="drive_folder_id">Drive Folder ID</Label>
        <Input
          id="drive_folder_id"
          name="drive_folder_id"
          placeholder="Optional — set once Google Drive is connected"
          defaultValue={client?.drive_folder_id ?? ""}
        />
      </div>

      {client && (
        <div className="w-48">
          <Label htmlFor="status">Status</Label>
          <Select id="status" name="status" defaultValue={client.status}>
            {CLIENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {CLIENT_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>
      )}

      {state.status === "error" && state.message && !state.fieldErrors && (
        <p className="text-sm text-red-600">{state.message}</p>
      )}
      {state.status === "success" && state.message && (
        <p className="text-sm text-emerald-600">{state.message}</p>
      )}

      <SubmitButton label={submitLabel} pendingLabel={pendingLabel} />
    </form>
  );
}
