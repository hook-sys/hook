import { buildAiContext } from "@/lib/ai/context";
import {
  buildCalendarPrompt,
  buildItemRegenerationPrompt,
  calendarSchema,
  isIsoDate,
  productRef,
  singleItemSchema,
  validateCalendar,
  validateGeneratedItem,
  type CalendarItemDraft,
  type CalendarProduct,
  type CalendarRequest,
  type ContentPlatform,
} from "@/lib/ai/content-calendar";
import { generateAndLog } from "@/lib/ai/generate";
import { hasPermission } from "@/lib/auth/session";
import { listCampaigns } from "@/lib/services/campaigns";
import { getCalendar, getCalendarItem } from "@/lib/services/content-calendar";
import { listProducts } from "@/lib/services/products";
import { createClient } from "@/lib/supabase/server";
import type { AdminProfile } from "@/types/admin";
import type { Product } from "@/types/product";

// Server-only workflows shared by the Content Calendar UI and the AI agent. Callers must
// have already checked the `content` permission; all DB access uses the caller's session.

export class WorkflowError extends Error {}

function toCalendarProduct(p: Product): CalendarProduct {
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    shortDescription: p.short_description,
    price: p.price,
    discountPrice: p.discount_price,
    currency: p.currency,
    features: p.features,
    benefits: p.benefits,
    targetCustomer: p.target_customer,
    cta: p.cta,
  };
}

async function campaignContext(profile: AdminProfile, clientId: string) {
  if (!hasPermission(profile, "campaigns")) return [];
  const campaigns = await listCampaigns(clientId);
  return campaigns
    .filter((c) => c.status !== "archived")
    .slice(0, 10)
    .map((c) => ({ name: c.name, objective: c.objective, hatogStage: c.hatog_stage, status: c.status }));
}

export interface CalendarInput {
  startDate: string;
  days: number;
  platforms: ContentPlatform[];
  productIds: string[] | null; // null = all active products
  focusNotes: string | null;
}

export function checkCalendarInput(input: CalendarInput): string | null {
  if (!isIsoDate(input.startDate)) return "Enter a valid start date.";
  if (!Number.isInteger(input.days) || input.days < 7 || input.days > 31) return "Days must be between 7 and 31.";
  if (input.platforms.length === 0 || input.platforms.some((p) => p !== "facebook" && p !== "instagram")) {
    return "Select Facebook and/or Instagram.";
  }
  if (input.productIds && input.productIds.length > 10) return "Select up to 10 products.";
  if (input.focusNotes && input.focusNotes.length > 1000) return "Focus notes are too long.";
  return null;
}

export async function createContentCalendar(
  profile: AdminProfile,
  clientId: string,
  input: CalendarInput
): Promise<{ calendarId: string; itemCount: number }> {
  const inputError = checkCalendarInput(input);
  if (inputError) throw new WorkflowError(inputError);

  const all = (await listProducts(clientId)).filter((p) => p.status !== "archived");
  const products = input.productIds ? all.filter((p) => input.productIds!.includes(p.id)) : all.slice(0, 10);
  if (input.productIds && products.length !== input.productIds.length) {
    throw new WorkflowError("One or more selected products don't belong to this client.");
  }
  if (products.length === 0) throw new WorkflowError("Add at least one product before generating a calendar.");

  const context = await buildAiContext({ clientId });
  const request: CalendarRequest = {
    startDate: input.startDate,
    days: input.days,
    platforms: input.platforms,
    focusNotes: input.focusNotes,
    products: products.map(toCalendarProduct),
    campaigns: await campaignContext(profile, clientId),
  };
  let prompt: { system: string; user: string };
  try {
    prompt = buildCalendarPrompt(context, request);
  } catch (error) {
    throw new WorkflowError(error instanceof Error ? error.message : "Could not build the calendar request.");
  }

  const result = await generateAndLog<CalendarItemDraft[]>({
    clientId,
    actorId: profile.id,
    generationType: "content_calendar",
    ...prompt,
    schema: calendarSchema(request),
    maxTokens: 24000,
    timeoutMs: 280_000,
    validate: (value) => {
      const v = validateCalendar(value, request);
      return v.ok ? { ok: true, value: v.items } : v;
    },
  });

  const supabase = await createClient();
  const { data: calendar, error } = await supabase
    .from("content_calendars")
    .insert({
      client_id: clientId,
      start_date: input.startDate,
      days: input.days,
      platforms: input.platforms,
      focus_notes: input.focusNotes,
      model: result.model,
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (error || !calendar) throw new WorkflowError("The calendar was generated, but saving it failed.");

  const { error: itemsError } = await supabase.from("content_calendar_items").insert(
    result.data.map((item) => ({ ...item, client_id: clientId, calendar_id: calendar.id, created_by: profile.id }))
  );
  if (itemsError) {
    await supabase.from("content_calendars").delete().eq("id", calendar.id);
    throw new WorkflowError("The calendar was generated, but saving its items failed.");
  }
  return { calendarId: calendar.id, itemCount: result.data.length };
}

export async function regenerateContentItem(
  profile: AdminProfile,
  clientId: string,
  itemId: string,
  instructions: string | null
): Promise<void> {
  const item = await getCalendarItem(clientId, itemId);
  if (!item) throw new WorkflowError("Calendar item not found.");
  if (!["draft", "approved"].includes(item.status)) throw new WorkflowError("Only draft or approved items can be regenerated.");
  const calendar = await getCalendar(clientId, item.calendar_id);
  if (!calendar) throw new WorkflowError("Calendar not found.");
  if (instructions && instructions.length > 500) throw new WorkflowError("Instructions are too long.");

  const products = (await listProducts(clientId)).filter((p) => p.status !== "archived" || p.id === item.product_id).slice(0, 10);
  const request: CalendarRequest = {
    startDate: calendar.start_date,
    days: calendar.days,
    platforms: calendar.platforms,
    focusNotes: calendar.focus_notes,
    products: products.map(toCalendarProduct),
    campaigns: await campaignContext(profile, clientId),
  };
  const day = Math.round((Date.parse(item.scheduled_date) - Date.parse(calendar.start_date)) / 86_400_000) + 1;
  const safeDay = Math.min(Math.max(day, 1), calendar.days);
  const refIndex = products.findIndex((p) => p.id === item.product_id);

  const context = await buildAiContext({ clientId });
  let prompt: { system: string; user: string };
  try {
    prompt = buildItemRegenerationPrompt(
      context,
      request,
      {
        day: safeDay,
        content_type: item.content_type,
        hatog_stage: item.hatog_stage,
        product_ref: refIndex >= 0 ? productRef(refIndex) : "none",
        platform: item.platform,
      },
      instructions
    );
  } catch (error) {
    throw new WorkflowError(error instanceof Error ? error.message : "Could not build the request.");
  }

  const result = await generateAndLog<CalendarItemDraft>({
    clientId,
    actorId: profile.id,
    productId: item.product_id,
    generationType: "calendar_item",
    ...prompt,
    schema: singleItemSchema(request),
    maxTokens: 4000,
    validate: (value) => {
      const v = validateGeneratedItem(value, request);
      return v.ok ? { ok: true, value: v.item } : v;
    },
  });

  // Keep the item on its original date; content changes send it back to Draft for review.
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("content_calendar_items")
    .update({ ...result.data, scheduled_date: item.scheduled_date, status: "draft" })
    .eq("client_id", clientId)
    .eq("id", itemId)
    .select("id");
  if (error || !data?.length) throw new WorkflowError("The item was regenerated, but saving it failed.");
}
