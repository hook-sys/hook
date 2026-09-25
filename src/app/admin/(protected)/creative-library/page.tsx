import { ClientSectionIndex } from "@/components/admin/ClientSectionIndex";
import { requirePermission } from "@/lib/auth/session";
import { listClients } from "@/lib/services/clients";

export default async function CreativeLibraryPage() {
  await requirePermission("content");
  const clients = await listClients();
  return (
    <ClientSectionIndex
      title="Creative Library"
      description="Creatives are stored per client. Choose a client to generate and browse its creatives."
      clients={clients}
      section="creative-studio"
      linkLabel="Creative Studio"
    />
  );
}
