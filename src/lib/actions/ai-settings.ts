"use server";

import { revalidatePath } from "next/cache";
import { providerReady, refreshProviderModels } from "@/lib/ai/brain";
import {
  AI_PROVIDER_LABELS,
  AI_TASKS,
  isAIProvider,
  validateModelChoice,
  type AIProviderId,
  type StoredModel,
} from "@/lib/ai/providers/common";
import { requireSuperAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

// Super-admin only. All writes use the caller's session, so RLS (super admin) applies too.

export interface AiSettingsState {
  status: "idle" | "error" | "success";
  message?: string;
}

const PATH = "/admin/settings/ai";

async function loadModels(): Promise<StoredModel[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("ai_provider_models").select("provider, model_id, display_name, is_available, supports_structured");
  return (data ?? []) as StoredModel[];
}

async function checkChoice(provider: unknown, model: unknown, models: StoredModel[]): Promise<string | null> {
  const invalid = validateModelChoice(provider, model, models);
  if (invalid) return invalid;
  if (!(await providerReady(provider as AIProviderId))) return `Connect ${AI_PROVIDER_LABELS[provider as AIProviderId]} first.`;
  return null;
}

// Bound per provider for ActionButton (its extra form arguments are ignored).
export async function refreshModelsAction(provider: AIProviderId): Promise<AiSettingsState> {
  await requireSuperAdmin();
  if (!isAIProvider(provider)) return { status: "error", message: "Unknown provider." };
  try {
    const { total } = await refreshProviderModels(provider);
    revalidatePath(PATH);
    return { status: "success", message: `${total} ${AI_PROVIDER_LABELS[provider]} model(s) available.` };
  } catch (error) {
    // The stored list is left unchanged on failure.
    return { status: "error", message: error instanceof Error ? error.message : "Could not load the model list." };
  }
}

export async function saveDefaultBrainAction(_prev: AiSettingsState, formData: FormData): Promise<AiSettingsState> {
  const admin = await requireSuperAdmin();
  const provider = String(formData.get("provider") ?? "");
  const model = String(formData.get("model") ?? "");
  const error = await checkChoice(provider, model, await loadModels());
  if (error) return { status: "error", message: error };

  const supabase = await createClient();
  const now = new Date().toISOString();
  const a = await supabase
    .from("ai_provider_settings")
    .upsert({ provider, enabled: true, default_model: model, updated_by: admin.id, updated_at: now }, { onConflict: "provider" });
  const b = await supabase
    .from("ai_brain_settings")
    .upsert({ id: true, default_provider: provider, updated_by: admin.id, updated_at: now }, { onConflict: "id" });
  if (a.error || b.error) return { status: "error", message: "Could not save the default AI brain." };
  revalidatePath(PATH);
  return { status: "success", message: `Default AI brain: ${AI_PROVIDER_LABELS[provider as AIProviderId]} · ${model}.` };
}

// Task routing: "" provider = use the default provider/model for that task.
export async function saveTaskRoutingAction(_prev: AiSettingsState, formData: FormData): Promise<AiSettingsState> {
  const admin = await requireSuperAdmin();
  const models = await loadModels();
  const supabase = await createClient();
  const now = new Date().toISOString();

  const upserts: Record<string, unknown>[] = [];
  const cleared: string[] = [];
  for (const task of AI_TASKS) {
    const provider = String(formData.get(`${task}_provider`) ?? "");
    const model = String(formData.get(`${task}_model`) ?? "");
    if (!provider) {
      cleared.push(task);
      continue;
    }
    const error = await checkChoice(provider, model, models);
    if (error) return { status: "error", message: `${task.replace(/_/g, " ")}: ${error}` };
    upserts.push({ task, provider, model, enabled: true, updated_by: admin.id, updated_at: now });
  }

  if (upserts.length) {
    const { error } = await supabase.from("ai_task_models").upsert(upserts, { onConflict: "task" });
    if (error) return { status: "error", message: "Could not save task routing." };
  }
  if (cleared.length) {
    const { error } = await supabase.from("ai_task_models").delete().in("task", cleared);
    if (error) return { status: "error", message: "Could not save task routing." };
  }
  revalidatePath(PATH);
  return { status: "success", message: "Task routing saved." };
}

export async function saveFallbackAction(_prev: AiSettingsState, formData: FormData): Promise<AiSettingsState> {
  const admin = await requireSuperAdmin();
  const enabled = formData.get("fallback_enabled") === "on";
  const provider = String(formData.get("provider") ?? "");
  const model = String(formData.get("model") ?? "");

  let values: Record<string, unknown> = { fallback_enabled: false };
  if (enabled) {
    const error = await checkChoice(provider, model, await loadModels());
    if (error) return { status: "error", message: error };
    values = { fallback_enabled: true, fallback_provider: provider, fallback_model: model };
  }

  const supabase = await createClient();
  const { data: existing } = await supabase.from("ai_brain_settings").select("default_provider").maybeSingle();
  const { error } = await supabase.from("ai_brain_settings").upsert(
    { id: true, default_provider: existing?.default_provider ?? "claude", ...values, updated_by: admin.id, updated_at: new Date().toISOString() },
    { onConflict: "id" }
  );
  if (error) return { status: "error", message: "Could not save the fallback." };
  revalidatePath(PATH);
  return {
    status: "success",
    message: enabled ? `Fallback ON: ${AI_PROVIDER_LABELS[provider as AIProviderId]} · ${model} (temporary provider errors only).` : "Fallback OFF.",
  };
}
