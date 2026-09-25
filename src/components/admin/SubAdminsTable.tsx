import { Badge } from "@/components/ui/badge";
import { AdminActiveToggleForm } from "@/components/admin/AdminActiveToggleForm";
import type { StaffMember } from "@/types/permission";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function SubAdminsTable({
  staff,
  assignmentCounts,
}: {
  staff: StaffMember[];
  assignmentCounts: Record<string, number>;
}) {
  if (staff.length === 0) {
    return <div className="p-10 text-center text-sm text-slate-500">No staff accounts yet.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-5 py-3">Name</th>
            <th className="px-5 py-3">Email</th>
            <th className="px-5 py-3">Role</th>
            <th className="px-5 py-3">Assigned Clients</th>
            <th className="px-5 py-3">Status</th>
            <th className="px-5 py-3">Joined</th>
            <th className="px-5 py-3">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {staff.map((member) => (
            <tr key={member.id} className="hover:bg-slate-50">
              <td className="px-5 py-3 font-medium text-slate-900">
                {member.full_name ?? "—"}
              </td>
              <td className="px-5 py-3 text-slate-600">{member.email}</td>
              <td className="px-5 py-3">
                <Badge variant={member.role === "admin" ? "blue" : "slate"}>
                  {member.role === "admin" ? "Admin" : "Sub-Admin"}
                </Badge>
              </td>
              <td className="px-5 py-3 text-slate-600">
                {member.role === "admin" ? (
                  <span className="text-slate-300">All</span>
                ) : (
                  assignmentCounts[member.id] ?? 0
                )}
              </td>
              <td className="px-5 py-3">
                <Badge variant={member.is_active ? "green" : "red"}>
                  {member.is_active ? "Active" : "Inactive"}
                </Badge>
              </td>
              <td className="px-5 py-3 text-slate-600">{formatDate(member.created_at)}</td>
              <td className="px-5 py-3">
                <AdminActiveToggleForm staff={member} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
