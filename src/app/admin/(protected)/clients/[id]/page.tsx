import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClientStatusBadge } from "@/components/admin/ClientStatusBadge";
import { ClientStatusToggleForm } from "@/components/admin/ClientStatusToggleForm";
import { ClientForm } from "@/components/admin/ClientForm";
import { MetaAssetsCard } from "@/components/admin/client-assets/MetaAssetsCard";
import { DriveFolderCard } from "@/components/admin/client-assets/DriveFolderCard";
import { DriveSourcesCard } from "@/components/admin/client-assets/DriveSourcesCard";
import { ClientProductsCard } from "@/components/admin/client-assets/ClientProductsCard";
import { ClientAiKnowledgeCard } from "@/components/admin/client-assets/ClientAiKnowledgeCard";
import { updateClient } from "@/lib/actions/clients";
import { requirePermission } from "@/lib/auth/session";
import { getClientById } from "@/lib/services/clients";

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function ClientDetailPage({ params }: PageProps<"/admin/clients/[id]">) {
  const profile = await requirePermission("clients");
  const isSuperAdmin = profile.role === "admin";
  const { id } = await params;
  // RLS returns null for clients not assigned to a sub-admin.
  const client = await getClientById(id);

  if (!client) {
    notFound();
  }

  const updateClientAction = updateClient.bind(null, client.id);
  const readOnlyFields = [
    { label: "Website", value: client.website },
    { label: "Phone", value: client.phone },
    { label: "Facebook Page", value: client.facebook_page_url },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/clients" className="text-sm text-brand-blue hover:underline">
          &larr; Back to Clients
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">{client.business_name}</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Business Information</CardTitle>
            </CardHeader>
            <CardContent>
              {isSuperAdmin ? (
                <ClientForm
                  action={updateClientAction}
                  client={client}
                  submitLabel="Save Changes"
                  pendingLabel="Saving..."
                />
              ) : (
                <dl className="grid gap-4 sm:grid-cols-2">
                  {readOnlyFields.map((field) => (
                    <div key={field.label}>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        {field.label}
                      </dt>
                      <dd className="mt-1 break-all text-sm text-slate-900">
                        {field.value || <span className="text-slate-400">Not provided</span>}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </CardContent>
          </Card>

          <div id="meta-assets" className="scroll-mt-6">
            <MetaAssetsCard clientId={client.id} isSuperAdmin={isSuperAdmin} />
          </div>
          <div id="drive-sources" className="scroll-mt-6">
            <DriveSourcesCard clientId={client.id} isSuperAdmin={isSuperAdmin} />
          </div>
          <ClientProductsCard clientId={client.id} isSuperAdmin={isSuperAdmin} />
          <ClientAiKnowledgeCard clientId={client.id} isSuperAdmin={isSuperAdmin} />
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <ClientStatusBadge status={client.status} />
                {isSuperAdmin && <ClientStatusToggleForm clientId={client.id} status={client.status} />}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Created</p>
                <p className="mt-1 text-slate-700">{formatDateTime(client.created_at)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Last Updated</p>
                <p className="mt-1 text-slate-700">{formatDateTime(client.updated_at)}</p>
              </div>
            </CardContent>
          </Card>

          <DriveFolderCard client={client} isSuperAdmin={isSuperAdmin} />
        </div>
      </div>
    </div>
  );
}
