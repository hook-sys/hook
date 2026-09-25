import { ClientSectionIndex } from "@/components/admin/ClientSectionIndex";
import { requirePermission } from "@/lib/auth/session";
import { listClients } from "@/lib/services/clients";

export default async function AiAdManagerPage() {
  await requirePermission("ai_ads");
  const clients = await listClients();
  return (
    <ClientSectionIndex
      title="AI Ad Manager"
      description="The AI Marketing Agent works on one client at a time. Choose a client."
      clients={clients}
      section="ai-agent"
      linkLabel="AI Agent"
    />
  );
}
