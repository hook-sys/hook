import type { PermissionKey } from "@/types/permission";

export type AdminRole = "admin" | "sub_admin";

export interface AdminProfile {
  id: string;
  email: string;
  full_name: string | null;
  role: AdminRole;
  is_active: boolean;
  created_at: string;
  permissions: PermissionKey[];
}
