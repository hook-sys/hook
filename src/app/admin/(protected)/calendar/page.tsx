import { ClientSectionIndex } from "@/components/admin/ClientSectionIndex";
import { requirePermission } from "@/lib/auth/session";
import { listClients } from "@/lib/services/clients";

export default async function CalendarIndexPage() {
  await requirePermission("content");
  const clients = await listClients();
  return (
    <ClientSectionIndex
      title="30-Day Calendar"
      description="Content calendars are planned per client. Choose a client."
      clients={clients}
      section="content-calendar"
      linkLabel="Content Calendar"
    />
  );
}
