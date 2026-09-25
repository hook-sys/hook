import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation/ids";
import type { Client } from "@/types/client";

export async function listClients(): Promise<Client[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .order("business_name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as Client[];
}

// Per-request memoized: the client layout and page both resolve the same client.
// Malformed IDs short-circuit to null (-> 404) without a query.
export const getClientById = cache(async (id: string): Promise<Client | null> => {
  if (!isUuid(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("clients").select("*").eq("id", id).maybeSingle();
  return data as Client | null;
});
