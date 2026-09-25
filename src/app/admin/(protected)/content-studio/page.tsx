import { ClientSectionIndex } from "@/components/admin/ClientSectionIndex";
import { requirePermission } from "@/lib/auth/session";
import { listClients } from "@/lib/services/clients";

export default async function ContentStudioPage() {
  await requirePermission("content");
  const clients = await listClients();
  return (
    <ClientSectionIndex
      title="Content Studio"
      description="Creatives are generated per client in the Creative Studio. Choose a client."
      clients={clients}
      section="creative-studio"
      linkLabel="Creative Studio"
    />
  );
}
