import { ClientSectionIndex } from "@/components/admin/ClientSectionIndex";
import { requirePermission } from "@/lib/auth/session";
import { listClients } from "@/lib/services/clients";

export default async function AnalyticsIndexPage() {
  await requirePermission("analytics");
  const clients = await listClients();
  return (
    <ClientSectionIndex
      title="Analytics"
      description="Meta analytics are shown per client from the client's own ad account. Choose a client."
      clients={clients}
      section="analytics"
      linkLabel="Analytics"
    />
  );
}
