import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionButton } from "@/components/admin/ActionButton";
import { AudienceForm } from "@/components/admin/audiences/AudienceForm";
import { MetaReadinessNotice } from "@/components/admin/campaigns/MetaReadinessNotice";
import {
  addRecommendedAudience,
  createAudienceDefinition,
  createAudienceInMeta,
  setAudienceArchived,
  syncAudienceHealth,
  updateAudienceDefinition,
} from "@/lib/actions/audiences";
import { requirePermission } from "@/lib/auth/session";
import { getMetaConnectionState, isMetaPublishingEnabled } from "@/lib/integrations/meta";
import {
  AUDIENCE_HEALTH_LABELS,
  AUDIENCE_RECOMMENDATIONS,
  AUDIENCE_STATUS_LABELS,
  AUDIENCE_TYPE_LABELS,
  NOT_AUTOMATED_MESSAGE,
  NOT_AVAILABLE_MESSAGE,
  audienceHealth,
  isAutomatedAudienceType,
  planMetaAudience,
} from "@/lib/meta/audiences";
import { listAudiences } from "@/lib/services/audiences";
import { getClientMetaAssets } from "@/lib/services/client-meta-assets";
import { getClientById } from "@/lib/services/clients";
import { HATOG_STAGE_LABELS } from "@/types/ai";

const HEALTH_VARIANT = { not_in_meta: "slate", not_synced: "amber", ready: "green", too_small: "amber", issue: "red", archived: "slate" } as const;

