import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SubAdminsTable } from "@/components/admin/SubAdminsTable";
import { requireSuperAdmin } from "@/lib/auth/session";
import { listStaff, getClientAssignmentCounts } from "@/lib/services/admin-users";

export default async function SubAdminsPage() {
  await requireSuperAdmin();
  const [staff, assignmentCounts] = await Promise.all([listStaff(), getClientAssignmentCounts()]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Sub-Admins</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage staff accounts, client assignments, and access.
          </p>
        </div>
        <Link href="/admin/sub-admins/new">
          <Button>Create Sub-Admin</Button>
        </Link>
      </div>

      <Card>
        <SubAdminsTable staff={staff} assignmentCounts={assignmentCounts} />
      </Card>
    </div>
  );
}
