"use server";

import { revalidatePath } from "next/cache";
import { requirePermission, requireSuperAdmin } from "@/lib/auth/session";
import { getMetaConnectionState, isMetaPublishingEnabled, metaGraphGet, metaGraphPost } from "@/lib/integrations/meta";
import { IntegrationError } from "@/lib/integrations/types";
import {
  AUDIENCE_RECOMMENDATIONS,
  AUDIENCE_TYPES,
  AUDIENCE_TYPE_LABELS,
  NOT_AVAILABLE_MESSAGE,
  RETENTION_DAYS,
  audienceSourceKind,
  isMetaPermissionError,
  isPixelId,
  planMetaAudience,
  type AudienceType,
} from "@/lib/meta/audiences";
import { logEvent } from "@/lib/observability";
import { getAudience } from "@/lib/services/audiences";
import { getClientMetaAssets } from "@/lib/services/client-meta-assets";
import { getClientById } from "@/lib/services/clients";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation/ids";
import { HATOG_STAGE_KEYS } from "@/types/ai";

export interface AudienceActionState {
  status: "idle" | "error" | "success";
  message?: string;
}

const audiencesPath = (clientId: string) => `/admin/clients/${clientId}/audiences`;

function readDefinition(formData: FormData) {
  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const type = get("audience_type");
  const retention = Number(get("retention_days"));
  const hatog = get("hatog_stage");
  const source = get("source");
  const name = get("name");
  const description = get("description");

  if (!name || name.length > 200) return { error: "Enter a name (max 200 characters)." };
  if (!(AUDIENCE_TYPES as readonly string[]).includes(type)) return { error: "Select an audience type." };
  if (!(RETENTION_DAYS as readonly number[]).includes(retention)) return { error: "Select a retention window." };
  if (hatog && !(HATOG_STAGE_KEYS as readonly string[]).includes(hatog)) return { error: "Invalid HATOG stage." };
  if (description.length > 1000) return { error: "Description is too long." };
  const kind = audienceSourceKind(type as AudienceType);
  if (kind === "pixel" && source && !isPixelId(source)) return { error: "The Pixel ID must be numeric." };
  return {
    value: {
      name,
      audience_type: type,
      retention_days: retention,
      hatog_stage: hatog || null,
      description: description || null,
      // Page/Instagram sources always come from the client's assignment, never the form.
      source: kind === "pixel" ? source || null : null,
    },
  };
}

