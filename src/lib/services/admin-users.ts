import { createClient } from "@/lib/supabase/server";
import type { StaffMember } from "@/types/permission";

export async function listStaff(): Promise<StaffMember[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("admin_users")
    .select("id, email, full_name, role, is_active, created_at")
    .order("created_at", { ascending: true });

  return (data ?? []) as StaffMember[];
}

export async function getClientAssignmentCounts(): Promise<Record<string, number>> {
  const supabase = await createClient();
  const { data } = await supabase.from("client_assignments").select("admin_user_id");

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.admin_user_id] = (counts[row.admin_user_id] ?? 0) + 1;
  }
  return counts;
}
