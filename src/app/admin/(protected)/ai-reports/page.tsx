import { ClientSectionIndex } from "@/components/admin/ClientSectionIndex";
import { requirePermission } from "@/lib/auth/session";
import { listClients } from "@/lib/services/clients";

export default async function AiReportsIndexPage() {
  await requirePermission("analytics");
  const clients = await listClients();
  return (
    <ClientSectionIndex
      title="AI Reports"
      description="AI marketing reports are generated from each client's real Meta data on its Analytics page. Choose a client."
      clients={clients}
      section="analytics"
      linkLabel="Analytics & Reports"
    />
  );
}