export async function createAudienceDefinition(
  clientId: string,
  _prev: AudienceActionState,
  formData: FormData
): Promise<AudienceActionState> {
  const profile = await requirePermission("ai_ads");
  const client = await getClientById(clientId);
  if (!client) return { status: "error", message: "Client not found." };
  const parsed = readDefinition(formData);
  if ("error" in parsed) return { status: "error", message: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase.from("audiences").insert({ ...parsed.value, client_id: client.id, created_by: profile.id });
  if (error) return { status: "error", message: "Could not save the audience definition." };
  revalidatePath(audiencesPath(client.id));
  return { status: "success", message: "Audience definition saved (not yet created in Meta)." };
}

// Adds one of the HATOG recommendations as a draft definition.
export async function addRecommendedAudience(clientId: string, index: number): Promise<AudienceActionState> {
  const profile = await requirePermission("ai_ads");
  const rec = AUDIENCE_RECOMMENDATIONS[index];
  if (!rec?.type || !rec.retentionDays) return { status: "error", message: "This recommendation has no custom audience." };
  const client = await getClientById(clientId);
  if (!client) return { status: "error", message: "Client not found." };

  const supabase = await createClient();
  const { error } = await supabase.from("audiences").insert({
    client_id: client.id,
    name: `${AUDIENCE_TYPE_LABELS[rec.type]} ${rec.retentionDays}d — ${rec.stage.toUpperCase()}`,
    audience_type: rec.type,
    retention_days: rec.retentionDays,
    hatog_stage: rec.stage,
    description: rec.rationale,
    created_by: profile.id,
  });
  if (error) return { status: "error", message: "Could not add the definition." };
  revalidatePath(audiencesPath(client.id));
  return { status: "success", message: "Added as a draft definition." };
}

export async function updateAudienceDefinition(
  clientId: string,
  audienceId: string,
  _prev: AudienceActionState,
  formData: FormData
): Promise<AudienceActionState> {
  await requirePermission("ai_ads");
  const audience = isUuid(audienceId) ? await getAudience(clientId, audienceId) : null;
  if (!audience) return { status: "error", message: "Audience not found." };
  if (audience.meta_audience_id) return { status: "error", message: "This audience exists in Meta; edit it in Ads Manager." };
  const parsed = readDefinition(formData);
  if ("error" in parsed) return { status: "error", message: parsed.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audiences")
    .update(parsed.value)
    .eq("client_id", clientId)
    .eq("id", audienceId)
    .select("id");
  if (error || !data?.length) return { status: "error", message: "Could not save the audience." };
  revalidatePath(audiencesPath(clientId));
  return { status: "success", message: "Saved." };
}

export async function setAudienceArchived(clientId: string, audienceId: string, archived: boolean): Promise<AudienceActionState> {
  await requirePermission("ai_ads");
  const audience = isUuid(audienceId) ? await getAudience(clientId, audienceId) : null;
  if (!audience) return { status: "error", message: "Audience not found." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audiences")
    .update({ status: archived ? "archived" : "draft" })
    .eq("client_id", clientId)
    .eq("id", audienceId)
    .select("id");
  if (error || !data?.length) {
    return { status: "error", message: archived ? "Could not archive." : "Restoring is only possible for archived definitions." };
  }
  revalidatePath(audiencesPath(clientId));
  return { status: "success", message: archived ? "Archived (the Meta audience, if any, is not deleted)." : "Restored to Draft." };
}

// Super admin only. Creates the audience in the client's own ad account. Requires the
// ads_management scope, which is only requested when META_PUBLISHING_ENABLED is on.
export async function createAudienceInMeta(clientId: string, audienceId: string): Promise<AudienceActionState> {
  const profile = await requireSuperAdmin();
  const audience = isUuid(audienceId) ? await getAudience(clientId, audienceId) : null;
  if (!audience) return { status: "error", message: "Audience not found." };
  if (audience.meta_audience_id) return { status: "error", message: "This audience already exists in Meta." };
  if (audience.status !== "draft" && audience.status !== "error") return { status: "error", message: "Only draft definitions can be created in Meta." };

  const meta = await getMetaConnectionState();
  if (!meta.connected) return { status: "error", message: "Connect Meta." };
  if (!isMetaPublishingEnabled()) return { status: "error", message: NOT_AVAILABLE_MESSAGE };

  const assets = await getClientMetaAssets(clientId);
  const plan = planMetaAudience(audience, {
    adAccountId: assets?.ad_account_id ?? null,
    pageId: assets?.facebook_page_id ?? null,
    instagramId: assets?.instagram_account_id ?? null,
  });
  if (!plan.ok) return { status: "error", message: plan.error };

  const admin = createAdminClient();
  const started = Date.now();
  try {
    const created = await metaGraphPost<{ id: string }>(`/${plan.adAccountId}/customaudiences`, plan.params);
    if (!/^[0-9]+$/.test(String(created.id ?? ""))) throw new IntegrationError("Meta returned no audience ID.");
    // Recorded with the service role only after Meta returned a real ID.
    const { error } = await admin
      .from("audiences")
      .update({ meta_audience_id: String(created.id), meta_ad_account_id: plan.adAccountId, status: "active", error: null })
      .eq("client_id", clientId)
      .eq("id", audienceId);
    logEvent("info", { provider: "meta", operation: "create_custom_audience", clientId, userId: profile.id, status: "succeeded", durationMs: Date.now() - started });
    if (error) return { status: "error", message: `Created in Meta (ID ${created.id}) but saving it failed.` };
  } catch (error) {
    const raw = error instanceof IntegrationError ? error.message : "Meta request failed.";
    const message = isMetaPermissionError(raw) ? NOT_AVAILABLE_MESSAGE : raw;
    await admin.from("audiences").update({ status: "error", error: message.slice(0, 1000) }).eq("client_id", clientId).eq("id", audienceId);
    logEvent("warn", { provider: "meta", operation: "create_custom_audience", clientId, userId: profile.id, status: "failed", durationMs: Date.now() - started, error: raw });
    revalidatePath(audiencesPath(clientId));
    return { status: "error", message };
  }

  revalidatePath(audiencesPath(clientId));
  return { status: "success", message: "Created in Meta. No campaign or spend was started." };
}

interface MetaAudienceHealth {
  approximate_count_lower_bound?: number;
  approximate_count_upper_bound?: number;
  delivery_status?: { code?: number; description?: string };
  operation_status?: { code?: number; description?: string };
}

// Read-only health sync (ads_read).
export async function syncAudienceHealth(clientId: string, audienceId: string): Promise<AudienceActionState> {
  const profile = await requirePermission("ai_ads");
  const audience = isUuid(audienceId) ? await getAudience(clientId, audienceId) : null;
  if (!audience?.meta_audience_id) return { status: "error", message: "This audience is not in Meta yet." };
  if (!(await getMetaConnectionState()).connected) return { status: "error", message: "Connect Meta." };

  try {
    const health = await metaGraphGet<MetaAudienceHealth>(`/${audience.meta_audience_id}`, {
      fields: "approximate_count_lower_bound,approximate_count_upper_bound,delivery_status,operation_status",
    });
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);
    const { error } = await createAdminClient()
      .from("audiences")
      .update({
        approximate_count_lower: num(health.approximate_count_lower_bound),
        approximate_count_upper: num(health.approximate_count_upper_bound),
        delivery_status_code: typeof health.delivery_status?.code === "number" ? health.delivery_status.code : null,
        delivery_status_description: health.delivery_status?.description?.slice(0, 500) ?? null,
        operation_status_code: typeof health.operation_status?.code === "number" ? health.operation_status.code : null,
        last_synced_at: new Date().toISOString(),
      })
      .eq("client_id", clientId)
      .eq("id", audienceId);
    if (error) return { status: "error", message: "Could not save the audience status." };
  } catch (error) {
    const raw = error instanceof IntegrationError ? error.message : "Meta request failed.";
    logEvent("warn", { provider: "meta", operation: "sync_custom_audience", clientId, userId: profile.id, status: "failed", error: raw });
    return { status: "error", message: isMetaPermissionError(raw) ? NOT_AVAILABLE_MESSAGE : raw };
  }
  revalidatePath(audiencesPath(clientId));
  return { status: "success", message: "Synced from Meta." };
}
