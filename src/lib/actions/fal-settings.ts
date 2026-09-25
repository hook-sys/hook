"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/session";
import { FAL_MODELS, FAL_MODES, isValidFalChoice } from "@/lib/creative/fal-models";
import { getFalModelSelection } from "@/lib/creative/fal-selection";
import { isFalModelAvailable } from "@/lib/integrations/fal";
import { getIntegration } from "@/lib/integrations/store";
import { IntegrationError } from "@/lib/integrations/types";
import { createClient } from "@/lib/supabase/server";

export interface FalSettingsState {
  status: "idle" | "error" | "success";
  message?: string;
}

// Super Admin: one Fal.ai model per generation mode. Each choice must be a registry model for
// that mode (verified input/output schema) AND be listed by fal.ai for the connected key.
export async function saveFalModelsAction(_prev: FalSettingsState, formData: FormData): Promise<FalSettingsState> {
  const admin = await requireSuperAdmin();
  const status = (await getIntegration("fal")).status;
  if (status !== "connected" && status !== "configured") return { status: "error", message: "Connect Fal.ai first." };

  const current = await getFalModelSelection();
  const rows: { mode: string; model_id: string; updated_by: string; updated_at: string }[] = [];
  for (const mode of FAL_MODES) {
    const modelId = String(formData.get(mode) ?? "");
    if (!isValidFalChoice(mode, modelId)) return { status: "error", message: `Select a supported model for ${mode}.` };
    if (modelId !== current[mode]) {
      try {
        if (!(await isFalModelAvailable(modelId))) {
          return { status: "error", message: `${FAL_MODELS[modelId].label} is not available on Fal.ai for this account.` };
        }
      } catch (error) {
        return { status: "error", message: error instanceof IntegrationError ? error.message : "Could not check Fal.ai." };
      }
    }
    rows.push({ mode, model_id: modelId, updated_by: admin.id, updated_at: new Date().toISOString() });
  }

  const supabase = await createClient();
  const { error } = await supabase.from("fal_model_settings").upsert(rows, { onConflict: "mode" });
  if (error) return { status: "error", message: "Could not save the Fal.ai models." };
  revalidatePath("/admin/settings/integrations");
  return { status: "success", message: "Fal.ai models saved. Creative Studio now uses these models." };
}
