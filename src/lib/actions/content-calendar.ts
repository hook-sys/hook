"use server";

import { revalidatePath } from "next/cache";
import {
  CONTENT_ASPECT_RATIOS,
  CONTENT_FORMATS,
  CONTENT_PLATFORMS,
  CONTENT_TYPES,
  VIDEO_CONTENT_FORMATS,
  canTransitionContentItem,
  isIsoDate,
  type ContentFormat,
  type ContentItemStatus,
  type ContentPlatform,
} from "@/lib/ai/content-calendar";
import { aiErrorMessage } from "@/lib/ai/generate";
import { requirePermission } from "@/lib/auth/session";
import { getCalendarItem } from "@/lib/services/content-calendar";
import { getClientById } from "@/lib/services/clients";
import { getProduct } from "@/lib/services/products";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation/ids";
import { createContentCalendar, regenerateContentItem, WorkflowError } from "@/lib/workflows/content-calendar";
import { HATOG_STAGE_KEYS } from "@/types/ai";

export interface CalendarActionState {
  status: "idle" | "error" | "success";
  message?: string;
  values?: Record<string, string>;
}

const calendarPath = (clientId: string) => `/admin/clients/${clientId}/content-calendar`;

export async function generateCalendarAction(
  clientId: string,
  _prev: CalendarActionState,
  formData: FormData
): Promise<CalendarActionState> {
  const profile = await requirePermission("content");
  const client = await getClientById(clientId);
  if (!client) return { status: "error", message: "Client not found." };

  const productIds = formData.getAll("product_ids").map(String);
  if (productIds.some((id) => !isUuid(id))) return { status: "error", message: "Invalid product selection." };
  const platforms = formData.getAll("platforms").map(String) as ContentPlatform[];

  try {
    const result = await createContentCalendar(profile, client.id, {
      startDate: String(formData.get("start_date") ?? ""),
      days: Number(formData.get("days") ?? 30),
      platforms,
      productIds: productIds.length ? productIds : null,
      focusNotes: String(formData.get("focus_notes") ?? "").trim() || null,
    });
    revalidatePath(calendarPath(client.id));
    return { status: "success", message: `Calendar created with ${result.itemCount} draft items.` };
  } catch (error) {
    return { status: "error", message: error instanceof WorkflowError ? error.message : aiErrorMessage(error, "Could not generate the calendar.") };
  }
}

export async function regenerateCalendarItemAction(
  clientId: string,
  itemId: string,
  _prev: CalendarActionState,
  formData: FormData
): Promise<CalendarActionState> {
  const profile = await requirePermission("content");
  if (!isUuid(itemId)) return { status: "error", message: "Invalid item." };
  try {
    await regenerateContentItem(profile, clientId, itemId, String(formData.get("instructions") ?? "").trim() || null);
    revalidatePath(`${calendarPath(clientId)}/${itemId}`);
    return { status: "success", message: "Item regenerated and moved to Draft for review." };
  } catch (error) {
    return { status: "error", message: error instanceof WorkflowError ? error.message : aiErrorMessage(error, "Could not regenerate the item.") };
  }
}

const EDITABLE: ContentItemStatus[] = ["draft", "approved", "scheduled", "failed"];

