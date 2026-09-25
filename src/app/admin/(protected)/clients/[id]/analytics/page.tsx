import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ActionButton } from "@/components/admin/ActionButton";
import { KpiCard } from "@/components/admin/KpiCard";
import { MetricsTable } from "@/components/admin/analytics/MetricsTable";
import { ReportView } from "@/components/admin/analytics/ReportView";
import { MetaReadinessNotice } from "@/components/admin/campaigns/MetaReadinessNotice";
import { ProviderBanner } from "@/components/admin/ProviderBanner";
import { generateReportAction, refreshAnalyticsAction } from "@/lib/actions/analytics";
import { getAiProviderReadiness } from "@/lib/ai/usage";
import { requirePermission } from "@/lib/auth/session";
import { AnalyticsUnavailableError } from "@/lib/integrations/meta-insights";
import { getMetaConnectionState } from "@/lib/integrations/meta";
import { IntegrationError } from "@/lib/integrations/types";
import { DATE_PRESETS, DATE_PRESET_LABELS, formatMetric, pctChange, resolveRange } from "@/lib/meta/insights";
import { getClientMetaAssignments } from "@/lib/services/meta-assets";
import { getClientById } from "@/lib/services/clients";
import { getReport, listReports } from "@/lib/services/reports";
import { isUuid } from "@/lib/validation/ids";
import { loadAnalytics } from "@/lib/workflows/analytics";

export const maxDuration = 300;

function change(current: number | null, previous: number | null | undefined) {
  const pct = pctChange(current, previous ?? null);
  return pct === null ? undefined : `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% vs previous period`;
}

