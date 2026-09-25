import type { AdminRole } from "@/types/admin";
import type { PermissionKey } from "@/types/permission";

export interface ClientSection {
  label: string;
  path: string; // appended to /admin/clients/[id]
  permission: PermissionKey;
}

// Client-scoped modules, in display order, with the permission each one requires.
export const CLIENT_SECTIONS: ClientSection[] = [
  { label: "Overview", path: "", permission: "clients" },
  { label: "Products", path: "/products", permission: "clients" },
  { label: "AI Knowledge", path: "/knowledge", permission: "clients" },
  { label: "Creative Studio", path: "/creative-studio", permission: "content" },
  { label: "Content Calendar", path: "/content-calendar", permission: "content" },
  { label: "Campaigns", path: "/campaigns", permission: "campaigns" },
  { label: "Audiences", path: "/audiences", permission: "ai_ads" },
  { label: "Analytics", path: "/analytics", permission: "analytics" },
  { label: "AI Agent", path: "/ai-agent", permission: "ai_ads" },
];

export function clientSectionsFor(role: AdminRole, permissions: PermissionKey[]): ClientSection[] {
  return CLIENT_SECTIONS.filter((s) => role === "admin" || permissions.includes(s.permission));
}
