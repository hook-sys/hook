"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/session";
import { getClientById } from "@/lib/services/clients";
import { createClient } from "@/lib/supabase/server";
import { parseHatogStageForm, parseKnowledgeForm, parseNegativePromptForm } from "@/lib/validation/ai";
import { HATOG_STAGE_KEYS, type AiKnowledgeKey, type HatogStageKey } from "@/types/ai";

export interface AiActionState {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Partial<Record<AiKnowledgeKey, string>>;
  // Submitted values echoed back on error so React's post-action form reset doesn't wipe them.
  values?: Record<string, string>;
}

function submitted(formData: FormData): Record<string, string> {
  return Object.fromEntries(
    [...formData.entries()].filter(([k, v]) => !k.startsWith("$") && typeof v === "string") as [string, string][]
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HATOG_PATH = "/admin/ai-control/hatog";
const NEGATIVE_PROMPTS_PATH = "/admin/ai-control/negative-prompts";

export async function saveClientAiKnowledge(
  clientId: string,
  _prev: AiActionState,
  formData: FormData
): Promise<AiActionState> {
  const admin = await requireSuperAdmin();
  if (!(await getClientById(clientId))) return { status: "error", message: "Client not found." };

  const { values, errors } = parseKnowledgeForm(formData);
  if (Object.keys(errors).length > 0) {
    return { status: "error", message: "Please correct the highlighted fields.", fieldErrors: errors, values: submitted(formData) };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("client_ai_knowledge")
    .upsert({ client_id: clientId, ...values, updated_by: admin.id });
  if (error) return { status: "error", message: "Could not save the AI knowledge." };

  revalidatePath(`/admin/clients/${clientId}/knowledge`);
  revalidatePath(`/admin/clients/${clientId}`);
  return { status: "success", message: "AI knowledge saved." };
}

export async function saveHatogStage(
  key: HatogStageKey,
  _prev: AiActionState,
  formData: FormData
): Promise<AiActionState> {
  const admin = await requireSuperAdmin();
  if (!(HATOG_STAGE_KEYS as readonly string[]).includes(key)) return { status: "error", message: "Unknown stage." };

  const { values, error: validationError } = parseHatogStageForm(formData);
  if (validationError) return { status: "error", message: validationError, values: submitted(formData) };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hatog_stages")
    .update({ ...values, updated_by: admin.id })
    .eq("key", key)
    .select("key");
  if (error || !data?.length) return { status: "error", message: "Could not save the stage." };

  revalidatePath(HATOG_PATH);
  return { status: "success", message: `${values.name} saved.` };
}

export async function createNegativePrompt(_prev: AiActionState, formData: FormData): Promise<AiActionState> {
  const admin = await requireSuperAdmin();
  const parsed = parseNegativePromptForm(formData);
  if ("error" in parsed) return { status: "error", message: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase.from("negative_prompts").insert({ ...parsed, updated_by: admin.id });
  if (error) return { status: "error", message: "Could not add the rule." };

  revalidatePath(NEGATIVE_PROMPTS_PATH);
  return { status: "success", message: "Rule added." };
}

export async function updateNegativePrompt(
  id: string,
  _prev: AiActionState,
  formData: FormData
): Promise<AiActionState> {
  const admin = await requireSuperAdmin();
  if (!UUID.test(id)) return { status: "error", message: "Invalid rule." };
  const parsed = parseNegativePromptForm(formData);
  if ("error" in parsed) return { status: "error", message: parsed.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("negative_prompts")
    .update({ ...parsed, updated_by: admin.id })
    .eq("id", id)
    .select("id");
  if (error || !data?.length) return { status: "error", message: "Could not save the rule." };

  revalidatePath(NEGATIVE_PROMPTS_PATH);
  return { status: "success", message: "Saved." };
}

export async function deleteNegativePrompt(id: string): Promise<AiActionState> {
  await requireSuperAdmin();
  if (!UUID.test(id)) return { status: "error", message: "Invalid rule." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("negative_prompts").delete().eq("id", id).select("id");
  if (error || !data?.length) return { status: "error", message: "Could not delete the rule." };

  revalidatePath(NEGATIVE_PROMPTS_PATH);
  return { status: "success", message: "Deleted." };
}
