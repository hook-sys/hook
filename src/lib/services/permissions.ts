import { createClient } from "@/lib/supabase/server";
import type { Permission } from "@/types/permission";

export async function listPermissions(): Promise<Permission[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("permissions").select("id, name, description").order("name");
  return (data ?? []) as Permission[];
}
