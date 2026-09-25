import { getMetaConnectionState, metaGraphGet } from "@/lib/integrations/meta";
import { IntegrationError } from "@/lib/integrations/types";
import {
  INSIGHT_FIELDS,
  normalizeRow,
  previousRange,
  type CampaignInfo,
  type InsightRange,
  type InsightsSnapshot,
  type MetricRow,
  type RawInsightRow,
} from "@/lib/meta/insights";
import { logEvent } from "@/lib/observability";
import { getClientMetaAssets } from "@/lib/services/client-meta-assets";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Server-only. Reads Meta insights for the CLIENT'S OWN assigned ad account only. Callers
// must already have checked the `analytics` permission; the assignment row is read with the
// caller's session, so RLS blocks unassigned clients.

const MAX_PAGES = 10;
const PAGE_SIZE = "200";
const FRESH_MS_CURRENT = 15 * 60 * 1000; // ranges that include today
const FRESH_MS_PAST = 6 * 60 * 60 * 1000;
const MIN_REFRESH_MS = 2 * 60 * 1000;

export class AnalyticsUnavailableError extends Error {}

interface Paged<T> {
  data?: T[];
  paging?: { cursors?: { after?: string }; next?: string };
}

async function fetchAll<T>(path: string, params: Record<string, string>): Promise<T[]> {
  const rows: T[] = [];
  let after: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await metaGraphGet<Paged<T>>(path, { ...params, limit: PAGE_SIZE, ...(after ? { after } : {}) });
    rows.push(...(res.data ?? []));
    after = res.paging?.next ? res.paging.cursors?.after : undefined;
    if (!after) break;
  }
  return rows;
}

function rangeParams(range: InsightRange): Record<string, string> {
  return range.preset ? { date_preset: range.preset } : { time_range: JSON.stringify({ since: range.since, until: range.until }) };
}

async function fetchLevel(account: string, range: InsightRange, level: "account" | "campaign" | "ad"): Promise<RawInsightRow[]> {
  const extra = level === "campaign" ? ["campaign_id", "campaign_name"] : level === "ad" ? ["ad_id", "ad_name", "campaign_id"] : [];
  return fetchAll<RawInsightRow>(`/${account}/insights`, {
    level,
    fields: [...INSIGHT_FIELDS, ...extra].join(","),
    ...rangeParams(range),
  });
}

async function fetchSnapshot(account: string, range: InsightRange): Promise<InsightsSnapshot> {
  const prev = previousRange(range);
  const [accountRows, campaignRows, adRows, campaignList, prevAccount, prevCampaigns] = await Promise.all([
    fetchLevel(account, range, "account"),
    fetchLevel(account, range, "campaign"),
    fetchLevel(account, range, "ad"),
    fetchAll<{ id: string; name: string; status?: string; effective_status?: string; objective?: string }>(`/${account}/campaigns`, {
      fields: "id,name,status,effective_status,objective",
    }),
    fetchLevel(account, prev, "account"),
    fetchLevel(account, prev, "campaign"),
  ]);

  const campaignInfo: CampaignInfo[] = campaignList.map((c) => ({
    id: String(c.id),
    name: String(c.name ?? ""),
    status: c.status ?? null,
    effectiveStatus: c.effective_status ?? null,
    objective: c.objective ?? null,
  }));
  const currency = accountRows[0]?.account_currency ?? campaignRows[0]?.account_currency ?? null;

  return {
    range,
    currency: currency && /^[A-Z]{3}$/.test(currency) ? currency : null,
    account: accountRows[0] ? normalizeRow(accountRows[0], "account") : null,
    campaigns: campaignRows.map((r) => normalizeRow(r, "campaign")),
    ads: adRows.map((r) => normalizeRow(r, "ad")),
    campaignInfo,
    previous: {
      account: prevAccount[0] ? normalizeRow(prevAccount[0], "account") : null,
      campaigns: prevCampaigns.map((r) => normalizeRow(r, "campaign")),
    },
    fetchedAt: new Date().toISOString(),
  };
}

export async function getClientInsights(
  actorId: string,
  clientId: string,
  range: InsightRange,
  options: { refresh?: boolean } = {}
): Promise<{ snapshot: InsightsSnapshot; adAccountId: string; cached: boolean }> {
  const assets = await getClientMetaAssets(clientId);
  if (!assets?.ad_account_id) throw new AnalyticsUnavailableError("Assign Meta assets first.");
  const meta = await getMetaConnectionState();
  if (!meta.connected) throw new AnalyticsUnavailableError("Connect Meta.");
  const adAccountId = assets.ad_account_id;

  const supabase = await createClient();
  const { data: cachedRow } = await supabase
    .from("meta_insight_snapshots")
    .select("data, fetched_at")
    .eq("client_id", clientId)
    .eq("ad_account_id", adAccountId)
    .eq("range_key", range.key)
    .maybeSingle();

  const today = new Date().toISOString().slice(0, 10);
  const ttl = range.until >= today ? FRESH_MS_CURRENT : FRESH_MS_PAST;
  if (cachedRow) {
    const age = Date.now() - new Date(cachedRow.fetched_at).getTime();
    if (age < (options.refresh ? MIN_REFRESH_MS : ttl)) {
      return { snapshot: cachedRow.data as InsightsSnapshot, adAccountId, cached: true };
    }
  }

  const started = Date.now();
  let snapshot: InsightsSnapshot;
  try {
    snapshot = await fetchSnapshot(adAccountId, range);
  } catch (error) {
    logEvent("warn", {
      provider: "meta",
      operation: "insights",
      clientId,
      userId: actorId,
      status: "failed",
      durationMs: Date.now() - started,
      error: error instanceof Error ? error.message : "unknown",
    });
    if (error instanceof IntegrationError) throw error;
    throw new IntegrationError("Could not load Meta insights.");
  }
  logEvent("info", { provider: "meta", operation: "insights", clientId, userId: actorId, status: "succeeded", durationMs: Date.now() - started });

  // Stored with the service role (users cannot write snapshots).
  await createAdminClient()
    .from("meta_insight_snapshots")
    .upsert(
      {
        client_id: clientId,
        ad_account_id: adAccountId,
        range_key: range.key,
        since: range.since,
        until: range.until,
        data: snapshot,
        currency: snapshot.currency,
        fetched_at: snapshot.fetchedAt,
        fetched_by: actorId,
      },
      { onConflict: "client_id,ad_account_id,range_key" }
    );

  return { snapshot, adAccountId, cached: false };
}

export type { MetricRow };
