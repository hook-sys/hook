import { ToolError } from "@/lib/agent/runner";
import { buildAiContext } from "@/lib/ai/context";
import { getMetaConnectionState } from "@/lib/integrations/meta";
import { isGoogleDriveConnected } from "@/lib/integrations/google-drive";
import { resolveRange, type MetricRow } from "@/lib/meta/insights";
import { audienceHealth } from "@/lib/meta/audiences";
import { listAudiences } from "@/lib/services/audiences";
import { listCampaigns } from "@/lib/services/campaigns";
import { getClientMetaAssets } from "@/lib/services/client-meta-assets";
import { getClientById } from "@/lib/services/clients";
import { listCreatives } from "@/lib/services/creatives";
import { getClientAiKnowledge } from "@/lib/services/ai";
import { listProductAssets, listProducts } from "@/lib/services/products";
import { isUuid } from "@/lib/validation/ids";
import { loadAnalytics, generateMarketingReport } from "@/lib/workflows/analytics";
import { createCampaignDraftCore } from "@/lib/workflows/campaigns";
import { createContentCalendar, WorkflowError } from "@/lib/workflows/content-calendar";
import { generateCreativeBriefOnly, startCreativeGeneration } from "@/lib/workflows/creatives";
import { uploadCreativeToDrive } from "@/lib/workflows/drive-creatives";
import type { AdminProfile } from "@/types/admin";
import type { ContentPlatform } from "@/lib/ai/content-calendar";

// Server-only tool implementations. The client ID is fixed by the run (never taken from
// model input); every DB read uses the caller's session, so RLS applies exactly as in the
// UI. Model-supplied IDs are validated and scoped to this client.

const clip = (s: string | null | undefined, n: number) => (s ? (s.length > n ? `${s.slice(0, n)}…` : s) : null);
const round = (v: number | null) => (v === null ? null : Math.round(v * 100) / 100);
const compactMetrics = (r: MetricRow | null) =>
  r && { name: r.name, spend: round(r.spend), impressions: r.impressions, clicks: r.clicks, ctr: round(r.ctr), cpc: round(r.cpc), purchases: r.purchases, leads: r.leads, roas: round(r.roas) };

async function creativeInput(clientId: string, input: Record<string, unknown>) {
  const productId = String(input.product_id ?? "");
  if (!isUuid(productId)) throw new ToolError("Invalid product_id. Use an ID from get_products.");
  let reference = "";
  if (input.use_reference_image === true) {
    const image = (await listProductAssets(clientId, productId)).find((a) => a.asset_type === "image");
    reference = image?.id ?? "";
  }
  const duration = Number(input.duration_seconds ?? 0);
  return {
    product_id: productId,
    media: input.media,
    creative_type: input.creative_type,
    hatog_stage: input.hatog_stage,
    format: input.format,
    duration_seconds: input.media === "video" ? String(duration) : "",
    reference_asset_id: reference,
  };
}

