import { requireAdmin } from "@/lib/auth/session";
import { filterNav } from "@/lib/data/admin-nav";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminMobileNav } from "@/components/admin/AdminMobileNav";
import { AdminHeader } from "@/components/admin/AdminHeader";

export default async function AdminProtectedLayout({ children }: LayoutProps<"/admin">) {
  const profile = await requireAdmin();
  const nav = filterNav(profile.role, profile.permissions);

  return (
    <div className="flex min-h-screen bg-slate-50">
      <AdminSidebar nav={nav} />
      <div className="flex min-h-screen flex-1 flex-col">
        <AdminHeader profile={profile} />
        <AdminMobileNav nav={nav} />
        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
