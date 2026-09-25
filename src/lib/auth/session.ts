import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AdminProfile } from "@/types/admin";
import type { PermissionKey } from "@/types/permission";

const ACCESS_DENIED_PATH = "/admin/access-denied";

interface AdminProfileRow extends Omit<AdminProfile, "permissions"> {
  admin_user_permissions: { permissions: { name: PermissionKey } | null }[];
}

export const getAdminProfile = cache(async (): Promise<AdminProfile | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("admin_users")
    .select(
      "id, email, full_name, role, is_active, created_at, admin_user_permissions(permissions(name))"
    )
    .eq("id", user.id)
    .maybeSingle();

  const row = data as AdminProfileRow | null;

  if (!row || !row.is_active) return null;

  const { admin_user_permissions, ...profile } = row;

  return {
    ...profile,
    permissions: admin_user_permissions.flatMap((p) => (p.permissions ? [p.permissions.name] : [])),
  };
});

export function hasPermission(profile: AdminProfile, permission: PermissionKey): boolean {
  return profile.role === "admin" || profile.permissions.includes(permission);
}

export async function requireAdmin(): Promise<AdminProfile> {
  const profile = await getAdminProfile();

  if (!profile) {
    redirect("/admin/login");
  }

  return profile;
}

export async function requirePermission(permission: PermissionKey): Promise<AdminProfile> {
  const profile = await requireAdmin();

  if (!hasPermission(profile, permission)) {
    redirect(ACCESS_DENIED_PATH);
  }

  return profile;
}

export async function requireSuperAdmin(): Promise<AdminProfile> {
  const profile = await requireAdmin();

  if (profile.role !== "admin") {
    redirect(ACCESS_DENIED_PATH);
  }

  return profile;
}
