import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionButton } from "@/components/admin/ActionButton";
import { CampaignCreativePicker } from "@/components/admin/campaigns/CampaignCreativePicker";
import { CampaignDetailsForm } from "@/components/admin/campaigns/CampaignDetailsForm";
import { MetaReadinessNotice } from "@/components/admin/campaigns/MetaReadinessNotice";
import { PublishPanel } from "@/components/admin/campaigns/PublishPanel";
import { CampaignStatusBadge } from "@/components/admin/creative/CreativeStatusBadge";
import {
  publishCampaign,
  setCampaignMetaAssets,
  setCampaignCreatives,
  setCampaignStatus,
  updateCampaignDetails,
} from "@/lib/actions/campaigns";
import { requirePermission } from "@/lib/auth/session";
import { CREATIVE_TYPE_LABELS } from "@/lib/creative/options";
import { CAMPAIGN_STATUS_LABELS, canTransitionCampaign, type CampaignStatus } from "@/lib/creative/status";
import { getMetaConnectionState, isMetaPublishingEnabled } from "@/lib/integrations/meta";
import { publishBlockers } from "@/lib/meta/ads-payloads";
import { getCampaign, getCampaignCreativeIds } from "@/lib/services/campaigns";
import { getClientMetaAssignments } from "@/lib/services/meta-assets";
import { CampaignMetaAssetsForm } from "@/components/admin/campaigns/CampaignMetaAssetsForm";
import { getClientById } from "@/lib/services/clients";
import { getCreativesByIds, listCreatives } from "@/lib/services/creatives";
import { getProduct } from "@/lib/services/products";
import { HATOG_STAGE_LABELS } from "@/types/ai";

const STATUS_ACTIONS: { to: CampaignStatus; label: string }[] = [
  { to: "ready_for_review", label: "Submit for Review" },
  { to: "approved", label: "Approve" },
  { to: "draft", label: "Back to Draft" },
  { to: "archived", label: "Archive" },
];

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap text-sm text-slate-700">{children}</dd>
    </div>
  );
}

