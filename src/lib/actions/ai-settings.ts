"use server";

import { revalidatePath } from "next/cache";
import { providerReady, refreshProviderModels } from "@/lib/ai/brain";
import {
  AI_PROVIDER_LABELS,
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

// Selects the ONE provider + model used for every AI brain operation.
export async function saveAiBrainAction(_prev: AiSettingsState, formData: FormData): Promise<AiSettingsState> {
  const admin = await requireSuperAdmin();
  const provider = String(formData.get("provider") ?? "");
  const model = String(formData.get("model") ?? "");

  const supabase = await createClient();
  const { data } = await supabase.from("ai_provider_models").select("provider, model_id, display_name, is_available, supports_structured");
  const invalid = validateModelChoice(provider, model, (data ?? []) as StoredModel[]);
  if (invalid) return { status: "error", message: invalid };
  if (!(await providerReady(provider as AIProviderId))) {
    return { status: "error", message: `Connect ${AI_PROVIDER_LABELS[provider as AIProviderId]} first.` };
  }

  const { error } = await supabase
    .from("ai_brain_settings")
    .upsert(
      { id: true, default_provider: provider, default_model: model, updated_by: admin.id, updated_at: new Date().toISOString() },
      { onConflict: "id" }
    );
  if (error) return { status: "error", message: "Could not save the AI brain selection." };
  revalidatePath(PATH);
  return { status: "success", message: `AI Brain: ${AI_PROVIDER_LABELS[provider as AIProviderId]} · ${model}. All AI brain features now use this model.` };
}
