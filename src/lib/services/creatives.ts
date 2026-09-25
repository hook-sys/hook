import type { CreativeBrief } from "@/lib/ai/creative-brief";
import type { CreativeFormat, CreativeMedia, CreativeStatus, CreativeType } from "@/lib/creative/options";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation/ids";
import type { HatogStageKey } from "@/types/ai";

export interface Creative {
  id: string;
  client_id: string;
  product_id: string;
  media: CreativeMedia;
  creative_type: CreativeType;
  hatog_stage: HatogStageKey;
  format: CreativeFormat;
  duration_seconds: number | null;
  status: CreativeStatus;
  brief: Partial<CreativeBrief>;
  prompt: string;
  negative_prompt: string | null;
  reference_image_url: string | null;
  provider: string;
  provider_model: string;
  provider_status_url: string | null;
  provider_response_url: string | null;
  asset_url: string | null;
  thumbnail_url: string | null;
  error: string | null;
  created_at: string;
  completed_at: string | null;
  drive_file_id: string | null;
  drive_web_url: string | null;
  drive_upload_status: "not_uploaded" | "uploading" | "uploaded" | "failed";
  drive_uploaded_at: string | null;
  drive_error: string | null;
}

// Caller's session: RLS limits rows to super admins or sub-admins with `content` on an
// assigned client; every query is also scoped by client_id.
export async function listCreatives(
  clientId: string,
  filters: { productId?: string; creativeType?: string; status?: string; media?: string } = {}
): Promise<Creative[]> {
  const supabase = await createClient();
  let query = supabase.from("creatives").select("*").eq("client_id", clientId).order("created_at", { ascending: false }).limit(100);
  if (filters.productId) query = query.eq("product_id", filters.productId);
  if (filters.creativeType) query = query.eq("creative_type", filters.creativeType);
  if (filters.media) query = query.eq("media", filters.media);
  query = filters.status ? query.eq("status", filters.status) : query.neq("status", "archived");
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as Creative[];
}

export async function getCreativesByIds(clientId: string, ids: string[]): Promise<Creative[]> {
  if (!isUuid(clientId) || ids.some((id) => !isUuid(id))) return [];
  if (ids.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("creatives").select("*").eq("client_id", clientId).in("id", ids);
  return (data ?? []) as Creative[];
}

export async function listGeneratingCreatives(clientId: string): Promise<Creative[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("creatives")
    .select("*")
    .eq("client_id", clientId)
    .eq("status", "generating")
    .order("created_at")
    .limit(10);
  return (data ?? []) as Creative[];
}
