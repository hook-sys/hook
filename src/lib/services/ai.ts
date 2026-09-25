import { createClient } from "@/lib/supabase/server";
import type { ClientAiKnowledge, HatogStage, NegativePrompt } from "@/types/ai";

// Caller's session: super admins see any client; sub-admins only assigned clients.
export async function getClientAiKnowledge(clientId: string): Promise<ClientAiKnowledge | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("client_ai_knowledge").select("*").eq("client_id", clientId).maybeSingle();
  return data as ClientAiKnowledge | null;
}

// Global configuration: RLS returns rows to super admins only.
export async function listHatogStages(): Promise<HatogStage[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("hatog_stages").select("*").order("position");
  return (data ?? []) as HatogStage[];
}

export async function listNegativePrompts(): Promise<NegativePrompt[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("negative_prompts")
    .select("*")
    .order("category")
    .order("created_at");
  return (data ?? []) as NegativePrompt[];
}