export function createToolExecutor(profile: AdminProfile, clientId: string) {
  return async function executeTool(name: string, input: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case "get_client": {
        const [client, assets, meta, drive] = await Promise.all([
          getClientById(clientId),
          getClientMetaAssets(clientId),
          getMetaConnectionState(),
          isGoogleDriveConnected(),
        ]);
        if (!client) throw new ToolError("Client not accessible.");
        return {
          business_name: client.business_name,
          website: client.website,
          status: client.status,
          meta_connected: meta.connected,
          meta_ad_account_assigned: Boolean(assets?.ad_account_id),
          facebook_page_assigned: Boolean(assets?.facebook_page_id),
          google_drive_connected: drive,
        };
      }
      case "get_products": {
        const products = await listProducts(clientId, input.status === "active" ? { status: "active" } : {});
        return products.slice(0, 50).map((p) => ({
          id: p.id,
          name: p.name,
          status: p.status,
          category: p.category,
          price: p.price,
          discount_price: p.discount_price,
          currency: p.currency,
          short_description: clip(p.short_description, 300),
          features: p.features.slice(0, 10),
          benefits: p.benefits.slice(0, 10),
          product_url: p.product_url,
        }));
      }
      case "get_ai_knowledge": {
        const k = await getClientAiKnowledge(clientId);
        if (!k) return { note: "No AI knowledge saved for this client." };
        return Object.fromEntries(Object.entries(k).filter(([key]) => key !== "client_id").map(([key, v]) => [key, typeof v === "string" ? clip(v, 1200) : v]));
      }
      case "get_hatog": {
        const context = await buildAiContext({ clientId });
        return context.hatog.map((s) => ({ key: s.key, name: s.name, objective: s.objective, audience: clip(s.audience, 400), content_direction: clip(s.contentDirection, 600) }));
      }
      case "get_negative_prompts": {
        const context = await buildAiContext({ clientId });
        return context.negativePrompts;
      }
      case "get_creatives": {
        const status = typeof input.status === "string" && input.status !== "all" ? input.status : undefined;
        const creatives = await listCreatives(clientId, status ? { status } : {});
        return creatives.slice(0, 40).map((c) => ({
          id: c.id,
          product_id: c.product_id,
          media: c.media,
          type: c.creative_type,
          format: c.format,
          status: c.status,
          concept: clip(c.brief.concept, 200),
          in_drive: c.drive_upload_status === "uploaded",
        }));
      }
      case "generate_creative_brief": {
        const result = await generateCreativeBriefOnly(profile, clientId, await creativeInput(clientId, input));
        if (!result.ok) throw new ToolError(result.message);
        return result.value;
      }
      case "generate_creative": {
        const result = await startCreativeGeneration(profile, clientId, await creativeInput(clientId, input));
        if (!result.ok) throw new ToolError(result.message);
        return { creative_id: result.value.creativeId, status: "generating", note: result.message };
      }
      case "get_campaigns": {
        const campaigns = await listCampaigns(clientId);
        return campaigns.slice(0, 30).map((c) => ({ id: c.id, name: c.name, objective: c.objective, status: c.status, product_id: c.product_id, hatog_stage: c.hatog_stage, daily_budget: c.daily_budget, currency: c.budget_currency }));
      }
      case "create_campaign_draft": {
        const creativeIds = Array.isArray(input.creative_ids) ? input.creative_ids.map(String).filter(Boolean) : [];
        const result = await createCampaignDraftCore(profile, clientId, {
          mode: "ai",
          productId: String(input.product_id ?? ""),
          hatogStage: String(input.hatog_stage ?? ""),
          objective: typeof input.objective === "string" && input.objective ? input.objective : null,
          notes: typeof input.notes === "string" ? input.notes.slice(0, 1000) : null,
          name: null,
          creativeIds,
        });
        if (!result.ok) throw new ToolError(result.message);
        return { campaign_id: result.value.campaignId, status: "draft", note: "Internal draft only. Needs human review, approval and publishing." };
      }
      case "get_audience_definitions": {
        const audiences = await listAudiences(clientId);
        return audiences.map((a) => ({ id: a.id, name: a.name, type: a.audience_type, retention_days: a.retention_days, hatog_stage: a.hatog_stage, in_meta: Boolean(a.meta_audience_id), health: audienceHealth(a) }));
      }
      case "get_analytics": {
        const range = resolveRange(String(input.preset ?? "last_7d"));
        if (!range.ok) throw new ToolError(range.error);
        try {
          const data = await loadAnalytics(profile, clientId, range.range);
          return {
            period: { since: range.range.since, until: range.range.until, currency: data.snapshot.currency },
            account: compactMetrics(data.snapshot.account),
            top_campaigns: [...data.snapshot.campaigns].sort((a, b) => (b.spend ?? 0) - (a.spend ?? 0)).slice(0, 10).map(compactMetrics),
            note: "null = not reported by Meta (N/A).",
          };
        } catch (error) {
          throw new ToolError(error instanceof Error ? error.message : "Analytics unavailable.");
        }
      }
      case "generate_marketing_report": {
        const range = resolveRange(String(input.preset ?? "last_7d"));
        if (!range.ok) throw new ToolError(range.error);
        try {
          const { reportId, report } = await generateMarketingReport(profile, clientId, range.range);
          return { report_id: reportId, summary: report.summary, next_actions: report.next_actions };
        } catch (error) {
          throw new ToolError(error instanceof Error ? error.message : "Could not generate the report.");
        }
      }
      case "create_content_calendar": {
        const productIds = Array.isArray(input.product_ids) ? input.product_ids.map(String).filter(Boolean) : [];
        try {
          const result = await createContentCalendar(profile, clientId, {
            startDate: String(input.start_date ?? ""),
            days: Number(input.days ?? 30),
            platforms: (Array.isArray(input.platforms) ? input.platforms : []).map(String) as ContentPlatform[],
            productIds: productIds.length ? productIds : null,
            focusNotes: typeof input.focus_notes === "string" && input.focus_notes.trim() ? input.focus_notes.slice(0, 1000) : null,
          });
          return { calendar_id: result.calendarId, items: result.itemCount, note: "Items saved as drafts for human approval." };
        } catch (error) {
          throw new ToolError(error instanceof WorkflowError || error instanceof Error ? error.message : "Could not create the calendar.");
        }
      }
      case "upload_creative_to_drive": {
        const creativeId = String(input.creative_id ?? "");
        if (!isUuid(creativeId)) throw new ToolError("Invalid creative_id.");
        try {
          const result = await uploadCreativeToDrive(profile, clientId, creativeId);
          return { status: result.status, drive_url: result.webUrl };
        } catch (error) {
          throw new ToolError(error instanceof Error ? error.message : "Drive upload failed.");
        }
      }
      default:
        throw new ToolError(`Unknown tool "${name}".`);
    }
  };
}
