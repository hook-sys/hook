import { ClientSectionIndex } from "@/components/admin/ClientSectionIndex";
import { requirePermission } from "@/lib/auth/session";
import { listClients } from "@/lib/services/clients";

export default async function AudiencesIndexPage() {
  await requirePermission("ai_ads");
  const clients = await listClients();
  return (
    <ClientSectionIndex
      title="Audiences"
      description="Custom Audiences are managed per client in the client's own ad account. Choose a client."
      clients={clients}
      section="audiences"
      linkLabel="Audiences"
    />
  );
}
