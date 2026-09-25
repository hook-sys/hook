import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NewCampaignForm } from "@/components/admin/campaigns/NewCampaignForm";
import { MetaReadinessNotice } from "@/components/admin/campaigns/MetaReadinessNotice";
import { CampaignStatusBadge } from "@/components/admin/creative/CreativeStatusBadge";
import { createCampaignDraft } from "@/lib/actions/campaigns";
import { META_OBJECTIVE_LABELS } from "@/lib/ai/campaign-strategy";
import { getAiProviderReadiness } from "@/lib/ai/usage";
import { requirePermission } from "@/lib/auth/session";
import { getMetaConnectionState } from "@/lib/integrations/meta";
import { listCampaigns } from "@/lib/services/campaigns";
import { getClientMetaAssignments } from "@/lib/services/meta-assets";
import { getClientById } from "@/lib/services/clients";
import { listProducts } from "@/lib/services/products";

export default async function ClientCampaignsPage({ params }: PageProps<"/admin/clients/[id]/campaigns">) {
  const profile = await requirePermission("campaigns");
  const { id } = await params;
  const client = await getClientById(id);
  if (!client) notFound();

  const [campaigns, products, readiness, meta, assignments] = await Promise.all([
    listCampaigns(client.id),
    listProducts(client.id),
    getAiProviderReadiness(),
    getMetaConnectionState(),
    getClientMetaAssignments(client.id),
  ]);
  const productName = new Map(products.map((p) => [p.id, p.name]));

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/admin/clients/${client.id}`} className="text-sm text-brand-blue hover:underline">
          &larr; {client.business_name}
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Campaigns</h1>
        <p className="mt-1 text-sm text-slate-500">Internal Meta campaign drafts. Nothing is sent to Meta from this page.</p>
      </div>

      <MetaReadinessNotice
        metaConnected={meta.connected}
        assignments={assignments}
        clientId={client.id}
        isSuperAdmin={profile.role === "admin"}
      />

      <Card>
        <CardHeader>
          <CardTitle>New Campaign Draft</CardTitle>
        </CardHeader>
        <CardContent className="py-6">
          <NewCampaignForm
            action={createCampaignDraft.bind(null, client.id)}
            products={products.filter((p) => p.status !== "archived").map((p) => ({ id: p.id, name: p.name }))}
            claudeReady={readiness.claude === "ready"}
            assignments={assignments}
          />
        </CardContent>
      </Card>

      <Card>
        {campaigns.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">No campaigns yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Campaign</th>
                  <th className="px-5 py-3">Product</th>
                  <th className="px-5 py-3">Objective</th>
                  <th className="px-5 py-3">Daily Budget</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {campaigns.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <Link href={`/admin/clients/${client.id}/campaigns/${c.id}`} className="font-medium text-slate-900 hover:underline">
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{productName.get(c.product_id) ?? "—"}</td>
                    <td className="px-5 py-3 text-slate-600">{META_OBJECTIVE_LABELS[c.objective]}</td>
                    <td className="px-5 py-3 text-slate-600">
                      {c.daily_budget !== null ? `${c.daily_budget.toLocaleString()} ${c.budget_currency}` : "—"}
                    </td>
                    <td className="px-5 py-3">
                      <CampaignStatusBadge status={c.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
