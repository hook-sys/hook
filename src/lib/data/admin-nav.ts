import type { AdminRole } from "@/types/admin";
import type { PermissionKey } from "@/types/permission";

export interface AdminNavItem {
  label: string;
  href: string;
  comingSoon?: boolean;
  // Omitted = super admin only.
  permission?: PermissionKey;
}

export interface AdminNavGroup {
  title?: string;
  items: AdminNavItem[];
}

export const ADMIN_NAV: AdminNavGroup[] = [
  {
    items: [
      { label: "Dashboard", href: "/admin", permission: "dashboard" },
      { label: "Leads", href: "/admin/leads", permission: "leads" },
      { label: "Clients", href: "/admin/clients", permission: "clients" },
      { label: "Sub-Admins", href: "/admin/sub-admins" },
    ],
  },
  {
    title: "AI Ad Manager",
    items: [
      { label: "AI Ad Manager", href: "/admin/ai-ad-manager", permission: "ai_ads" },
      { label: "Campaigns", href: "/admin/campaigns", permission: "campaigns" },
      { label: "Audiences", href: "/admin/audiences", permission: "ai_ads" },
    ],
  },
  {
    title: "Content",
    items: [
      { label: "Content Studio", href: "/admin/content-studio", permission: "content" },
      { label: "30-Day Calendar", href: "/admin/calendar", permission: "content" },
      { label: "Creative Library", href: "/admin/creative-library", permission: "content" },
    ],
  },
  {
    title: "Insights",
    items: [
      { label: "Analytics", href: "/admin/analytics", permission: "analytics" },
      { label: "AI Reports", href: "/admin/ai-reports", permission: "analytics" },
    ],
  },
  {
    title: "Integrations",
    items: [{ label: "Integrations", href: "/admin/settings/integrations" }],
  },
  {
    title: "AI Control",
    items: [
      { label: "HATOG Funnel", href: "/admin/ai-control/hatog" },
      { label: "AI Knowledge", href: "/admin/ai-control/knowledge" },
      { label: "Negative Prompts", href: "/admin/ai-control/negative-prompts" },
    ],
  },
  {
    items: [{ label: "Settings", href: "/admin/settings", permission: "settings" }],
  },
];

export function filterNav(role: AdminRole, permissions: PermissionKey[]): AdminNavGroup[] {
  if (role === "admin") return ADMIN_NAV;

  return ADMIN_NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.permission && permissions.includes(item.permission)),
  })).filter((group) => group.items.length > 0);
}
