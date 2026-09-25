"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { LEAD_STATUSES, type LeadStatus } from "@/types/lead";

export interface LeadActionState {
  status: "idle" | "error" | "success";
  message?: string;
}

function isLeadStatus(value: string): value is LeadStatus {
  return (LEAD_STATUSES as readonly string[]).includes(value);
}

export async function updateLeadStatus(
  _prevState: LeadActionState,
  formData: FormData
): Promise<LeadActionState> {
  await requirePermission("leads");

  const leadId = String(formData.get("lead_id") ?? "");
  const status = String(formData.get("status") ?? "");

  if (!leadId || !isLeadStatus(status)) {
    return { status: "error", message: "Invalid status update." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("leads").update({ status }).eq("id", leadId);

  if (error) {
    return { status: "error", message: "Could not update the lead status." };
  }

  revalidatePath("/admin/leads");
  revalidatePath(`/admin/leads/${leadId}`);
  revalidatePath("/admin");

  return { status: "success", message: "Status updated." };
}

export async function updateLeadNote(
  _prevState: LeadActionState,
  formData: FormData
): Promise<LeadActionState> {
  await requirePermission("leads");

  const leadId = String(formData.get("lead_id") ?? "");
  const note = String(formData.get("admin_note") ?? "").trim();

  if (!leadId) {
    return { status: "error", message: "Invalid lead." };
  }

  if (note.length > 4000) {
    return { status: "error", message: "Note is too long." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("leads")
    .update({ admin_note: note || null })
    .eq("id", leadId);

  if (error) {
    return { status: "error", message: "Could not save the note." };
  }

  revalidatePath(`/admin/leads/${leadId}`);
  revalidatePath("/admin/leads");

  return { status: "success", message: "Note saved." };
}
