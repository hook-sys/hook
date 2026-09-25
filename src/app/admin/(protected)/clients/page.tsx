import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClientsTable } from "@/components/admin/ClientsTable";
import { requirePermission } from "@/lib/auth/session";
import { listClients } from "@/lib/services/clients";

export default async function ClientsPage() {
  const profile = await requirePermission("clients");
  const isSuperAdmin = profile.role === "admin";
  const clients = await listClients();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Clients</h1>
          <p className="mt-1 text-sm text-slate-500">
            {isSuperAdmin
              ? "The agency's client roster and their assigned assets."
              : "Clients assigned to you."}
          </p>
        </div>
        {isSuperAdmin && (
          <Link href="/admin/clients/new">
            <Button>Add Client</Button>
          </Link>
        )}
      </div>

      <Card>
        <ClientsTable clients={clients} readOnly={!isSuperAdmin} />
      </Card>
    </div>
  );
}
