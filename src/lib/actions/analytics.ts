"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { aiErrorMessage } from "@/lib/ai/generate";
import { requirePermission } from "@/lib/auth/session";
import { AnalyticsUnavailableError } from "@/lib/integrations/meta-insights";
import { IntegrationError } from "@/lib/integrations/types";
import { resolveRange } from "@/lib/meta/insights";
import { generateMarketingReport, loadAnalytics } from "@/lib/workflows/analytics";

export interface AnalyticsActionState {
  status: "idle" | "error" | "success";
  message?: string;
}

const analyticsPath = (clientId: string) => `/admin/clients/${clientId}/analytics`;

function readRange(formData: FormData) {
  return resolveRange(
    String(formData.get("preset") ?? ""),
    String(formData.get("since") ?? "") || undefined,
    String(formData.get("until") ?? "") || undefined
  );
}

export async function refreshAnalyticsAction(
  clientId: string,
  _prev: AnalyticsActionState,
  formData: FormData
): Promise<AnalyticsActionState> {
  const profile = await requirePermission("analytics");
  const range = readRange(formData);
  if (!range.ok) return { status: "error", message: range.error };
  try {
    const result = await loadAnalytics(profile, clientId, range.range, true);
    revalidatePath(analyticsPath(clientId));
    return { status: "success", message: result.cached ? "Data was refreshed less than 2 minutes ago." : "Refreshed from Meta." };
  } catch (error) {
    if (error instanceof AnalyticsUnavailableError || error instanceof IntegrationError) return { status: "error", message: error.message };
    return { status: "error", message: "Could not refresh Meta data." };
  }
}

export async function generateReportAction(
  clientId: string,
  _prev: AnalyticsActionState,
  formData: FormData
): Promise<AnalyticsActionState> {
  const profile = await requirePermission("analytics");
  const range = readRange(formData);
  if (!range.ok) return { status: "error", message: range.error };
  let reportId: string;
  try {
    reportId = (await generateMarketingReport(profile, clientId, range.range)).reportId;
  } catch (error) {
    if (error instanceof AnalyticsUnavailableError) return { status: "error", message: error.message };
    return { status: "error", message: aiErrorMessage(error, "Could not generate the report.") };
  }
  revalidatePath(analyticsPath(clientId));
  const r = range.range;
  const query = new URLSearchParams(r.preset ? { preset: r.preset } : { preset: "custom", since: r.since, until: r.until });
  query.set("report", reportId);
  redirect(`${analyticsPath(clientId)}?${query}#ai-reports`);
}