export default async function AnalyticsPage({ params, searchParams }: PageProps<"/admin/clients/[id]/analytics">) {
  const profile = await requirePermission("analytics");
  const isSuperAdmin = profile.role === "admin";
  const { id } = await params;
  const client = await getClientById(id);
  if (!client) notFound();

  const query = await searchParams;
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  const presetParam = str(query.preset) ?? "last_7d";
  const resolved = resolveRange(presetParam, str(query.since), str(query.until));
  const fallback = resolveRange("last_7d");
  const range = resolved.ok ? resolved.range : fallback.ok ? fallback.range : null;
  const rangeError = resolved.ok ? null : resolved.error;
  const [meta, assignments, readiness, reports] = await Promise.all([
    getMetaConnectionState(),
    getClientMetaAssignments(client.id),
    getAiProviderReadiness(),
    listReports(client.id),
  ]);
  // Only ad accounts assigned to this client; the requested one must be among them.
  const requestedAccount = str(query.account);
  const account =
    assignments.adAccounts.find((a) => a.id === requestedAccount) ?? assignments.adAccounts[0] ?? null;
  const rangeFields: Record<string, string> = {
    ...(range
      ? range.preset
        ? { preset: range.preset }
        : { preset: "custom", since: range.since, until: range.until }
      : { preset: "last_7d" }),
    ...(account ? { account: account.id } : {}),
  };
  const reportId = str(query.report);
  const selectedReport = reportId && isUuid(reportId) ? await getReport(client.id, reportId) : null;

  let data: Awaited<ReturnType<typeof loadAnalytics>> | null = null;
  let loadError: string | null = null;
  if (range && meta.connected && account) {
    try {
      data = await loadAnalytics(profile, client.id, range, false, account.id);
    } catch (error) {
      loadError =
        error instanceof AnalyticsUnavailableError || error instanceof IntegrationError ? error.message : "Could not load Meta insights.";
    }
  }
  const snap = data?.snapshot;
  const a = snap?.account ?? null;
  const prev = snap?.previous?.account;
  const cur = snap?.currency ?? null;
  const statusById = new Map(snap?.campaignInfo.map((c) => [c.id, c]) ?? []);
  const canReport = readiness.brain === "ready" && !!data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>
        <p className="mt-1 text-sm text-slate-500">
          Live Meta Ads data from this client&apos;s assigned ad account{account ? ` (${account.name})` : ""}. Read-only.
        </p>
      </div>

      <MetaReadinessNotice metaConnected={meta.connected} assignments={assignments} clientId={client.id} isSuperAdmin={isSuperAdmin} />

      <Card>
        <form method="get" className="flex flex-col gap-3 p-5 sm:flex-row sm:items-end">
          {assignments.adAccounts.length > 1 && (
            <div className="sm:w-56">
              <label htmlFor="account" className="mb-1.5 block text-sm font-medium text-slate-700">Ad Account</label>
              <Select id="account" name="account" defaultValue={account?.id}>
                {assignments.adAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <div className="sm:w-44">
            <label htmlFor="preset" className="mb-1.5 block text-sm font-medium text-slate-700">Time Range</label>
            <Select id="preset" name="preset" defaultValue={range?.preset ?? "custom"}>
              {[...DATE_PRESETS, "custom" as const].map((p) => (
                <option key={p} value={p}>
                  {DATE_PRESET_LABELS[p]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label htmlFor="since" className="mb-1.5 block text-sm font-medium text-slate-700">Custom from</label>
            <Input id="since" name="since" type="date" defaultValue={range && !range.preset ? range.since : ""} />
          </div>
          <div>
            <label htmlFor="until" className="mb-1.5 block text-sm font-medium text-slate-700">Custom to</label>
            <Input id="until" name="until" type="date" defaultValue={range && !range.preset ? range.until : ""} />
          </div>
          <Button type="submit" variant="secondary">Apply</Button>
          {data && (
            <div className="sm:ml-auto">
              <p className="mb-1 text-xs text-slate-400">
                {range?.since} → {range?.until} · fetched {new Date(snap!.fetchedAt).toLocaleString()}
              </p>
            </div>
          )}
        </form>
        {data && (
          <div className="px-5 pb-4">
            <ActionButton action={refreshAnalyticsAction.bind(null, client.id)} fields={rangeFields} label="Refresh from Meta" pendingLabel="Refreshing..." />
          </div>
        )}
        {rangeError && <p className="px-5 pb-4 text-sm text-red-600">{rangeError} Showing Last 7 Days.</p>}
      </Card>

      {loadError && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      )}

      {data && snap && (
        <>
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-900">Overview</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard label="Spend" value={formatMetric(a?.spend ?? null, "money", cur)} hint={change(a?.spend ?? null, prev?.spend)} />
              <KpiCard label="Impressions" value={formatMetric(a?.impressions ?? null, "int")} hint={change(a?.impressions ?? null, prev?.impressions)} />
              <KpiCard label="Reach" value={formatMetric(a?.reach ?? null, "int")} />
              <KpiCard label="Frequency" value={formatMetric(a?.frequency ?? null, "dec")} />
              <KpiCard label="Clicks" value={formatMetric(a?.clicks ?? null, "int")} hint={change(a?.clicks ?? null, prev?.clicks)} />
              <KpiCard label="CTR" value={formatMetric(a?.ctr ?? null, "pct")} />
              <KpiCard label="CPC" value={formatMetric(a?.cpc ?? null, "money", cur)} />
              <KpiCard label="CPM" value={formatMetric(a?.cpm ?? null, "money", cur)} />
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-900">Conversions</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <KpiCard label="Conversions (purchases + leads)" value={formatMetric(a?.conversions ?? null, "int")} />
              <KpiCard label="Purchases" value={formatMetric(a?.purchases ?? null, "int")} hint={change(a?.purchases ?? null, prev?.purchases)} />
              <KpiCard label="Conversion Value" value={formatMetric(a?.purchaseValue ?? null, "money", cur)} />
              <KpiCard label="Leads" value={formatMetric(a?.leads ?? null, "int")} />
              <KpiCard label="ROAS" value={formatMetric(a?.roas ?? null, "ratio")} />
            </div>
          </section>

          <Card>
            <CardHeader>
              <CardTitle>Campaign Performance</CardTitle>
            </CardHeader>
            <MetricsTable
              rows={[...snap.campaigns].sort((x, y) => (y.spend ?? 0) - (x.spend ?? 0))}
              currency={cur}
              nameLabel="Campaign"
              extra={{ label: "Status", value: (r) => (r.id ? (statusById.get(r.id)?.effectiveStatus ?? "N/A") : "N/A") }}
            />
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Spend by Campaign</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 py-4">
              {snap.campaigns.filter((c) => (c.spend ?? 0) > 0).length === 0 ? (
                <p className="text-sm text-slate-500">No spend in this period.</p>
              ) : (
                (() => {
                  const rows = [...snap.campaigns].filter((c) => (c.spend ?? 0) > 0).sort((x, y) => (y.spend ?? 0) - (x.spend ?? 0)).slice(0, 12);
                  const max = rows[0]?.spend ?? 1;
                  return rows.map((r) => (
                    <div key={r.id ?? r.name} className="text-xs">
                      <div className="flex justify-between gap-2 text-slate-600">
                        <span className="truncate">{r.name}</span>
                        <span>{formatMetric(r.spend, "money", cur)}</span>
                      </div>
                      <div className="mt-1 h-2 rounded bg-slate-100">
                        <div className="h-2 rounded bg-brand-blue" style={{ width: `${Math.max(2, ((r.spend ?? 0) / max) * 100)}%` }} />
                      </div>
                    </div>
                  ));
                })()
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ad Performance</CardTitle>
            </CardHeader>
            <MetricsTable rows={[...snap.ads].sort((x, y) => (y.spend ?? 0) - (x.spend ?? 0)).slice(0, 50)} currency={cur} nameLabel="Ad" />
          </Card>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Product Performance</CardTitle>
              </CardHeader>
              <MetricsTable
                rows={data.productRollups}
                currency={cur}
                nameLabel="Product"
                empty="No campaigns in this period."
              />
              <p className="px-5 pb-4 text-xs text-slate-400">Mapped only for campaigns created from this system; reach/frequency N/A in rollups.</p>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Funnel / HATOG Performance</CardTitle>
              </CardHeader>
              <MetricsTable rows={data.hatogRollups} currency={cur} nameLabel="HATOG Stage" empty="No campaigns in this period." />
            </Card>
          </div>
        </>
      )}

      <Card id="ai-reports">
        <CardHeader>
          <CardTitle>AI Marketing Reports</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 py-6">
          <ProviderBanner provider={readiness.brainLabel} state={readiness.brain} isSuperAdmin={isSuperAdmin} />
          {canReport ? (
            <ActionButton
              action={generateReportAction.bind(null, client.id)}
              fields={rangeFields}
              label={`Generate Report (${range ? DATE_PRESET_LABELS[range.preset ?? "custom"] : ""})`}
              pendingLabel="Analyzing… (can take a minute)"
              variant="primary"
            />
          ) : (
            readiness.brain === "ready" && <p className="text-sm text-slate-500">Reports need Meta data for the selected range.</p>
          )}

          {reports.length > 0 && (
            <ul className="divide-y divide-slate-100 rounded-md border border-slate-100 text-sm">
              {reports.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <span className="text-slate-700">
                    {r.since} → {r.until} · {new Date(r.created_at).toLocaleString()}
                  </span>
                  <a
                    href={`?${new URLSearchParams({ ...(r.range_key.startsWith("custom:") ? { preset: "custom", since: r.since, until: r.until } : { preset: r.range_key }), report: r.id })}#ai-reports`}
                    className="font-medium text-brand-blue hover:underline"
                  >
                    {selectedReport?.id === r.id ? "Viewing" : "View"}
                  </a>
                </li>
              ))}
            </ul>
          )}

          {selectedReport && (
            <div className="rounded-md border border-slate-200 p-4">
              <p className="mb-3 text-xs text-slate-500">
                Report for {selectedReport.since} → {selectedReport.until} · {selectedReport.model}
                {canReport && " · Use Generate Report to regenerate for the current range."}
              </p>
              <ReportView report={selectedReport.report} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
