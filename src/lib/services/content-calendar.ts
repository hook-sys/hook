import type {
  ContentAspectRatio,
  ContentFormat,
  ContentItemStatus,
  ContentPlatform,
  ContentType,
} from "@/lib/ai/content-calendar";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation/ids";
import type { HatogStageKey } from "@/types/ai";

export interface ContentCalendar {
  id: string;
  client_id: string;
  start_date: string;
  days: number;
  platforms: ContentPlatform[];
  focus_notes: string | null;
  model: string | null;
  created_at: string;
}

export interface ContentCalendarItem {
  id: string;
  client_id: string;
  calendar_id: string;
  product_id: string | null;
  scheduled_date: string;
  content_type: ContentType;
  platform: ContentPlatform;
  hatog_stage: HatogStageKey;
  hook: string;
  concept: string;
  caption: string;
  cta: string;
  creative_direction: string;
  suggested_format: ContentFormat;
  aspect_ratio: ContentAspectRatio;
  duration_seconds: number | null;
  status: ContentItemStatus;
  notes: string | null;
  post_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface CalendarItemFilters {
  from?: string;
  to?: string;
  productId?: string;
  hatogStage?: string;
  status?: string;
}

// Caller's session: RLS limits rows to super admins or sub-admins with `content` on an
// assigned client; every query is also scoped by client_id.
export async function listCalendarItems(clientId: string, filters: CalendarItemFilters = {}): Promise<ContentCalendarItem[]> {
  const supabase = await createClient();
  let query = supabase
    .from("content_calendar_items")
    .select("*")
    .eq("client_id", clientId)
    .order("scheduled_date")
    .order("created_at")
    .limit(500);
  if (filters.from) query = query.gte("scheduled_date", filters.from);
  if (filters.to) query = query.lte("scheduled_date", filters.to);
  if (filters.productId) query = query.eq("product_id", filters.productId);
  if (filters.hatogStage) query = query.eq("hatog_stage", filters.hatogStage);
  query = filters.status ? query.eq("status", filters.status) : query.neq("status", "archived");
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as ContentCalendarItem[];
}

export async function getCalendarItem(clientId: string, itemId: string): Promise<ContentCalendarItem | null> {
  if (!isUuid(clientId) || !isUuid(itemId)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("content_calendar_items")
    .select("*")
    .eq("client_id", clientId)
    .eq("id", itemId)
    .maybeSingle();
  return (data as ContentCalendarItem | null) ?? null;
}

export async function getCalendar(clientId: string, calendarId: string): Promise<ContentCalendar | null> {
  if (!isUuid(clientId) || !isUuid(calendarId)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("content_calendars")
    .select("*")
    .eq("client_id", clientId)
    .eq("id", calendarId)
    .maybeSingle();
  return (data as ContentCalendar | null) ?? null;
}

export async function listCalendars(clientId: string): Promise<ContentCalendar[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("content_calendars")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(20);
  return (data ?? []) as ContentCalendar[];
}
