import { toggleAdminActive } from "@/lib/actions/sub-admins";
import type { StaffMember } from "@/types/permission";

export function AdminActiveToggleForm({ staff }: { staff: StaffMember }) {
  if (staff.role === "admin") return null;

  return (
    <form action={toggleAdminActive}>
      <input type="hidden" name="admin_user_id" value={staff.id} />
      <input type="hidden" name="role" value={staff.role} />
      <input type="hidden" name="is_active" value={String(staff.is_active)} />
      <button
        type="submit"
        className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        {staff.is_active ? "Deactivate" : "Activate"}
      </button>
    </form>
  );
}