export async function updateCalendarItemAction(
  clientId: string,
  itemId: string,
  _prev: CalendarActionState,
  formData: FormData
): Promise<CalendarActionState> {
  await requirePermission("content");
  const item = isUuid(itemId) ? await getCalendarItem(clientId, itemId) : null;
  if (!item) return { status: "error", message: "Calendar item not found." };
  if (!EDITABLE.includes(item.status)) return { status: "error", message: "Published or archived items can't be edited." };

  const values: Record<string, string> = {};
  for (const [k, v] of formData.entries()) if (typeof v === "string" && !k.startsWith("$")) values[k] = v.trim();
  const fail = (message: string) => ({ status: "error" as const, message, values });

  if (!isIsoDate(values.scheduled_date ?? "")) return fail("Enter a valid date.");
  if (!(CONTENT_TYPES as readonly string[]).includes(values.content_type)) return fail("Select a content type.");
  if (!(CONTENT_PLATFORMS as readonly string[]).includes(values.platform)) return fail("Select a platform.");
  if (!(HATOG_STAGE_KEYS as readonly string[]).includes(values.hatog_stage)) return fail("Select a HATOG stage.");
  if (!(CONTENT_FORMATS as readonly string[]).includes(values.suggested_format)) return fail("Select a format.");
  if (!(CONTENT_ASPECT_RATIOS as readonly string[]).includes(values.aspect_ratio)) return fail("Select an aspect ratio.");

  let productId: string | null = null;
  if (values.product_id) {
    if (!isUuid(values.product_id) || !(await getProduct(clientId, values.product_id))) return fail("Select one of this client's products.");
    productId = values.product_id;
  }

  const limits: Record<string, number> = { hook: 500, concept: 1000, caption: 2200, cta: 200, creative_direction: 1500 };
  for (const [field, max] of Object.entries(limits)) {
    if (!values[field]) return fail(`${field.replace("_", " ")} is required.`);
    if (values[field].length > max) return fail(`${field.replace("_", " ")} is too long (max ${max}).`);
  }
  if ((values.notes ?? "").length > 1000) return fail("Notes are too long.");

  const isVideo = VIDEO_CONTENT_FORMATS.includes(values.suggested_format as ContentFormat);
  const duration = Number(values.duration_seconds);
  if (isVideo && (!Number.isInteger(duration) || duration < 5 || duration > 90)) return fail("Video duration must be 5-90 seconds.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("content_calendar_items")
    .update({
      scheduled_date: values.scheduled_date,
      content_type: values.content_type,
      platform: values.platform,
      product_id: productId,
      hatog_stage: values.hatog_stage,
      hook: values.hook,
      concept: values.concept,
      caption: values.caption,
      cta: values.cta,
      creative_direction: values.creative_direction,
      suggested_format: values.suggested_format,
      aspect_ratio: values.aspect_ratio,
      duration_seconds: isVideo ? duration : null,
      notes: values.notes || null,
    })
    .eq("client_id", clientId)
    .eq("id", itemId)
    .select("id");
  if (error || !data?.length) return fail("Could not save the item.");

  revalidatePath(`${calendarPath(clientId)}/${itemId}`);
  return { status: "success", message: "Saved." };
}

export async function setCalendarItemStatusAction(
  clientId: string,
  itemId: string,
  to: ContentItemStatus,
  _prev: CalendarActionState,
  formData: FormData
): Promise<CalendarActionState> {
  const profile = await requirePermission("content");
  const item = isUuid(itemId) ? await getCalendarItem(clientId, itemId) : null;
  if (!item) return { status: "error", message: "Calendar item not found." };
  if (!canTransitionContentItem(item.status, to, profile.role)) return { status: "error", message: "You can't make that status change." };

  const update: Record<string, unknown> = { status: to };
  if (to === "published") {
    // Nothing is posted automatically: a human records the live post URL.
    const postUrl = String(formData.get("post_url") ?? "").trim();
    if (!/^https:\/\/([a-z0-9-]+\.)*(facebook\.com|instagram\.com|fb\.com)\//i.test(postUrl)) {
      return { status: "error", message: "Enter the live Facebook/Instagram post URL." };
    }
    update.post_url = postUrl;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("content_calendar_items")
    .update(update)
    .eq("client_id", clientId)
    .eq("id", itemId)
    .select("id");
  if (error || !data?.length) return { status: "error", message: "Could not change the status." };

  revalidatePath(`${calendarPath(clientId)}/${itemId}`);
  revalidatePath(calendarPath(clientId));
  return { status: "success", message: "Status updated." };
}
