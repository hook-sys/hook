import type { MarketingReport } from "@/lib/ai/marketing-report";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation/ids";

export interface AiReportSummary {
  id: string;
  range_key: string;
  since: string;
  until: string;
  model: string;
  estimated_cost_usd: number | null;
  created_at: string;
}

export interface AiReport extends AiReportSummary {
  client_id: string;
  facts: unknown;
  report: MarketingReport;
}

// Caller's session: RLS limits rows to staff with `analytics` on an assigned client.
export async function listReports(clientId: string): Promise<AiReportSummary[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ai_reports")
    .select("id, range_key, since, until, model, estimated_cost_usd, created_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(30);
  return (data ?? []) as AiReportSummary[];
}

export async function getReport(clientId: string, reportId: string): Promise<AiReport | null> {
  if (!isUuid(clientId) || !isUuid(reportId)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("ai_reports").select("*").eq("client_id", clientId).eq("id", reportId).maybeSingle();
  return (data as AiReport | null) ?? null;
}
