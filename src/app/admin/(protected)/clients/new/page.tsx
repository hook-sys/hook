import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClientForm } from "@/components/admin/ClientForm";
import { addClient } from "@/lib/actions/clients";
import { requireSuperAdmin } from "@/lib/auth/session";

export default async function NewClientPage() {
  await requireSuperAdmin();

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Add Client</h1>
        <p className="mt-1 text-sm text-slate-500">Create a new client record.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Business Information</CardTitle>
        </CardHeader>
        <CardContent>
          <ClientForm action={addClient} submitLabel="Add Client" pendingLabel="Adding..." />
        </CardContent>
      </Card>
    </div>
  );
}
