import { notFound } from "next/navigation";
import { ClientSectionNav } from "@/components/admin/ClientSectionNav";
import { requireAdmin } from "@/lib/auth/session";
import { clientSectionsFor } from "@/lib/data/client-nav";
import { getClientById } from "@/lib/services/clients";

// Shared client navigation. Only sections the caller may open are listed; each page still
// enforces its own permission. RLS hides unassigned clients (-> 404).
export default async function ClientLayout({ children, params }: LayoutProps<"/admin/clients/[id]">) {
  const profile = await requireAdmin();
  const { id } = await params;
  const client = await getClientById(id);
  if (!client) notFound();

  const sections = clientSectionsFor(profile.role, profile.permissions).map(({ label, path }) => ({ label, path }));

  return (
    <div className="space-y-6">
      <ClientSectionNav clientName={client.business_name} basePath={`/admin/clients/${client.id}`} sections={sections} />
      {children}
    </div>
  );
}
