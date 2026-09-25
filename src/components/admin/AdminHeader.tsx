import { logout } from "@/lib/actions/auth";
import type { AdminProfile } from "@/types/admin";

export function AdminHeader({ profile }: { profile: AdminProfile }) {
  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
      <div />
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-sm font-medium text-slate-900">
            {profile.full_name ?? profile.email}
          </p>
          <p className="text-xs capitalize text-slate-500">{profile.role.replace("_", " ")}</p>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Log out
          </button>
        </form>
      </div>
    </header>
  );
}