export default async function CampaignDetailPage({ params }: PageProps<"/admin/clients/[id]/campaigns/[campaignId]">) {
  const profile = await requirePermission("campaigns");
  const isSuperAdmin = profile.role === "admin";
  const { id, campaignId } = await params;

  const client = await getClientById(id);
  if (!client) notFound();
  // Scoped by client_id: a campaign ID from another client 404s even for super admins.
  const campaign = await getCampaign(client.id, campaignId);
  if (!campaign) notFound();

  const [product, selectedIds, readyCreatives, meta, assignments] = await Promise.all([
    getProduct(client.id, campaign.product_id),
    getCampaignCreativeIds(client.id, campaign.id),
    listCreatives(client.id, { status: "ready" }),
    getMetaConnectionState(),
    getClientMetaAssignments(client.id),
  ]);
  const selected = await getCreativesByIds(client.id, selectedIds);
  const editable = campaign.status === "draft" || campaign.status === "ready_for_review";
  const s = campaign.strategy;

  // Selected creatives stay listed even if archived later, so the selection is never hidden.
  const pickerCreatives = [...readyCreatives, ...selected.filter((c) => !readyCreatives.some((r) => r.id === c.id))].map((c) => ({
    id: c.id,
    media: c.media,
    previewUrl: c.status === "ready" ? c.asset_url : null,
    label: `${c.brief.concept ?? CREATIVE_TYPE_LABELS[c.creative_type]} (${c.media}, ${c.format}${c.status === "ready" ? "" : `, ${c.status}`})`,
  }));

  const blockers = isSuperAdmin
    ? publishBlockers({
        campaign,
        productUrl: product?.product_url ?? null,
        creatives: selected,
        metaConnected: meta.connected,
        publishingEnabled: isMetaPublishingEnabled(),
      })
    : [];

  const allowedTransitions = STATUS_ACTIONS.filter((a) => canTransitionCampaign(campaign.status, a.to, profile.role));
  const assetName = (list: { id: string; name: string }[], id: string | null) => (id ? (list.find((a) => a.id === id)?.name ?? id) : "—");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href={`/admin/clients/${client.id}/campaigns`} className="text-sm text-brand-blue hover:underline">
            &larr; {client.business_name} campaigns
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">{campaign.name}</h1>
            <CampaignStatusBadge status={campaign.status} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {product?.name ?? "Product"}
            {campaign.hatog_stage ? ` · ${HATOG_STAGE_LABELS[campaign.hatog_stage]}` : ""}
          </p>
        </div>
        {allowedTransitions.length > 0 && (
          <div className="flex flex-wrap items-start gap-2">
            {allowedTransitions.map((a) => (
              <ActionButton
                key={a.to}
                action={setCampaignStatus.bind(null, client.id, campaign.id, a.to)}
                label={a.label}
                pendingLabel="Updating..."
                variant={a.to === "archived" ? "ghost" : a.to === "approved" ? "primary" : "outline"}
              />
            ))}
          </div>
        )}
      </div>

      <MetaReadinessNotice metaConnected={meta.connected} assignments={assignments} clientId={client.id} isSuperAdmin={isSuperAdmin} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Campaign & Ad Copy</CardTitle>
            </CardHeader>
            <CardContent className="py-6">
              <CampaignDetailsForm
                action={updateCampaignDetails.bind(null, client.id, campaign.id)}
                editable={editable}
                initial={{
                  name: campaign.name,
                  objective: campaign.objective,
                  daily_budget: campaign.daily_budget?.toString() ?? "",
                  budget_currency: campaign.budget_currency,
                  primary_text: s.primary_text ?? "",
                  headline: s.headline ?? "",
                  description: s.description ?? "",
                  cta: s.cta ?? "",
                }}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Creatives</CardTitle>
            </CardHeader>
            <CardContent className="py-6">
              <CampaignCreativePicker
                action={setCampaignCreatives.bind(null, client.id, campaign.id)}
                creatives={pickerCreatives}
                selectedIds={selectedIds}
                editable={editable}
              />
            </CardContent>
          </Card>

          {s.target_audience && (
            <Card>
              <CardHeader>
                <CardTitle>AI Strategy</CardTitle>
              </CardHeader>
              <CardContent className="py-6">
                <dl className="grid gap-4 sm:grid-cols-2">
                  <Row label="Target Audience">
                    {s.target_audience.countries.join(", ")} · {s.target_audience.age_min}–{s.target_audience.age_max} ·{" "}
                    {s.target_audience.genders}
                    {s.target_audience.interests.length > 0 && `\nInterests: ${s.target_audience.interests.join(", ")}`}
                  </Row>
                  {s.audience_description && <Row label="Audience Description">{s.audience_description}</Row>}
                  {s.ad_angle && <Row label="Ad Angle">{s.ad_angle}</Row>}
                  {s.retargeting_suggestion && <Row label="Retargeting">{s.retargeting_suggestion}</Row>}
                  {s.budget_recommendation && (
                    <Row label="Budget Recommendation">
                      {s.budget_recommendation.daily_budget.toLocaleString()} {s.budget_recommendation.currency}/day for{" "}
                      {s.budget_recommendation.duration_days} days{"\n"}
                      {s.budget_recommendation.rationale}
                    </Row>
                  )}
                  {s.creative_recommendations && s.creative_recommendations.length > 0 && (
                    <Row label="Creative Recommendations">
                      <ul className="list-disc pl-4">
                        {s.creative_recommendations.map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    </Row>
                  )}
                </dl>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Meta Assets</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 py-6">
              <dl className="space-y-3">
                <Row label="Ad Account">{assetName(assignments.adAccounts, campaign.meta_ad_account_id)}</Row>
                <Row label="Facebook Page">{assetName(assignments.pages, campaign.meta_page_id)}</Row>
                <Row label="Instagram">{assetName(assignments.instagramAccounts, campaign.meta_instagram_account_id)}</Row>
                {campaign.meta_campaign_id && (
                  <Row label="Meta IDs">
                    Campaign {campaign.meta_campaign_id}
                    {"\n"}Ad set {campaign.meta_adset_id}
                    {campaign.meta_ad_ids.length > 0 && `\nAds ${campaign.meta_ad_ids.join(", ")}`}
                  </Row>
                )}
              </dl>
              <p className="text-xs text-slate-400">Only assets assigned to this client can be used; other assets are rejected.</p>
              {editable && (
                <CampaignMetaAssetsForm
                  action={setCampaignMetaAssets.bind(null, client.id, campaign.id)}
                  assignments={assignments}
                  initial={{
                    adAccountId: campaign.meta_ad_account_id,
                    pageId: campaign.meta_page_id,
                    instagramAccountId: campaign.meta_instagram_account_id,
                  }}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 py-6 text-sm text-slate-600">
              <p>
                Current: <strong>{CAMPAIGN_STATUS_LABELS[campaign.status]}</strong>
              </p>
              <p className="text-xs text-slate-400">
                {isSuperAdmin
                  ? "Published and Paused are set only after Meta confirms a real campaign."
                  : "You can submit drafts for review. A super admin approves and publishes."}
              </p>
            </CardContent>
          </Card>

          {isSuperAdmin && (
            <Card>
              <CardHeader>
                <CardTitle>Publish to Meta</CardTitle>
              </CardHeader>
              <CardContent className="py-6">
                {campaign.meta_campaign_id ? (
                  <p className="text-sm text-slate-600">Created in Meta on {new Date(campaign.published_at!).toLocaleString()}.</p>
                ) : (
                  <PublishPanel action={publishCampaign.bind(null, client.id, campaign.id)} blockers={blockers} />
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
