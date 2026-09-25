import { createClient } from "@/lib/supabase/server";
import type { Lead, LeadStatus } from "@/types/lead";

const PAGE_SIZE = 20;

export interface LeadListFilters {
  search?: string;
  status?: LeadStatus | "all";
  page?: number;
}

export interface LeadListResult {
  leads: Lead[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listLeads(filters: LeadListFilters): Promise<LeadListResult> {
  const supabase = await createClient();
  const page = Math.max(1, filters.page ?? 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from("leads")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }

  if (filters.search) {
    const term = filters.search.replace(/[%_]/g, "");
    query = query.or(`business_name.ilike.%${term}%,mobile.ilike.%${term}%`);
  }

  const { data, count, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return {
    leads: (data ?? []) as Lead[],
    total: count ?? 0,
    page,
    pageSize: PAGE_SIZE,
  };
}

export async function getLeadById(id: string): Promise<Lead | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("leads").select("*").eq("id", id).maybeSingle();
  return data as Lead | null;
}

export interface LeadStats {
  total: number;
  new: number;
  qualified: number;
  converted: number;
}

export async function getLeadStats(): Promise<LeadStats> {
  const supabase = await createClient();
  const [total, newCount, qualified, converted] = await Promise.all([
    supabase.from("leads").select("id", { count: "exact", head: true }),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "new"),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "qualified"),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "converted"),
  ]);

  return {
    total: total.count ?? 0,
    new: newCount.count ?? 0,
    qualified: qualified.count ?? 0,
    converted: converted.count ?? 0,
  };
}

export async function getRecentLeads(limit = 5): Promise<Lead[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []) as Lead[];
}
