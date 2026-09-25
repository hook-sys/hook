import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SubAdminForm } from "@/components/admin/SubAdminForm";
import { requireSuperAdmin } from "@/lib/auth/session";
import { listClients } from "@/lib/services/clients";
import { listPermissions } from "@/lib/services/permissions";

export default async function NewSubAdminPage() {
  await requireSuperAdmin();
  const [clients, permissions] = await Promise.all([listClients(), listPermissions()]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Create Sub-Admin</h1>
        <p className="mt-1 text-sm text-slate-500">
          Grant a team member scoped access to specific clients and modules.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account Details</CardTitle>
        </CardHeader>
        <CardContent>
          <SubAdminForm clients={clients} permissions={permissions} />
        </CardContent>
      </Card>
    </div>
  );
}
