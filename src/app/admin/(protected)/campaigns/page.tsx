import { ClientSectionIndex } from "@/components/admin/ClientSectionIndex";
import { requirePermission } from "@/lib/auth/session";
import { listClients } from "@/lib/services/clients";

export default async function CampaignsPage() {
  await requirePermission("campaigns");
  const clients = await listClients();
  return (
    <ClientSectionIndex
      title="Campaigns"
      description="Campaigns are managed per client using that client's Meta assets. Choose a client."
      clients={clients}
      section="campaigns"
      linkLabel="Campaigns"
    />
  );
}
