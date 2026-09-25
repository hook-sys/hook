import { cache } from "react";
import { resolveFalSelection, type FalModelSelection } from "@/lib/creative/fal-models";
import { createAdminClient } from "@/lib/supabase/admin";

// Server-only: the Fal.ai model the Super Admin selected for each generation mode. Read with
// the service role after the caller's own permission checks (sub-admins generate with it but
// can't change it). Modes without a saved choice use the registry default.
export const getFalModelSelection = cache(async (): Promise<FalModelSelection> => {
  const { data } = await createAdminClient().from("fal_model_settings").select("mode, model_id");
  return resolveFalSelection(data ?? []);
});
