export const PERMISSION_KEYS = [
  "dashboard",
  "leads",
  "clients",
  "meta",
  "ai_ads",
  "campaigns",
  "content",
  "analytics",
  "settings",
  "sub_admin_management",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export interface Permission {
  id: string;
  name: string;
  description: string | null;
}

export interface StaffMember {
  id: string;
  email: string;
  full_name: string | null;
  role: "admin" | "sub_admin";
  is_active: boolean;
  created_at: string;
}
