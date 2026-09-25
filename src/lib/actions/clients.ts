"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getClientById } from "@/lib/services/clients";
import { createOrSyncClientFolder, isGoogleDriveConnected } from "@/lib/integrations/google-drive";
import { IntegrationError } from "@/lib/integrations/types";
import type { ClientSubfolderIds } from "@/lib/integrations/drive-folders";
import { validateClient, type ClientFieldErrors, type ClientFormValues } from "@/lib/validation/client";
import { CLIENT_STATUSES, type ClientStatus } from "@/types/client";

export interface ClientFormState {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: ClientFieldErrors;
}

function readValues(formData: FormData): ClientFormValues {
  return {
    business_name: String(formData.get("business_name") ?? "").trim(),
    website: String(formData.get("website") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    facebook_page_url: String(formData.get("facebook_page_url") ?? "").trim(),
    drive_folder_id: String(formData.get("drive_folder_id") ?? "").trim(),
  };
}

function driveColumns(tree: { folderId: string; subfolders: ClientSubfolderIds }) {
  return {
    drive_folder_id: tree.folderId,
    drive_subfolder_ids: tree.subfolders,
    drive_synced_at: new Date().toISOString(),
  };
}

function isClientStatus(value: string): value is ClientStatus {
  return (CLIENT_STATUSES as readonly string[]).includes(value);
}

export async function addClient(
  _prevState: ClientFormState,
  formData: FormData
): Promise<ClientFormState> {
  await requireSuperAdmin();

  const values = readValues(formData);
  const fieldErrors = validateClient(values);
  if (Object.keys(fieldErrors).length > 0) {
    return { status: "error", message: "Please correct the highlighted fields.", fieldErrors };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .insert({
      business_name: values.business_name,
      website: values.website || null,
      phone: values.phone || null,
      facebook_page_url: values.facebook_page_url || null,
      drive_folder_id: values.drive_folder_id || null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { status: "error", message: "Could not create the client. Please try again." };
  }

  // Best effort: a Drive failure must not block client creation. The client page
  // offers "Create/Sync Drive Folder" if this doesn't complete.
  if (!values.drive_folder_id) {
    try {
      if (await isGoogleDriveConnected()) {
        const tree = await createOrSyncClientFolder({
          id: data.id,
          business_name: values.business_name,
          drive_folder_id: null,
        });
        await supabase.from("clients").update(driveColumns(tree)).eq("id", data.id);
      }
    } catch (driveError) {
      console.error("Drive folder creation skipped:", driveError instanceof Error ? driveError.message : "unknown error");
    }
  }

  revalidatePath("/admin/clients");
  redirect(`/admin/clients/${data.id}`);
}

export async function syncClientDriveFolder(clientId: string): Promise<ClientFormState> {
  await requireSuperAdmin();

  const client = await getClientById(clientId);
  if (!client) return { status: "error", message: "Client not found." };

  try {
    if (!(await isGoogleDriveConnected())) {
      return { status: "error", message: "Connect Google Drive in Settings → Integrations first." };
    }

    const tree = await createOrSyncClientFolder(client);
    const supabase = await createClient();
    const { error } = await supabase.from("clients").update(driveColumns(tree)).eq("id", client.id);
    if (error) return { status: "error", message: "Drive folders are ready, but saving their IDs failed. Run sync again." };
  } catch (error) {
    if (error instanceof IntegrationError) return { status: "error", message: error.message };
    console.error("Drive folder sync failed:", error instanceof Error ? error.message : "unknown error");
    return { status: "error", message: "Could not sync the Drive folder." };
  }

  revalidatePath(`/admin/clients/${clientId}`);
  return { status: "success", message: "Drive folder is ready." };
}

export async function updateClient(
  clientId: string,
  _prevState: ClientFormState,
  formData: FormData
): Promise<ClientFormState> {
  await requireSuperAdmin();

  const values = readValues(formData);
  const fieldErrors = validateClient(values);
  if (Object.keys(fieldErrors).length > 0) {
    return { status: "error", message: "Please correct the highlighted fields.", fieldErrors };
  }

  const status = String(formData.get("status") ?? "");
  if (!isClientStatus(status)) {
    return { status: "error", message: "Invalid status." };
  }

  const current = await getClientById(clientId);
  if (!current) return { status: "error", message: "Client not found." };
  const driveFolderId = values.drive_folder_id || null;
  // A manually changed folder ID invalidates the synced subfolder IDs.
  const driveReset =
    driveFolderId !== current.drive_folder_id ? { drive_subfolder_ids: {}, drive_synced_at: null } : {};

  const supabase = await createClient();
  const { error } = await supabase
    .from("clients")
    .update({
      business_name: values.business_name,
      website: values.website || null,
      phone: values.phone || null,
      facebook_page_url: values.facebook_page_url || null,
      drive_folder_id: driveFolderId,
      status,
      ...driveReset,
    })
    .eq("id", clientId);

  if (error) {
    return { status: "error", message: "Could not update the client. Please try again." };
  }

  revalidatePath("/admin/clients");
  revalidatePath(`/admin/clients/${clientId}`);

  return { status: "success", message: "Client updated." };
}

export async function toggleClientStatus(formData: FormData): Promise<void> {
  await requireSuperAdmin();

  const clientId = String(formData.get("client_id") ?? "");
  const currentStatus = String(formData.get("current_status") ?? "");

  if (!clientId) return;

  const nextStatus: ClientStatus = currentStatus === "active" ? "paused" : "active";

  const supabase = await createClient();
  await supabase.from("clients").update({ status: nextStatus }).eq("id", clientId);

  revalidatePath("/admin/clients");
  revalidatePath(`/admin/clients/${clientId}`);
}
