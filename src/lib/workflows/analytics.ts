import { estimateCostUsd } from "@/lib/ai/providers/common";
import { generateAndLog } from "@/lib/ai/generate";
import {
  MARKETING_REPORT_SCHEMA,
  buildReportFacts,
  buildReportPrompt,
  validateMarketingReport,
  type MarketingReport,
} from "@/lib/ai/marketing-report";
import { getClientInsights } from "@/lib/integrations/meta-insights";
import { mapToInternal, type InsightRange, type InsightsSnapshot } from "@/lib/meta/insights";
import { getClientById } from "@/lib/services/clients";
import { listProducts } from "@/lib/services/products";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AdminProfile } from "@/types/admin";

// Server-only analytics workflows shared by the Analytics page and the AI agent.
// Callers must have checked the `analytics` permission.

export async function loadAnalytics(
  profile: AdminProfile,
  clientId: string,
  range: InsightRange,
  refresh = false,
  adAccountId: string | null = null
) {
  const client = await getClientById(clientId); // session read: RLS blocks unassigned clients
  if (!client) throw new Error("Client not found.");
  const insights = await getClientInsights(profile.id, client.id, range, { refresh, adAccountId });
  const { snapshot, cached } = insights;

  // Internal campaign -> product/HATOG mapping for this client only (service role read after
  // the access checks above; only IDs, product and stage are used).
  const [{ data: internal }, products] = await Promise.all([
    createAdminClient()
      .from("campaigns")
      .select("meta_campaign_id, product_id, hatog_stage")
      .eq("client_id", client.id)
      .not("meta_campaign_id", "is", null),
    listProducts(client.id),
  ]);
  const mapped = mapToInternal(snapshot.campaigns, internal ?? [], new Map(products.map((p) => [p.id, p.name])));
  return { client, snapshot, adAccountId: insights.adAccountId, cached, ...mapped };
}

export async function generateMarketingReport(
  profile: AdminProfile,
  clientId: string,
  range: InsightRange,
  adAccountId: string | null = null
): Promise<{ reportId: string; report: MarketingReport }> {
  const data = await loadAnalytics(profile, clientId, range, false, adAccountId);
  const facts = buildReportFacts({
    snapshot: data.snapshot as InsightsSnapshot,
    campaignMapping: data.mapping,
    productRollups: data.productRollups,
    hatogRollups: data.hatogRollups,
  });
  const prompt = buildReportPrompt(facts, data.client.business_name);

  const result = await generateAndLog<MarketingReport>({
    clientId: data.client.id,
    actorId: profile.id,
    generationType: "marketing_report",
    ...prompt,
    schema: MARKETING_REPORT_SCHEMA,
    maxTokens: 12000,
    timeoutMs: 240_000,
    validate: (value) => {
      const v = validateMarketingReport(value, facts);
      return v.ok ? { ok: true, value: v.report } : v;
    },
  });

  // Written with the service role so reports can't be fabricated through the API.
  const { data: row, error } = await createAdminClient()
    .from("ai_reports")
    .insert({
      client_id: data.client.id,
      ad_account_id: data.adAccountId,
      range_key: range.key,
      since: range.since,
      until: range.until,
      facts,
      report: result.data,
      model: result.model,
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      estimated_cost_usd: estimateCostUsd(result.provider, result.model, result.inputTokens, result.outputTokens),
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (error || !row) throw new Error("The report was generated, but saving it failed.");
  return { reportId: row.id, report: result.data };
}