export default async function AudiencesPage({ params, searchParams }: PageProps<"/admin/clients/[id]/audiences">) {
  const profile = await requirePermission("ai_ads");
  const isSuperAdmin = profile.role === "admin";
  const { id } = await params;
  const client = await getClientById(id);
  if (!client) notFound();

  const showArchived = (await searchParams).archived === "1";
  const [audiences, meta, assets] = await Promise.all([
    listAudiences(client.id, { includeArchived: showArchived }),
    getMetaConnectionState(),
    getClientMetaAssets(client.id),
  ]);
  const refs = {
    adAccountId: assets?.ad_account_id ?? null,
    pageId: assets?.facebook_page_id ?? null,
    instagramId: assets?.instagram_account_id ?? null,
  };
  const publishingEnabled = isMetaPublishingEnabled();

  // Why "Create in Meta" is unavailable for a definition (null = available).
  const createBlocker = (a: (typeof audiences)[number]): string | null => {
    if (!isAutomatedAudienceType(a.audience_type)) return NOT_AUTOMATED_MESSAGE;
    if (!meta.connected) return "Connect Meta.";
    if (!publishingEnabled) return NOT_AVAILABLE_MESSAGE;
    const plan = planMetaAudience(a, refs);
    return plan.ok ? null : plan.error;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Audiences</h1>
        <p className="mt-1 text-sm text-slate-500">
          Custom Audience definitions for this client&apos;s own ad account. Creating an audience never launches a campaign or spends money.
        </p>
      </div>

      <MetaReadinessNotice metaConnected={meta.connected} assets={assets} clientId={client.id} isSuperAdmin={isSuperAdmin} />

      <Card>
        <CardHeader>
          <CardTitle>HATOG Audience Recommendations</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Stage</th>
                <th className="px-5 py-3">Temperature</th>
                <th className="px-5 py-3">Audience</th>
                <th className="px-5 py-3">Why</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {AUDIENCE_RECOMMENDATIONS.map((rec, i) => (
                <tr key={`${rec.stage}-${i}`}>
                  <td className="px-5 py-3 text-slate-700">{HATOG_STAGE_LABELS[rec.stage]}</td>
                  <td className="px-5 py-3 text-slate-600">{rec.temperature}</td>
                  <td className="px-5 py-3 text-slate-600">
                    {rec.type ? `${AUDIENCE_TYPE_LABELS[rec.type]} · ${rec.retentionDays}d` : "Broad / interest targeting"}
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-500">{rec.rationale}</td>
                  <td className="px-5 py-3">
                    {rec.type && (
                      <ActionButton action={addRecommendedAudience.bind(null, client.id, i)} label="Add" pendingLabel="Adding..." />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>New Audience Definition</CardTitle>
        </CardHeader>
        <CardContent className="py-6">
          <AudienceForm action={createAudienceDefinition.bind(null, client.id)} submitLabel="Save Definition" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Audiences</CardTitle>
          <a href={showArchived ? "?" : "?archived=1"} className="text-sm text-brand-blue hover:underline">
            {showArchived ? "Hide archived" : "Show archived"}
          </a>
        </CardHeader>
        {audiences.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">No audience definitions yet.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {audiences.map((a) => {
              const health = audienceHealth(a);
              const blocker = createBlocker(a);
              return (
                <li key={a.id} className="space-y-3 px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900">{a.name}</p>
                      <p className="text-xs text-slate-500">
                        {AUDIENCE_TYPE_LABELS[a.audience_type]} · {a.retention_days} days
                        {a.hatog_stage ? ` · ${HATOG_STAGE_LABELS[a.hatog_stage]}` : ""}
                        {a.meta_audience_id ? ` · Meta ID ${a.meta_audience_id}` : ""}
                      </p>
                      {a.description && <p className="mt-1 text-xs text-slate-500">{a.description}</p>}
                      {a.approximate_count_upper !== null && (
                        <p className="mt-1 text-xs text-slate-600">
                          Size: {a.approximate_count_lower?.toLocaleString() ?? "?"}–{a.approximate_count_upper.toLocaleString()}
                          {a.delivery_status_description ? ` · ${a.delivery_status_description}` : ""}
                        </p>
                      )}
                      {a.status === "error" && a.error && <p className="mt-1 text-xs text-red-600">{a.error}</p>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="slate">{AUDIENCE_STATUS_LABELS[a.status]}</Badge>
                      <Badge variant={HEALTH_VARIANT[health]}>{AUDIENCE_HEALTH_LABELS[health]}</Badge>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-start gap-2">
                    {isSuperAdmin && !a.meta_audience_id && a.status !== "archived" &&
                      (blocker ? (
                        <span className="inline-flex h-8 items-center rounded-md bg-slate-100 px-3 text-xs text-slate-500">{blocker}</span>
                      ) : (
                        <ActionButton
                          action={createAudienceInMeta.bind(null, client.id, a.id)}
                          label="Create in Meta"
                          pendingLabel="Creating..."
                          variant="primary"
                          confirmMessage={`Create "${a.name}" in the client's Meta ad account? No campaign or spend will start.`}
                        />
                      ))}
                    {a.meta_audience_id && meta.connected && (
                      <ActionButton action={syncAudienceHealth.bind(null, client.id, a.id)} label="Sync Status" pendingLabel="Syncing..." />
                    )}
                    {a.status === "archived" ? (
                      <ActionButton action={setAudienceArchived.bind(null, client.id, a.id, false)} label="Restore" pendingLabel="Restoring..." />
                    ) : (
                      <ActionButton action={setAudienceArchived.bind(null, client.id, a.id, true)} label="Archive" pendingLabel="Archiving..." variant="ghost" />
                    )}
                  </div>
                  {!a.meta_audience_id && a.status === "draft" && (
                    <details className="text-sm">
                      <summary className="cursor-pointer text-xs font-medium text-slate-600">Edit definition</summary>
                      <div className="mt-3">
                        <AudienceForm
                          action={updateAudienceDefinition.bind(null, client.id, a.id)}
                          submitLabel="Save"
                          initial={{
                            name: a.name,
                            audience_type: a.audience_type,
                            retention_days: String(a.retention_days),
                            hatog_stage: a.hatog_stage ?? "",
                            source: a.source ?? "",
                            description: a.description ?? "",
                          }}
                        />
                      </div>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
